import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/timeline — 연도별 PDB 구조 등록 추이
 */
export async function GET() {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('kbsi_structure')
    .select('performed_on')
    .not('performed_on', 'is', null)
    .order('performed_on')
    .limit(50000);

  if (!data || data.length === 0) {
    return NextResponse.json({ timeline: [] });
  }

  // 연도별 집계
  const yearCounts: Record<string, { total: number }> = {};
  data.forEach((s: any) => {
    const year = s.performed_on?.slice(0, 4);
    if (!year || year < '1970' || year > '2030') return;
    if (!yearCounts[year]) yearCounts[year] = { total: 0 };
    yearCounts[year].total++;
  });

  const timeline = Object.entries(yearCounts)
    .map(([year, v]) => ({ year: parseInt(year), count: v.total }))
    .sort((a, b) => a.year - b.year);

  // 누적
  let cumulative = 0;
  const timelineWithCumulative = timeline.map(t => {
    cumulative += t.count;
    return { ...t, cumulative };
  });

  return NextResponse.json({
    timeline: timelineWithCumulative,
    total: data.length,
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
