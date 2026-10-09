import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organism = searchParams.get('organism');
  if (!organism) return NextResponse.json([]);

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('kbsi_protein')
    .select('id, full_name, full_name_normalized, abbreviation, gene_name')
    .or(`organism.eq.${organism},organism_normalized.eq.${organism}`)
    .order('abbreviation')
    .limit(200);

  // full_name_normalized 우선 사용
  const mapped = (data || []).map((p: any) => ({
    ...p,
    full_name: p.full_name_normalized || p.full_name,
  }));

  return NextResponse.json(mapped, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
