import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/suggest?q=kras — 통합 키워드 검색 추천
 * kbsi_search_keywords 테이블 우선, fallback으로 kbsi_protein 직접 검색
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const supabase = createServiceClient();

  // 1. 통합 키워드 테이블에서 검색 (trigram index)
  const { data: kwResults } = await supabase
    .from('kbsi_search_keywords')
    .select('keyword, type, entity_id, frequency')
    .ilike('keyword', `${q}%`)
    .order('frequency', { ascending: false })
    .limit(15);

  if (kwResults && kwResults.length > 0) {
    // 검색 로그 저장
    supabase.from('kbsi_search_log').insert({ query: q, result_count: kwResults.length }).then(() => {});

    const suggestions = kwResults.map((k: any) => ({
      id: k.entity_id,
      label: k.keyword,
      sub: k.type === 'gene_name' ? 'Gene' : k.type === 'abbreviation' ? 'Protein' : k.type === 'organism' ? 'Organism' : k.type === 'precipitant' ? 'Precipitant' : k.type === 'host' ? 'Expression System' : k.type === 'pdb_id' ? 'PDB' : k.type,
      type: k.type,
    }));

    return NextResponse.json(suggestions, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }

  // 2. Fallback: kbsi_protein 직접 검색
  const [{ data: abbrMatch }, { data: geneMatch }, { data: nameMatch }] = await Promise.all([
    supabase.from('kbsi_protein').select('id, full_name, abbreviation, gene_name, organism')
      .ilike('abbreviation', `${q}%`).limit(5),
    supabase.from('kbsi_protein').select('id, full_name, abbreviation, gene_name, organism')
      .ilike('gene_name', `${q}%`).limit(5),
    supabase.from('kbsi_protein').select('id, full_name, abbreviation, gene_name, organism')
      .ilike('full_name', `%${q}%`).limit(5),
  ]);

  const seen = new Set<number>();
  const merged: any[] = [];
  for (const list of [abbrMatch || [], geneMatch || [], nameMatch || []]) {
    for (const p of list) {
      if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
    }
  }

  // 검색 로그
  supabase.from('kbsi_search_log').insert({ query: q, result_count: merged.length }).then(() => {});

  const suggestions = merged.slice(0, 10).map((p: any) => ({
    id: p.id,
    label: p.abbreviation || p.gene_name || p.full_name?.slice(0, 40),
    sub: [p.gene_name, p.organism?.slice(0, 20)].filter(Boolean).join(' · '),
    type: 'protein',
  }));

  return NextResponse.json(suggestions, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
}
