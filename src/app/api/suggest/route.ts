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

  const { data } = await supabase
    .from('kbsi_protein')
    .select('id, full_name, abbreviation, gene_name, organism')
    .or(`abbreviation.ilike.%${q}%,gene_name.ilike.%${q}%,full_name.ilike.%${q}%`)
    .limit(10);

  const suggestions = (data || []).map((p: any) => ({
    id: p.id,
    label: p.abbreviation || p.gene_name || p.full_name?.slice(0, 40),
    sub: [p.gene_name, p.organism?.slice(0, 20)].filter(Boolean).join(' · '),
    type: 'protein',
  }));

  return NextResponse.json(suggestions, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
}
