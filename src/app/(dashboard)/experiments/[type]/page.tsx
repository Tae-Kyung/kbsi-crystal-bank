import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const EXPERIMENT_CONFIG: Record<string, { table: string; title: string; desc: string; fields: string[] }> = {
  expression: {
    table: 'kbsi_expression',
    title: 'Expression',
    desc: '발현 실험',
    fields: ['host', 'strain', 'induction_temp', 'yield_mg_l', 'result_level', 'source_db', 'source_id'],
  },
  purification: {
    table: 'kbsi_purification',
    title: 'Purification',
    desc: '정제 실험',
    fields: ['method_summary', 'final_purity', 'final_yield', 'result_level', 'source_db', 'source_id'],
  },
  crystallization: {
    table: 'kbsi_crystallization',
    title: 'Crystallization',
    desc: '결정화 실험',
    fields: ['ph', 'temperature', 'precipitant_type', 'precipitant_conc', 'outcome', 'source_type'],
  },
  characterization: {
    table: 'kbsi_characterization',
    title: 'Characterization',
    desc: '특성분석',
    fields: ['method', 'value_num', 'value_text', 'unit_normalized', 'source_db', 'source_id'],
  },
  diffraction: {
    table: 'kbsi_diffraction',
    title: 'Diffraction',
    desc: '회절 실험',
    fields: ['resolution', 'space_group', 'beamline', 'phasing', 'source_db', 'source_id'],
  },
  structure: {
    table: 'kbsi_structure',
    title: 'Structure',
    desc: '구조결정',
    fields: ['method', 'resolution', 'pdb_id', 'emdb_id'],
  },
};

