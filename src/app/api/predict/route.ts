import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractFeatures, findKNearest, estimateSuccessProbability } from '@/lib/ml/features';

/**
 * 결정화 성공 확률 예측 API
 * k-NN 기반으로 주어진 조건에서의 성공 확률을 추정
 *
 * POST /api/predict
 * Body: { protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const queryCondition = {
    protein_concentration: body.protein_concentration ?? null,
    precipitant_type: body.precipitant_type ?? null,
    precipitant_conc: body.precipitant_conc ?? null,
    ph: body.ph ?? null,
    temperature: body.temperature ?? null,
    additive: body.additive ?? null,
    outcome: null,
  };

  // DB에서 검증된 결정화 데이터만 fetch
  const { data, error } = await supabase
    .from('kbsi_crystallization')
    .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
    .not('outcome', 'is', null);

  const crystData = (data ?? []) as any[];

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!crystData || crystData.length < 5) {
    return NextResponse.json({
      prediction: null,
      message: `Insufficient data (${crystData?.length ?? 0} records). Need at least 5 for prediction.`,
    });
  }

  const queryFeatures = extractFeatures(queryCondition);
  const datasetFeatures = crystData.map((r) => extractFeatures(r));

  // k 값: 데이터의 제곱근 (일반적 휴리스틱), 최소 3 최대 20
  const k = Math.max(3, Math.min(20, Math.round(Math.sqrt(crystData.length))));
  const neighbors = findKNearest(queryFeatures, datasetFeatures, k);
  const probability = estimateSuccessProbability(neighbors);

  // 각 outcome별 분포
  const outcomeDistribution: Record<string, number> = {};
  for (const n of neighbors) {
    const outcome = crystData[n.index]?.outcome || 'unknown';
    outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
  }

  // 가장 가까운 성공 사례의 조건
  const bestMatch = neighbors.find((n) => n.features.outcome_rank >= 4);

  return NextResponse.json({
    prediction: {
      success_probability: Math.round(probability * 100),
      confidence: crystData.length >= 50 ? 'high' : crystData.length >= 20 ? 'medium' : 'low',
      k_used: k,
      data_points_total: crystData.length,
    },
    outcome_distribution: outcomeDistribution,
    best_match: bestMatch
      ? { ...crystData[bestMatch.index], distance: Math.round(bestMatch.distance * 100) / 100 }
      : null,
    query: queryCondition,
  });
}
