import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = createServiceClient();

  // 상위 100 종 (단백질 수 기준)
  const organisms: Record<string, number> = {};
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_protein')
      .select('organism')
      .not('organism', 'is', null)
      .range(offset, offset + 4999);
    if (!data || data.length === 0) break;
    data.forEach((p: any) => { organisms[p.organism] = (organisms[p.organism] || 0) + 1; });
    if (data.length < 5000) break;
    offset += 5000;
  }

  const sorted = Object.entries(organisms)
    .map(([organism, count]) => ({ organism, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);

  return NextResponse.json(sorted, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