export default async function ExperimentTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ page?: string; protein?: string; construct_id?: string }>;
}) {
  const { type } = await params;
  const config = EXPERIMENT_CONFIG[type];
  if (!config) return notFound();

  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const proteinFilter = sp.protein || '';
  const constructFilter = sp.construct_id || '';
  const limit = 50;
  const offset = (page - 1) * limit;

  const supabase = await createClient();

  // construct_id 필터링을 위한 construct 조회
  let filterConstructIds: number[] | null = null;
  if (proteinFilter) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matchedProteins } = await (supabase as any)
      .from('kbsi_protein')
      .select('id')
      .or(`full_name.ilike.%${proteinFilter}%,abbreviation.ilike.%${proteinFilter}%,gene_name.ilike.%${proteinFilter}%`)
      .limit(20);
    if (matchedProteins && matchedProteins.length > 0) {
      const proteinIds = matchedProteins.map((p: any) => p.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: matchedConstructs } = await (supabase as any)
        .from('kbsi_construct')
        .select('id')
        .in('protein_id', proteinIds)
        .limit(500);
      filterConstructIds = (matchedConstructs || []).map((c: any) => c.id);
    } else {
      filterConstructIds = [];
    }
  }

  // count + data 쿼리
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let countQuery = supabase.from(config.table).select('id', { count: 'exact', head: true }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dataQuery = (supabase.from(config.table) as any)
    .select('*, kbsi_construct(name, protein_id, kbsi_protein(full_name, abbreviation))');

  if (constructFilter) {
    countQuery = countQuery.eq('construct_id', parseInt(constructFilter));
    dataQuery = dataQuery.eq('construct_id', parseInt(constructFilter));
  } else if (filterConstructIds !== null) {
    if (filterConstructIds.length === 0) {
      // 매칭 없음 → 빈 결과
      filterConstructIds = [-1];
    }
    countQuery = countQuery.in('construct_id', filterConstructIds.slice(0, 100));
    dataQuery = dataQuery.in('construct_id', filterConstructIds.slice(0, 100));
  }

  const [{ count }, { data }] = await Promise.all([
    countQuery,
    dataQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
  ]);

  const totalPages = Math.ceil((count ?? 0) / limit);
  const records = (data || []) as any[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/experiments" className="text-muted-foreground hover:text-foreground text-sm">&larr; Experiments</Link>
          </div>
          <h2 className="text-2xl font-bold mt-1">{config.title}</h2>
          <p className="text-muted-foreground">{config.desc} — {(count ?? 0).toLocaleString()}건</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <form className="flex gap-2 flex-1" action={`/experiments/${type}`}>
          <input
            name="protein"
            defaultValue={proteinFilter}
            placeholder="단백질명, 유전자명으로 필터..."
            className="flex-1 max-w-sm rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {constructFilter && <input type="hidden" name="construct_id" value={constructFilter} />}
          <Button type="submit" variant="outline" size="sm">필터</Button>
          {(proteinFilter || constructFilter) && (
            <Link href={`/experiments/${type}`}>
              <Button variant="ghost" size="sm">초기화</Button>
            </Link>
          )}
        </form>
        {proteinFilter && (
          <span className="text-xs text-muted-foreground">
            &quot;{proteinFilter}&quot; 필터 적용 중
          </span>
        )}
        {constructFilter && (
          <span className="text-xs text-muted-foreground">
            Construct #{constructFilter} 필터 적용 중
          </span>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Protein</th>
              <th className="px-3 py-2 text-left font-medium">Construct</th>
              {config.fields.map(f => (
                <th key={f} className="px-3 py-2 text-left font-medium">{f.replace(/_/g, ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.map((r: any) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  {r.kbsi_construct?.kbsi_protein ? (
                    <Link href={`/proteins/${r.kbsi_construct.protein_id}`} className="text-primary hover:underline text-xs">
                      {r.kbsi_construct.kbsi_protein.abbreviation || r.kbsi_construct.kbsi_protein.full_name?.slice(0, 20)}
                    </Link>
                  ) : '-'}
                </td>
                <td className="px-3 py-2">
                  {r.kbsi_construct ? (
                    <Link href={`/constructs/${r.construct_id}`} className="text-primary hover:underline text-xs">
                      {r.kbsi_construct.name?.slice(0, 20) || `#${r.construct_id}`}
                    </Link>
                  ) : '-'}
                </td>
                {config.fields.map(f => (
                  <td key={f} className="px-3 py-2 text-xs">
                    {f === 'outcome' || f === 'result_level' || f === 'method' || f === 'source_type' || f === 'source_db' ? (
                      r[f] ? <Badge variant="outline" className="text-[10px]">{r[f]}</Badge> : '-'
                    ) : f === 'source_id' && r[f] ? (
                      r.source_db === 'PubMed' || r[f]?.startsWith('10.') ? (
                        <a href={`https://doi.org/${r[f]}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono text-[10px]">
                          {r[f].length > 25 ? r[f].slice(0, 25) + '...' : r[f]}
                          <svg className="inline-block ml-0.5 h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      ) : (
                        <span className="font-mono text-[10px]">{r[f]}</span>
                      )
                    ) : f === 'pdb_id' && r[f] ? (
                      <a href={`https://www.rcsb.org/structure/${r[f]}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono">
                        {r[f]}
                      </a>
                    ) : (
                      <span className="max-w-[150px] truncate block">{r[f] ?? '-'}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={config.fields.length + 2} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            총 {(count ?? 0).toLocaleString()}건 (페이지 {page} / {totalPages.toLocaleString()})
          </p>
          <div className="flex items-center gap-2">
            <Link href={`/experiments/${type}?page=1${proteinFilter ? `&protein=${proteinFilter}` : ''}${constructFilter ? `&construct_id=${constructFilter}` : ''}`}>
              <Button variant="outline" size="sm" disabled={page <= 1}>처음</Button>
            </Link>
            <Link href={`/experiments/${type}?page=${page - 1}${proteinFilter ? `&protein=${proteinFilter}` : ''}${constructFilter ? `&construct_id=${constructFilter}` : ''}`}>
              <Button variant="outline" size="sm" disabled={page <= 1}>이전</Button>
            </Link>
            <span className="text-sm px-2">{page} / {totalPages}</span>
            <Link href={`/experiments/${type}?page=${page + 1}${proteinFilter ? `&protein=${proteinFilter}` : ''}${constructFilter ? `&construct_id=${constructFilter}` : ''}`}>
              <Button variant="outline" size="sm" disabled={page >= totalPages}>다음</Button>
            </Link>
            <Link href={`/experiments/${type}?page=${totalPages}${proteinFilter ? `&protein=${proteinFilter}` : ''}${constructFilter ? `&construct_id=${constructFilter}` : ''}`}>
              <Button variant="outline" size="sm" disabled={page >= totalPages}>마지막</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
