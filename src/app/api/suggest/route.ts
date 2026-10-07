import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/suggest?q=kras — 검색 키워드 추천
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const supabase = createServiceClient();

  // 우선순위: abbreviation 시작 > gene_name 시작 > full_name 포함
  const [{ data: abbrMatch }, { data: geneMatch }, { data: nameMatch }] = await Promise.all([
    supabase.from('kbsi_protein').select('id, full_name, abbreviation, gene_name, organism')
      .ilike('abbreviation', `${q}%`).limit(5),
    supabase.from('kbsi_protein').select('id, full_name, abbreviation, gene_name, organism')
      .ilike('gene_name', `${q}%`).limit(5),
    supabase.from('kbsi_protein').select('id, full_name, abbreviation, gene_name, organism')
      .ilike('full_name', `%${q}%`).limit(5),
  ]);

  // 중복 제거 + 우선순위 유지
  const seen = new Set<number>();
  const merged: any[] = [];
  for (const list of [abbrMatch || [], geneMatch || [], nameMatch || []]) {
    for (const p of list) {
      if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
    }
  }

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
