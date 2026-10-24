import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/timeline -- 연도별 PDB 구조 등록 추이
 * performed_on 필드에서 연도 추출 후 집계
 */
export async function GET() {
  try {
    // Direct SQL aggregation -- no pagination needed
    const rows = await query<{ year: number; count: number }>(
      `SELECT EXTRACT(YEAR FROM performed_on)::int AS year, COUNT(*)::int AS count
       FROM kbsi_structure
       WHERE performed_on IS NOT NULL
         AND EXTRACT(YEAR FROM performed_on) >= 1970
         AND EXTRACT(YEAR FROM performed_on) <= 2030
       GROUP BY year
       ORDER BY year`
    );

    let cumulative = 0;
    const timelineWithCumulative = rows.map(t => {
      cumulative += t.count;
      return { ...t, cumulative };
    });

    const total = rows.reduce((a, b) => a + b.count, 0);

    return NextResponse.json({
      timeline: timelineWithCumulative,
      total,
    }, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
