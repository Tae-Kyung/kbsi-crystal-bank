import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/insights — 결정화 데이터 교차 분석 인사이트
 * 순차 실행으로 DB 부하 방지 (38개 동시 → 순차)
 * Cache: 10분
 */
export async function GET() {
  const supabase = createServiceClient();

  const count = async (filters: { col: string; min?: number; max?: number; eq?: string }, successOnly?: boolean) => {
    let q = supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }) as any;
    if (filters.min !== undefined) q = q.gte(filters.col, filters.min);
    if (filters.max !== undefined) q = q.lt(filters.col, filters.max);
    if (filters.eq !== undefined) q = q.eq(filters.col, filters.eq);
    if (successOnly) q = q.or('outcome.eq.diffraction_quality,outcome.eq.single_crystal');
    const { count: c } = await q;
    return c ?? 0;
  };

  // pH — 순차 실행
  const PH_RANGES = [
    { label: '3-4', min: 3, max: 4 },
    { label: '4-5', min: 4, max: 5 },
    { label: '5-6', min: 5, max: 6 },
    { label: '6-7', min: 6, max: 7 },
    { label: '7-8', min: 7, max: 8 },
    { label: '8-9', min: 8, max: 9 },
    { label: '9-10', min: 9, max: 10 },
  ];

  const phInsights = [];
  for (const range of PH_RANGES) {
    const total = await count({ col: 'ph', min: range.min, max: range.max });
    const success = await count({ col: 'ph', min: range.min, max: range.max }, true);
    phInsights.push({ range: range.label, total, success, rate: total > 0 ? Math.round(success / total * 100) : 0 });
  }

  // Temperature — 순차 실행
  const TEMP_RANGES = [
    { label: '0-4°C', min: 0, max: 5 },
    { label: '4-10°C', min: 5, max: 11 },
    { label: '15-20°C', min: 15, max: 21 },
    { label: '20-25°C', min: 21, max: 26 },
    { label: '25-37°C', min: 25, max: 38 },
  ];

  const tempInsights = [];
  for (const range of TEMP_RANGES) {
    const total = await count({ col: 'temperature', min: range.min, max: range.max });
    const success = await count({ col: 'temperature', min: range.min, max: range.max }, true);
    tempInsights.push({ range: range.label, total, success, rate: total > 0 ? Math.round(success / total * 100) : 0 });
  }

  // Precipitant — 순차 실행
  const TOP_PRECIPITANTS = ['PEG 3350', 'PEG 4000', 'PEG 8000', 'Ammonium Sulfate', 'MPD', 'PEG 6000'];

  const precipInsights = [];
  for (const precip of TOP_PRECIPITANTS) {
    const total = await count({ col: 'precipitant_type', eq: precip });
    const success = await count({ col: 'precipitant_type', eq: precip }, true);
    precipInsights.push({ precipitant: precip, total, success, rate: total > 0 ? Math.round(success / total * 100) : 0 });
  }

  // 패턴
  const bestPH = phInsights.filter(p => p.total > 100).sort((a, b) => b.rate - a.rate)[0];
  const bestTemp = tempInsights.filter(t => t.total > 100).sort((a, b) => b.rate - a.rate)[0];
  const bestPrecip = precipInsights.filter(p => p.total > 10).sort((a, b) => b.rate - a.rate)[0];
  const worstPH = phInsights.filter(p => p.total > 100).sort((a, b) => a.rate - b.rate)[0];

  const patterns = [];
  if (bestPH) patterns.push(`pH ${bestPH.range}에서 성공률 ${bestPH.rate}%로 가장 높음 (${bestPH.total.toLocaleString()}건)`);
  if (worstPH && worstPH.rate < (bestPH?.rate ?? 0)) patterns.push(`pH ${worstPH.range}에서 성공률 ${worstPH.rate}%로 가장 낮음`);
  if (bestTemp) patterns.push(`${bestTemp.range}에서 성공률 ${bestTemp.rate}%로 가장 높음`);
  if (bestPrecip) patterns.push(`${bestPrecip.precipitant}이 성공률 ${bestPrecip.rate}%로 최고 (${bestPrecip.total.toLocaleString()}건)`);

  return NextResponse.json({
    phInsights, tempInsights, precipInsights, patterns,
    analyzedAt: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
  });
}
