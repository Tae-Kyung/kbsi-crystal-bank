import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/timeline — 연도별 PDB 구조 등록 추이
 * performed_on 필드에서 연도 추출 후 집계
 */
export async function GET() {
  const supabase = createServiceClient();

  // 페이지네이션으로 전체 데이터 수집 (Supabase 1000건 제한 우회)
  const yearCounts: Record<string, number> = {};
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data } = await supabase
      .from('kbsi_structure')
      .select('performed_on')
      .not('performed_on', 'is', null)
      .order('id')
      .range(offset, offset + PAGE - 1);

    if (!data || data.length === 0) break;

    data.forEach((s: any) => {
      const year = s.performed_on?.slice(0, 4);
      if (!year || year < '1970' || year > '2030') return;
      yearCounts[year] = (yearCounts[year] || 0) + 1;
    });

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const timeline = Object.entries(yearCounts)
    .map(([year, count]) => ({ year: parseInt(year), count }))
    .sort((a, b) => a.year - b.year);

  let cumulative = 0;
  const timelineWithCumulative = timeline.map(t => {
    cumulative += t.count;
    return { ...t, cumulative };
  });

  const total = Object.values(yearCounts).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    timeline: timelineWithCumulative,
    total,
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
