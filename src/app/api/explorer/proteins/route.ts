import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organism = searchParams.get('organism');
  if (!organism) return NextResponse.json([]);

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('kbsi_protein')
    .select('id, full_name, abbreviation, gene_name')
    .eq('organism', organism)
    .order('abbreviation')
    .limit(200);

  return NextResponse.json(data || [], {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
