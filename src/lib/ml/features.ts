/**
 * ML Feature Engineering
 * 결정화 데이터를 ML 학습용 feature vector로 변환
 */

import { CRYSTALLIZATION_OUTCOME_RANK } from '@/types/database';

export interface CrystallizationFeatures {
  protein_concentration: number | null;
  precipitant_type_encoded: number;
  precipitant_conc: number | null;
  ph: number | null;
  temperature: number | null;
  has_additive: number;
  outcome_rank: number;
}

// 주요 침전제 → 정수 인코딩
const PRECIPITANT_ENCODING: Record<string, number> = {
  'PEG 3350': 1, 'PEG 4000': 2, 'PEG 6000': 3, 'PEG 8000': 4,
  'PEG 400': 5, 'PEG MME 2000': 6, 'PEG MME 5000': 7,
  'Ammonium Sulfate': 10, 'Sodium Chloride': 11, 'Lithium Sulfate': 12,
  'MPD': 20, 'Isopropanol': 21, 'Ethanol': 22,
  'Sodium Citrate': 30, 'Sodium Acetate': 31,
};

/**
 * 단일 결정화 레코드 → feature vector
 */
export function extractFeatures(record: {
  protein_concentration?: number | null;
  precipitant_type?: string | null;
  precipitant_conc?: number | null;
  ph?: number | null;
  temperature?: number | null;
  additive?: string | null;
  outcome?: string | null;
}): CrystallizationFeatures {
  const precipitantKey = record.precipitant_type?.trim() || '';
  const precipitantEncoded = PRECIPITANT_ENCODING[precipitantKey] ?? 0;

  const outcomeRank =
    record.outcome && record.outcome in CRYSTALLIZATION_OUTCOME_RANK
      ? CRYSTALLIZATION_OUTCOME_RANK[record.outcome as keyof typeof CRYSTALLIZATION_OUTCOME_RANK]
      : -1;

  return {
    protein_concentration: record.protein_concentration ?? null,
    precipitant_type_encoded: precipitantEncoded,
    precipitant_conc: record.precipitant_conc ?? null,
    ph: record.ph ?? null,
    temperature: record.temperature ?? null,
    has_additive: record.additive ? 1 : 0,
    outcome_rank: outcomeRank,
  };
}

/**
 * feature vector를 숫자 배열로 변환 (null → 0)
 */
export function featuresToArray(f: CrystallizationFeatures): number[] {
  return [
    f.protein_concentration ?? 0,
    f.precipitant_type_encoded,
    f.precipitant_conc ?? 0,
    f.ph ?? 7.0,
    f.temperature ?? 18,
    f.has_additive,
  ];
}

/**
 * 유클리드 거리 계산
 */
export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * k-NN: 쿼리 조건과 가장 유사한 k개의 결정화 레코드 찾기
 */
export function findKNearest(
  query: CrystallizationFeatures,
  dataset: CrystallizationFeatures[],
  k: number
): { index: number; distance: number; features: CrystallizationFeatures }[] {
  const queryArr = featuresToArray(query);

  const distances = dataset.map((item, index) => ({
    index,
    distance: euclideanDistance(queryArr, featuresToArray(item)),
    features: item,
  }));

  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, k);
}

/**
 * 성공 확률 추정: k-NN 이웃 중 성공(single_crystal 이상) 비율
 */
export function estimateSuccessProbability(
  neighbors: { features: CrystallizationFeatures }[]
): number {
  if (neighbors.length === 0) return 0;
  const successCount = neighbors.filter((n) => n.features.outcome_rank >= 4).length; // single_crystal 이상
  return successCount / neighbors.length;
}
