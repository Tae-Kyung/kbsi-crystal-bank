import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query, queryOne, scalar } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil } from 'lucide-react';
import { ProteinNetwork } from '@/components/charts/protein-network';

export default async function ProteinDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const proteinId = parseInt(id);

  const protein = await queryOne<any>(
    'SELECT * FROM kbsi_protein WHERE id = $1',
    [proteinId]
  );

  if (!protein) return notFound();

  const [dbIds, constructs] = await Promise.all([
    query<any>('SELECT * FROM kbsi_database_id WHERE protein_id = $1', [proteinId]),
    query<any>('SELECT * FROM kbsi_construct WHERE protein_id = $1', [proteinId]),
  ]);

  // Experiment counts for this protein's constructs
  const constructIds = constructs.map((c: any) => c.id);
  let crystSummary = { total: 0, success: 0, failure: 0 };
  let exprCount = 0, purifCount = 0, charCount = 0, crystCount = 0, diffrCount = 0, structCount = 0;
  let ligandBindings: any[] = [];
  if (constructIds.length > 0) {
    const placeholders = constructIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    const [totalCryst, successCryst, ec, pc, cc, dc, sc, bindings] = await Promise.all([
      scalar<number>(`SELECT COUNT(*) FROM kbsi_crystallization WHERE construct_id IN (${placeholders})`, constructIds),
      scalar<number>(`SELECT COUNT(*) FROM kbsi_crystallization WHERE construct_id IN (${placeholders}) AND outcome IN ('diffraction_quality','single_crystal')`, constructIds),
      scalar<number>(`SELECT COUNT(*) FROM kbsi_expression WHERE construct_id IN (${placeholders})`, constructIds),
      scalar<number>(`SELECT COUNT(*) FROM kbsi_purification WHERE construct_id IN (${placeholders})`, constructIds),
      scalar<number>(`SELECT COUNT(*) FROM kbsi_characterization WHERE construct_id IN (${placeholders})`, constructIds),
      scalar<number>(`SELECT COUNT(*) FROM kbsi_diffraction WHERE construct_id IN (${placeholders})`, constructIds),
      scalar<number>(`SELECT COUNT(*) FROM kbsi_structure WHERE construct_id IN (${placeholders})`, constructIds),
      query<any>(
        `SELECT cl.id, cl.binding_kd, cl.binding_ic50, cl.source_db, cl.source_id,
                l.id AS ligand_id, l.name AS ligand_name, l.smiles AS ligand_smiles, l.mw AS ligand_mw, l.source_db AS ligand_source_db, l.source_id AS ligand_source_id,
                c.id AS construct_id, c.name AS construct_name
         FROM kbsi_construct_ligand cl
         LEFT JOIN kbsi_ligand l ON l.id = cl.ligand_id
         LEFT JOIN kbsi_construct c ON c.id = cl.construct_id
         WHERE cl.construct_id IN (${placeholders})
         LIMIT 50`,
        constructIds
      ),
    ]);
    crystSummary = { total: Number(totalCryst) ?? 0, success: Number(successCryst) ?? 0, failure: (Number(totalCryst) ?? 0) - (Number(successCryst) ?? 0) };
    exprCount = Number(ec) ?? 0;
    purifCount = Number(pc) ?? 0;
    charCount = Number(cc) ?? 0;
    crystCount = Number(totalCryst) ?? 0;
    diffrCount = Number(dc) ?? 0;
    structCount = Number(sc) ?? 0;
    // Reshape ligandBindings to match the old nested structure
    ligandBindings = bindings.map((b: any) => ({
      id: b.id,
      binding_kd: b.binding_kd,
      binding_ic50: b.binding_ic50,
      source_db: b.source_db,
      source_id: b.source_id,
      construct_id: b.construct_id,
      kbsi_ligand: { id: b.ligand_id, name: b.ligand_name, smiles: b.ligand_smiles, mw: b.ligand_mw, source_db: b.ligand_source_db, source_id: b.ligand_source_id },
      kbsi_construct: { id: b.construct_id, name: b.construct_name },
    }));
  }
  const successRate = crystSummary.total > 0 ? Math.round((crystSummary.success / crystSummary.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {protein.abbreviation || protein.full_name}
          </h2>
          <p className="text-muted-foreground">{protein.full_name}</p>
        </div>
        <Link href={`/proteins/${id}/edit`}>
          <Button variant="outline">
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Gene" value={protein.gene_name} />
            <Row label="Organism" value={protein.organism} italic />
            <Row label="Owner" value={protein.owner} />
            <Row label="Custom ID" value={protein.custom_id} />
            <Row label="Updated" value={new Date(protein.updated_at).toLocaleString('ko-KR')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">External Database IDs</CardTitle>
          </CardHeader>
          <CardContent>
            {dbIds.length > 0 ? (
              <div className="space-y-2">
                {dbIds.map((d: any) => {
                  const url = getExternalDbUrl(d.db_name, d.db_value);
                  return (
                    <div key={d.id} className="flex items-center gap-2">
                      <Badge variant="outline">{d.db_name}</Badge>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-primary hover:underline">
                          {d.db_value}
                          <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      ) : (
                        <span className="text-sm font-mono">{d.db_value}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No external IDs registered.</p>
            )}

            {/* 추가 외부 링크 */}
            <div className="mt-4 pt-3 border-t space-y-2">
              <p className="text-xs font-medium text-muted-foreground">External Resources</p>
              <div className="flex flex-wrap gap-2">
                {protein.gene_name && (
                  <a href={`https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(protein.gene_name + ' AND ' + (protein.organism || 'human') + '[Organism]')}`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950">NCBI Gene</Badge>
                  </a>
                )}
                {protein.gene_name && (
                  <a href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(protein.gene_name)}+AND+crystallization`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-green-50 dark:hover:bg-green-950">PubMed</Badge>
                  </a>
                )}
                {getUniProtId(dbIds) && (
                  <a href={`https://alphafold.ebi.ac.uk/entry/${getUniProtId(dbIds)}`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-950">AlphaFold</Badge>
                  </a>
                )}
                {getUniProtId(dbIds) && (
                  <a href={`https://www.ebi.ac.uk/interpro/protein/UniProt/${getUniProtId(dbIds)}/`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950">InterPro</Badge>
                  </a>
                )}
                {protein.gene_name && (
                  <a href={`https://string-db.org/cgi/network?identifier=${encodeURIComponent(protein.gene_name)}&species=9606`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-red-50 dark:hover:bg-red-950">STRING</Badge>
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Network */}
      <Card>
        <CardHeader><CardTitle className="text-base">Data Overview</CardTitle></CardHeader>
        <CardContent>
          <ProteinNetwork
            proteinName={protein.abbreviation || protein.gene_name || protein.full_name}
            constructCount={constructs.length}
            counts={{
              expression: exprCount,
              purification: purifCount,
              characterization: charCount,
              crystallization: crystCount,
              diffraction: diffrCount,
              structure: structCount,
              ligands: ligandBindings.length,
            }}
          />
        </CardContent>
      </Card>

      {/* Crystallization Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crystallization Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-lg font-semibold">
            {crystSummary.total} trials across {constructs.length} constructs
            {crystSummary.total > 0 && (
              <span className="text-muted-foreground font-normal">
                {' '}&mdash; {crystSummary.success} successful ({successRate}%)
              </span>
            )}
          </p>

          {crystSummary.total > 0 && (
            <div className="w-full h-4 rounded-full overflow-hidden bg-red-200 dark:bg-red-900 flex">
              <div
                className="h-full bg-green-500 dark:bg-green-600 transition-all"
                style={{ width: `${successRate}%` }}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Link href={`/experiments/crystallization?${constructs.length === 1 ? `construct_id=${constructs[0].id}` : `protein=${encodeURIComponent(protein.abbreviation || protein.gene_name || protein.full_name)}`}`}>
              <Button variant="outline" size="sm">View All Conditions</Button>
            </Link>
            <Link href="/benchmark">
              <Button variant="outline" size="sm">Predict New Condition</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Quick Experiment Links */}
      <Card>
        <CardHeader><CardTitle className="text-base">Explore Data</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Expression', slug: 'expression', icon: '🧪', count: exprCount },
              { label: 'Purification', slug: 'purification', icon: '🔬', count: purifCount },
              { label: 'Characterization', slug: 'characterization', icon: '📊', count: charCount },
              { label: 'Crystallization', slug: 'crystallization', icon: '💎', count: crystSummary.total },
              { label: 'Diffraction', slug: 'diffraction', icon: '📡', count: diffrCount },
              { label: 'Structure', slug: 'structure', icon: '🏗️', count: structCount },
            ].map(exp => {
              // construct_id로 정확 필터 (이름 검색은 동명 단백질 포함 위험)
              const filterParam = constructs.length === 1
                ? `construct_id=${constructs[0].id}`
                : `construct_id=${constructs.map((c: any) => c.id).join(',')}`;
              return (
                <Link key={exp.slug} href={`/experiments/${exp.slug}?${filterParam}`}>
                  <Button variant={exp.count > 0 ? 'outline' : 'ghost'} size="sm" className={`gap-1.5 ${exp.count === 0 ? 'opacity-50' : ''}`}>
                    <span>{exp.icon}</span> {exp.label}
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{exp.count.toLocaleString()}</Badge>
                  </Button>
                </Link>
              );
            })}
            <a href={`https://www.rcsb.org/search?request=%7B%22query%22%3A%7B%22type%22%3A%22terminal%22%2C%22service%22%3A%22full_text%22%2C%22parameters%22%3A%7B%22value%22%3A%22${encodeURIComponent(protein.abbreviation || protein.full_name)}%22%7D%7D%2C%22return_type%22%3A%22entry%22%7D`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                🏛️ RCSB PDB Search
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Ligand Bindings */}
      {ligandBindings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ligand Bindings ({ligandBindings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Ligand</th>
                    <th className="px-3 py-2 text-left font-medium">Construct</th>
                    <th className="px-3 py-2 text-left font-medium">Kd</th>
                    <th className="px-3 py-2 text-left font-medium">IC50</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ligandBindings.map((b: any) => {
                    const ligand = b.kbsi_ligand;
                    const lSource = ligand?.source_db;
                    const lId = ligand?.source_id;
                    const lUrl = lSource === 'ChEMBL' && lId ? `https://www.ebi.ac.uk/chembl/compound_report_card/${lId}/` : lSource === 'PDB' && lId ? `https://www.rcsb.org/ligand/${lId}` : null;
                    return (
                      <tr key={b.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-xs">
                          {lUrl ? (
                            <a href={lUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono font-bold">{lId}</a>
                          ) : (
                            <span className="font-mono font-bold">{lId || '-'}</span>
                          )}
                          {ligand?.name && lId !== ligand.name && (
                            <span className="text-muted-foreground ml-1 text-[10px]" title={ligand.name}>
                              {ligand.name.length > 30 ? ligand.name.slice(0, 30) + '...' : ligand.name}
                            </span>
                          )}
                          {ligand?.mw && <span className="text-muted-foreground ml-1">({ligand.mw.toFixed(0)} Da)</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <Link href={`/constructs/${b.kbsi_construct?.id}`} className="text-primary hover:underline">
                            {b.kbsi_construct?.name?.slice(0, 20) || `#${b.construct_id}`}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono">{b.binding_kd ? `${b.binding_kd.toLocaleString()} nM` : '-'}</td>
                        <td className="px-3 py-2 text-xs font-mono">{b.binding_ic50 ? `${b.binding_ic50.toLocaleString()} nM` : '-'}</td>
                        <td className="px-3 py-2 text-xs">
                          {b.source_db && <Badge variant="outline" className="text-[10px]">{b.source_db}</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Constructs ({constructs.length})
          </CardTitle>
          <Link href={`/constructs/new?protein_id=${id}`}>
            <Button size="sm">Add Construct</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {constructs.length > 0 ? (
            <div className="divide-y">
              {constructs.map((c: any) => (
                <Link
                  key={c.id}
                  href={`/constructs/${c.id}`}
                  className="flex items-center justify-between py-3 hover:bg-accent/50 px-2 rounded-md transition-colors"
                >
                  <div>
                    <span className="font-medium">{c.name || `Construct #${c.id}`}</span>
                    {c.residues && (
                      <span className="text-sm text-muted-foreground ml-2">({c.residues})</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {c.construct_type && (
                      <Badge variant="secondary">{c.construct_type}</Badge>
                    )}
                    {c.expression_system && (
                      <Badge variant="outline">{c.expression_system}</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No constructs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getExternalDbUrl(dbName: string, dbValue: string): string | null {
  switch (dbName) {
    case 'UniProt': return `https://www.uniprot.org/uniprot/${dbValue}`;
    case 'AlphaFold': return `https://alphafold.ebi.ac.uk/entry/${dbValue}`;
    case 'NCBI Gene': return `https://www.ncbi.nlm.nih.gov/gene/${dbValue}`;
    case 'PDB': return `https://www.rcsb.org/structure/${dbValue}`;
    default: return null;
  }
}

function getUniProtId(dbIds: any[]): string | null {
  const up = dbIds.find((d: any) => d.db_name === 'UniProt');
  return up?.db_value || null;
}

function Row({ label, value, italic }: { label: string; value?: string | null; italic?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={italic ? 'italic' : ''}>{value || '-'}</span>
    </div>
  );
}
