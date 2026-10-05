import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/insights — 결정화 데이터 교차 분석 인사이트
 * pH별/온도별/침전제별 성공률 + 패턴 요약
 * Cache: 10분
 */
export async function GET() {
  const supabase = createServiceClient();

  // pH 범위별 성공률
  const PH_RANGES = [
    { label: '4-5', min: 4, max: 5 },
    { label: '5-6', min: 5, max: 6 },
    { label: '6-7', min: 6, max: 7 },
    { label: '7-8', min: 7, max: 8 },
    { label: '8-9', min: 8, max: 9 },
    { label: '9-10', min: 9, max: 10 },
  ];

  const phInsights = await Promise.all(
    PH_RANGES.map(async (range) => {
      const [{ count: total }, { count: success }] = await Promise.all([
        supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
          .gte('ph', range.min).lt('ph', range.max).not('outcome', 'is', null)
          .neq('source_type', 'synthetic'),
        supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
          .gte('ph', range.min).lt('ph', range.max)
          .or('outcome.eq.diffraction_quality,outcome.eq.single_crystal')
          .neq('source_type', 'synthetic'),
      ]);
      const t = total ?? 0;
      const s = success ?? 0;
      return { range: range.label, total: t, success: s, rate: t > 0 ? Math.round(s / t * 100) : 0 };
    })
  );

  // 온도 범위별 성공률
  const TEMP_RANGES = [
    { label: '0-4°C', min: 0, max: 5 },
    { label: '15-20°C', min: 15, max: 21 },
    { label: '20-25°C', min: 21, max: 26 },
    { label: '25-37°C', min: 25, max: 38 },
  ];

  const tempInsights = await Promise.all(
    TEMP_RANGES.map(async (range) => {
      const [{ count: total }, { count: success }] = await Promise.all([
        supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
          .gte('temperature', range.min).lt('temperature', range.max).not('outcome', 'is', null)
          .neq('source_type', 'synthetic'),
        supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
          .gte('temperature', range.min).lt('temperature', range.max)
          .or('outcome.eq.diffraction_quality,outcome.eq.single_crystal')
          .neq('source_type', 'synthetic'),
      ]);
      const t = total ?? 0;
      const s = success ?? 0;
      return { range: range.label, total: t, success: s, rate: t > 0 ? Math.round(s / t * 100) : 0 };
    })
  );

  // Top 침전제별 성공률 (구조화된 것만)
  const TOP_PRECIPITANTS = ['PEG 3350', 'PEG 4000', 'PEG 8000', 'Ammonium Sulfate', 'MPD', 'PEG 6000'];

  const precipInsights = await Promise.all(
    TOP_PRECIPITANTS.map(async (precip) => {
      const [{ count: total }, { count: success }] = await Promise.all([
        supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
          .eq('precipitant_type', precip).not('outcome', 'is', null)
          .neq('source_type', 'synthetic'),
        supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
          .eq('precipitant_type', precip)
          .or('outcome.eq.diffraction_quality,outcome.eq.single_crystal')
          .neq('source_type', 'synthetic'),
      ]);
      const t = total ?? 0;
      const s = success ?? 0;
      return { precipitant: precip, total: t, success: s, rate: t > 0 ? Math.round(s / t * 100) : 0 };
    })
  );

  // 베스트 조건 찾기
  const bestPH = phInsights.filter(p => p.total > 100).sort((a, b) => b.rate - a.rate)[0];
  const bestTemp = tempInsights.filter(t => t.total > 100).sort((a, b) => b.rate - a.rate)[0];
  const bestPrecip = precipInsights.filter(p => p.total > 10).sort((a, b) => b.rate - a.rate)[0];

  const patterns = [];
  if (bestPH) patterns.push(`pH ${bestPH.range}에서 성공률 ${bestPH.rate}%로 가장 높음 (${bestPH.total.toLocaleString()}건 중)`);
  if (bestTemp) patterns.push(`${bestTemp.range}에서 성공률 ${bestTemp.rate}%로 가장 높음`);
  if (bestPrecip) patterns.push(`${bestPrecip.precipitant}이 성공률 ${bestPrecip.rate}%로 최고 (${bestPrecip.total.toLocaleString()}건)`);

  return NextResponse.json({
    phInsights,
    tempInsights,
    precipInsights,
    patterns,
    analyzedAt: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
  });
}
