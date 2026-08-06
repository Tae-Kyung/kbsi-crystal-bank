import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractFeatures, findKNearest, featuresToArray } from '@/lib/ml/features';

/**
 * 결정화 조건 추천 API
 * 입력된 조건과 유사한 과거 실험을 k-NN으로 찾아 성공 조건을 추천
 *
 * GET /api/recommend?ph=7.0&temperature=18&precipitant_type=PEG%203350&k=5
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const k = parseInt(searchParams.get('k') || '10');

  // 쿼리 조건 파싱
  const queryCondition = {
    protein_concentration: searchParams.get('protein_concentration')
      ? parseFloat(searchParams.get('protein_concentration')!)
      : null,
    precipitant_type: searchParams.get('precipitant_type') || null,
    precipitant_conc: searchParams.get('precipitant_conc')
      ? parseFloat(searchParams.get('precipitant_conc')!)
      : null,
    ph: searchParams.get('ph') ? parseFloat(searchParams.get('ph')!) : null,
    temperature: searchParams.get('temperature')
      ? parseFloat(searchParams.get('temperature')!)
      : null,
    additive: searchParams.get('additive') || null,
    outcome: null,
  };

  // DB에서 모든 결정화 데이터 fetch
  const { data, error } = await supabase
    .from('kbsi_crystallization')
    .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
    .not('outcome', 'is', null);

  const crystData = (data ?? []) as any[];

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!crystData || crystData.length === 0) {
    return NextResponse.json({
      message: 'Not enough data for recommendations',
      recommendations: [],
    });
  }

  // Feature 추출
  const queryFeatures = extractFeatures(queryCondition);
  const datasetFeatures = crystData.map((r) => extractFeatures(r));

  // k-NN 검색
  const neighbors = findKNearest(queryFeatures, datasetFeatures, k);

  // 성공 조건 집계 (outcome_rank >= 4: single_crystal 이상)
  const successNeighbors = neighbors.filter((n) => n.features.outcome_rank >= 4);
  const successRate = neighbors.length > 0 ? successNeighbors.length / neighbors.length : 0;

  // 추천 조건: 성공 이웃들의 원본 데이터에서 추출
  const recommendations = successNeighbors.map((n) => ({
    ...crystData[n.index],
    distance: n.distance,
  }));

  return NextResponse.json({
    query: queryCondition,
    k,
    total_data_points: crystData.length,
    success_rate: Math.round(successRate * 100),
    recommendations,
    nearest_neighbors: neighbors.map((n) => ({
      ...crystData[n.index],
      distance: Math.round(n.distance * 100) / 100,
    })),
  });
}
