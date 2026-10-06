import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LigandFormDialog } from '@/components/forms/ligand-form-dialog';

export default async function LigandsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; protein?: string; mw_max?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const search = sp.search || '';
  const proteinFilter = sp.protein || '';
  const mwMax = sp.mw_max ? parseFloat(sp.mw_max) : null;
  const tab = sp.tab || 'ligands';
  const limit = 50;
  const offset = (page - 1) * limit;

  const supabase = await createClient();

  // Stats
  const [{ count: ligandCount }, { count: bindingCount }] = await Promise.all([
    supabase.from('kbsi_ligand').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_construct_ligand').select('id', { count: 'exact', head: true }),
  ]);

  // Build filter params string
  const filterParts = [
    search ? `search=${encodeURIComponent(search)}` : '',
    proteinFilter ? `protein=${encodeURIComponent(proteinFilter)}` : '',
    mwMax ? `mw_max=${mwMax}` : '',
  ].filter(Boolean);
  const filterStr = filterParts.length > 0 ? `&${filterParts.join('&')}` : '';

  if (tab === 'bindings') {
    // === Bindings tab ===
    let bCountQuery = supabase
      .from('kbsi_construct_ligand')
      .select('id', { count: 'exact', head: true }) as any;
    let bDataQuery = supabase
      .from('kbsi_construct_ligand')
      .select('id, binding_kd, binding_ic50, source_db, source_id, kbsi_ligand(id, name, mw, source_db, source_id), kbsi_construct(id, name, kbsi_protein(id, full_name, abbreviation))') as any;

    // protein filter for bindings
    if (proteinFilter) {
      const { data: matchedProteins } = await (supabase as any)
        .from('kbsi_protein')
        .select('id')
        .or(`full_name.ilike.%${proteinFilter}%,abbreviation.ilike.%${proteinFilter}%,gene_name.ilike.%${proteinFilter}%`)
        .limit(20);
      if (matchedProteins && matchedProteins.length > 0) {
        const pIds = matchedProteins.map((p: any) => p.id);
        const { data: matchedConstructs } = await (supabase as any)
          .from('kbsi_construct').select('id').in('protein_id', pIds).limit(500);
        const cIds = (matchedConstructs || []).map((c: any) => c.id);
        if (cIds.length > 0) {
          bCountQuery = bCountQuery.in('construct_id', cIds.slice(0, 100));
          bDataQuery = bDataQuery.in('construct_id', cIds.slice(0, 100));
        } else {
          bCountQuery = bCountQuery.in('construct_id', [-1]);
          bDataQuery = bDataQuery.in('construct_id', [-1]);
        }
      }
    }

    const [{ count: bCount }, { data: bindings }] = await Promise.all([
      bCountQuery,
      bDataQuery.order('id', { ascending: false }).range(offset, offset + limit - 1),
    ]);

    const bTotalPages = Math.ceil((bCount ?? 0) / limit);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Ligands & Bindings</h2>
            <p className="text-muted-foreground">
              {(ligandCount ?? 0).toLocaleString()} ligands · {(bindingCount ?? 0).toLocaleString()} bindings
            </p>
          </div>
          <LigandFormDialog />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <Link href={`/ligands?tab=ligands${filterStr}`}>
            <Button variant="ghost" size="sm">Ligands</Button>
          </Link>
          <Link href={`/ligands?tab=bindings${filterStr}`}>
            <Button variant="default" size="sm">Bindings ({(bindingCount ?? 0).toLocaleString()})</Button>
          </Link>
        </div>

        {/* Protein filter */}
        <form className="flex gap-2" action="/ligands">
          <input type="hidden" name="tab" value="bindings" />
          <input
            name="protein"
            defaultValue={proteinFilter}
            placeholder="단백질명/유전자명으로 필터..."
            className="flex-1 max-w-sm rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button type="submit" variant="outline" size="sm">필터</Button>
          {proteinFilter && (
            <Link href="/ligands?tab=bindings"><Button variant="ghost" size="sm">초기화</Button></Link>
          )}
        </form>

        {/* Bindings table */}
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Protein</th>
                <th className="px-3 py-2 text-left font-medium">Construct</th>
                <th className="px-3 py-2 text-left font-medium">Ligand</th>
                <th className="px-3 py-2 text-left font-medium">MW</th>
                <th className="px-3 py-2 text-left font-medium">Kd (nM)</th>
                <th className="px-3 py-2 text-left font-medium">IC50 (nM)</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(bindings || []).map((b: any) => {
                const lig = b.kbsi_ligand;
                const con = b.kbsi_construct;
                const prot = con?.kbsi_protein;
                const lUrl = lig?.source_db === 'ChEMBL' && lig?.source_id ? `https://www.ebi.ac.uk/chembl/compound_report_card/${lig.source_id}/` : lig?.source_db === 'PDB' && lig?.source_id ? `https://www.rcsb.org/ligand/${lig.source_id}` : null;
                return (
                  <tr key={b.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs">
                      {prot ? <Link href={`/proteins/${prot.id}`} className="text-primary hover:underline">{prot.abbreviation || prot.full_name?.slice(0, 20)}</Link> : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {con ? <Link href={`/constructs/${con.id}`} className="text-primary hover:underline">{con.name?.slice(0, 15) || `#${con.id}`}</Link> : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {lUrl ? <a href={lUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{lig?.name?.slice(0, 25)}</a> : (lig?.name?.slice(0, 25) || '-')}
                    </td>
                    <td className="px-3 py-2 text-xs">{lig?.mw ? `${lig.mw.toFixed(0)}` : '-'}</td>
                    <td className="px-3 py-2 text-xs font-mono">{b.binding_kd ? b.binding_kd.toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-xs font-mono">{b.binding_ic50 ? b.binding_ic50.toLocaleString() : '-'}</td>
                    <td className="px-3 py-2 text-xs">{b.source_db ? <Badge variant="outline" className="text-[10px]">{b.source_db}</Badge> : '-'}</td>
                  </tr>
                );
              })}
              {(!bindings || bindings.length === 0) && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {bTotalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">총 {(bCount ?? 0).toLocaleString()}건 (페이지 {page} / {bTotalPages.toLocaleString()})</p>
            <div className="flex items-center gap-2">
              <Link href={`/ligands?tab=bindings&page=1${filterStr}`}><Button variant="outline" size="sm" disabled={page <= 1}>처음</Button></Link>
              <Link href={`/ligands?tab=bindings&page=${page - 1}${filterStr}`}><Button variant="outline" size="sm" disabled={page <= 1}>이전</Button></Link>
              <span className="text-sm px-2">{page} / {bTotalPages.toLocaleString()}</span>
              <Link href={`/ligands?tab=bindings&page=${page + 1}${filterStr}`}><Button variant="outline" size="sm" disabled={page >= bTotalPages}>다음</Button></Link>
              <Link href={`/ligands?tab=bindings&page=${bTotalPages}${filterStr}`}><Button variant="outline" size="sm" disabled={page >= bTotalPages}>마지막</Button></Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  // === Ligands tab (default) ===
  let countQuery = supabase.from('kbsi_ligand').select('id', { count: 'exact', head: true }) as any;
  let dataQuery = supabase.from('kbsi_ligand')
    .select('*, kbsi_construct_ligand(kbsi_construct(id, name, protein_id, kbsi_protein(id, abbreviation, full_name)))') as any;

  if (search) {
    countQuery = countQuery.or(`name.ilike.%${search}%,source_id.ilike.%${search}%`);
    dataQuery = dataQuery.or(`name.ilike.%${search}%,source_id.ilike.%${search}%`);
  }
  if (mwMax) {
    countQuery = countQuery.lte('mw', mwMax);
    dataQuery = dataQuery.lte('mw', mwMax);
  }

  const [{ count: filteredCount }, { data: ligands }] = await Promise.all([
    countQuery,
    dataQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
  ]);

  const totalPages = Math.ceil((filteredCount ?? 0) / limit);

  // protein filter (client-side for ligands since it's through join)
  let filteredLigands = ligands ?? [];
  if (proteinFilter) {
    const pf = proteinFilter.toLowerCase();
    filteredLigands = filteredLigands.filter((l: any) => {
      const bindings = l.kbsi_construct_ligand || [];
      return bindings.some((b: any) => {
        const p = b.kbsi_construct?.kbsi_protein;
        return p && ((p.full_name || '').toLowerCase().includes(pf) || (p.abbreviation || '').toLowerCase().includes(pf));
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Ligands & Bindings</h2>
          <p className="text-muted-foreground">
            {(ligandCount ?? 0).toLocaleString()} ligands · {(bindingCount ?? 0).toLocaleString()} bindings
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/export/ligands?${filterParts.join('&')}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">CSV Export</Button>
          </a>
          <LigandFormDialog />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Link href={`/ligands?tab=ligands${filterStr}`}>
          <Button variant="default" size="sm">Ligands ({(ligandCount ?? 0).toLocaleString()})</Button>
        </Link>
        <Link href={`/ligands?tab=bindings${filterStr}`}>
          <Button variant="ghost" size="sm">Bindings ({(bindingCount ?? 0).toLocaleString()})</Button>
        </Link>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-2" action="/ligands">
        <input type="hidden" name="tab" value="ligands" />
        <input
          name="search"
          defaultValue={search}
          placeholder="리간드 이름, ID 검색..."
          className="flex-1 min-w-[200px] max-w-sm rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          name="protein"
          defaultValue={proteinFilter}
          placeholder="타겟 단백질 필터..."
          className="w-40 rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          name="mw_max"
          defaultValue={mwMax ?? ''}
          placeholder="MW ≤ (Da)"
          type="number"
          className="w-28 rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button type="submit" variant="outline" size="sm">필터</Button>
        {(search || proteinFilter || mwMax) && (
          <Link href="/ligands"><Button variant="ghost" size="sm">초기화</Button></Link>
        )}
      </form>

      {/* Ligands table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Target</th>
              <th className="px-3 py-2 text-left font-medium">MW</th>
              <th className="px-3 py-2 text-left font-medium">SMILES</th>
              <th className="px-3 py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-left font-medium">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredLigands.map((l: any) => {
              const lUrl = l.source_db === 'ChEMBL' && l.source_id ? `https://www.ebi.ac.uk/chembl/compound_report_card/${l.source_id}/` : l.source_db === 'PDB' && l.source_id ? `https://www.rcsb.org/ligand/${l.source_id}` : null;
              const target = (l.kbsi_construct_ligand || []).find((b: any) => b.kbsi_construct?.kbsi_protein)?.kbsi_construct?.kbsi_protein;
              return (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs">
                    {lUrl ? <a href={lUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{l.name?.slice(0, 30)}</a> : <span className="font-medium">{l.name?.slice(0, 30)}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {target ? <Link href={`/proteins/${target.id}`} className="text-primary hover:underline">{target.abbreviation || target.full_name?.slice(0, 15)}</Link> : '-'}
                  </td>
                  <td className="px-3 py-2 text-xs">{l.mw ? l.mw.toFixed(0) : '-'}</td>
                  <td className="px-3 py-2 text-xs font-mono max-w-[200px] truncate" title={l.smiles || ''}>{l.smiles ? (l.smiles.length > 30 ? l.smiles.slice(0, 30) + '...' : l.smiles) : '-'}</td>
                  <td className="px-3 py-2 text-xs">{l.source_db ? <Badge variant="outline" className="text-[10px]">{l.source_db}</Badge> : '-'}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex gap-1">
                      {lUrl && <a href={lUrl} target="_blank" rel="noopener noreferrer"><Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-blue-50">{l.source_db}</Badge></a>}
                      {l.smiles && <a href={`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(l.smiles)}&input_type=smiles`} target="_blank" rel="noopener noreferrer"><Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-green-50">PubChem</Badge></a>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredLigands.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">총 {(filteredCount ?? 0).toLocaleString()}건 (페이지 {page} / {totalPages.toLocaleString()})</p>
          <div className="flex items-center gap-2">
            <Link href={`/ligands?tab=ligands&page=1${filterStr}`}><Button variant="outline" size="sm" disabled={page <= 1}>처음</Button></Link>
            <Link href={`/ligands?tab=ligands&page=${page - 1}${filterStr}`}><Button variant="outline" size="sm" disabled={page <= 1}>이전</Button></Link>
            <span className="text-sm px-2">{page} / {totalPages.toLocaleString()}</span>
            <Link href={`/ligands?tab=ligands&page=${page + 1}${filterStr}`}><Button variant="outline" size="sm" disabled={page >= totalPages}>다음</Button></Link>
            <Link href={`/ligands?tab=ligands&page=${totalPages}${filterStr}`}><Button variant="outline" size="sm" disabled={page >= totalPages}>마지막</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
