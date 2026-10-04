/**
 * 결정화 예측 모델 벤치마크
 * 22K 데이터로 k-NN 모델의 정확도를 측정
 *
 * npx tsx scripts/benchmark-prediction.ts [옵션]
 *   --sample 2000    테스트 샘플 수 (기본: 2000, 전체: --sample 0)
 *   --k 5,10,15,20   테스트할 k 값들
 *   --seed 42        랜덤 시드
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Feature Engineering (features.ts 미러) ───
const OUTCOME_RANK: Record<string, number> = {
  clear: 0, precipitate: 1, phase_separation: 2,
  microcrystal: 3, single_crystal: 4, diffraction_quality: 5,
};

const PRECIPITANT_ENCODING: Record<string, number> = {
  'PEG 3350': 1, 'PEG 4000': 2, 'PEG 6000': 3, 'PEG 8000': 4,
  'PEG 400': 5, 'PEG MME 2000': 6, 'PEG MME 5000': 7,
  'Ammonium Sulfate': 10, 'Sodium Chloride': 11, 'Lithium Sulfate': 12,
  'MPD': 20, 'Isopropanol': 21, 'Ethanol': 22,
  'Sodium Citrate': 30, 'Sodium Acetate': 31,
};

interface Record_ {
  ph: number | null;
  temperature: number | null;
  precipitant_type: string | null;
  precipitant_conc: number | null;
  protein_concentration: number | null;
  additive: string | null;
  outcome: string;
}

function toFeatureArray(r: Record_): number[] {
  const precip = r.precipitant_type?.trim() || '';
  // fuzzy match precipitant
  let precipCode = PRECIPITANT_ENCODING[precip] ?? 0;
  if (precipCode === 0) {
    for (const [key, val] of Object.entries(PRECIPITANT_ENCODING)) {
      if (precip.toLowerCase().includes(key.toLowerCase())) { precipCode = val; break; }
    }
  }
  return [
    r.protein_concentration ?? 0,
    precipCode,
    r.precipitant_conc ?? 0,
    r.ph ?? 7.0,
    r.temperature ?? 18,
    r.additive ? 1 : 0,
  ];
}

// Min-max normalization
function normalize(dataset: number[][]): { normalized: number[][]; mins: number[]; maxs: number[] } {
  const dims = dataset[0].length;
  const mins = new Array(dims).fill(Infinity);
  const maxs = new Array(dims).fill(-Infinity);
  for (const row of dataset) {
    for (let i = 0; i < dims; i++) {
      if (row[i] < mins[i]) mins[i] = row[i];
      if (row[i] > maxs[i]) maxs[i] = row[i];
    }
  }
  const normalized = dataset.map(row =>
    row.map((v, i) => (maxs[i] - mins[i]) > 0 ? (v - mins[i]) / (maxs[i] - mins[i]) : 0)
  );
  return { normalized, mins, maxs };
}

function normalizeOne(row: number[], mins: number[], maxs: number[]): number[] {
  return row.map((v, i) => (maxs[i] - mins[i]) > 0 ? (v - mins[i]) / (maxs[i] - mins[i]) : 0);
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function knnPredict(queryNorm: number[], trainNorm: number[][], trainLabels: number[], k: number): number {
  const dists: { idx: number; dist: number }[] = [];
  for (let i = 0; i < trainNorm.length; i++) {
    dists.push({ idx: i, dist: euclidean(queryNorm, trainNorm[i]) });
  }
  dists.sort((a, b) => a.dist - b.dist);
  const topK = dists.slice(0, k);

  // Majority vote (weighted by inverse distance)
  const votes: Record<number, number> = {};
  for (const { idx, dist } of topK) {
    const label = trainLabels[idx];
    const weight = dist > 0 ? 1 / dist : 100;
    votes[label] = (votes[label] || 0) + weight;
  }
  let bestLabel = 0;
  let bestWeight = -1;
  for (const [label, weight] of Object.entries(votes)) {
    if (weight > bestWeight) { bestWeight = weight; bestLabel = parseInt(label); }
  }
  return bestLabel;
}

// Shuffle array deterministically
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  const sampleSize = parseInt(getArg('sample', '2000'));
  const kValues = getArg('k', '3,5,7,10,15,20').split(',').map(Number);
  const seed = parseInt(getArg('seed', '42'));

  console.log('결정화 데이터 로드 중 (pagination)...');
  let allData: Record_[] = [];
  let offset = 0;
  const PAGE = 1000;
  const maxLoad = parseInt(getArg('maxload', '100000'));
  while (allData.length < maxLoad) {
    const { data, error } = await supabase
      .from('kbsi_crystallization')
      .select('ph, temperature, precipitant_type, precipitant_conc, protein_concentration, additive, outcome')
      .not('outcome', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('DB 오류:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allData = allData.concat(data as Record_[]);
    if (data.length < PAGE) break;
    offset += PAGE;
    if (allData.length % 10000 === 0) process.stdout.write(`  ${allData.length.toLocaleString()}건 로드...\r`);
  }
  console.log(`전체 데이터: ${allData.length.toLocaleString()}건 (outcome 있는 것만)\n`);

  // outcome 분포
  const outcomeDist: Record<string, number> = {};
  for (const r of allData) {
    outcomeDist[r.outcome] = (outcomeDist[r.outcome] || 0) + 1;
  }
  console.log('Outcome 분포:');
  for (const [outcome, count] of Object.entries(outcomeDist).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / allData.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / allData.length * 50));
    console.log(`  ${outcome.padEnd(20)} ${String(count).padStart(6)}건 (${pct.padStart(5)}%) ${bar}`);
  }

  // Feature 유효 데이터 필터 (최소 pH 또는 temperature가 있는 것)
  const validData = allData.filter(r => r.ph != null || r.temperature != null);
  console.log(`\nFeature 유효 데이터: ${validData.length}건 (pH 또는 temperature 존재)`);

  // 샘플링
  const shuffled = seededShuffle(validData, seed);
  const testSize = sampleSize > 0 ? Math.min(sampleSize, Math.floor(shuffled.length * 0.3)) : Math.floor(shuffled.length * 0.2);
  const testSet = shuffled.slice(0, testSize);
  const trainSet = shuffled.slice(testSize);

  console.log(`Train: ${trainSet.length}건, Test: ${testSet.length}건\n`);

  // Feature arrays
  const trainFeatures = trainSet.map(toFeatureArray);
  const trainOutcomes = trainSet.map(r => OUTCOME_RANK[r.outcome] ?? -1);
  const trainBinary = trainOutcomes.map(v => v >= 4 ? 1 : 0); // single_crystal 이상 = success

  const { normalized: trainNorm, mins, maxs } = normalize(trainFeatures);

  const testFeatures = testSet.map(toFeatureArray);
  const testOutcomes = testSet.map(r => OUTCOME_RANK[r.outcome] ?? -1);
  const testBinary = testOutcomes.map(v => v >= 4 ? 1 : 0);

  console.log(`Train success rate: ${(trainBinary.filter(v => v === 1).length / trainBinary.length * 100).toFixed(1)}%`);
  console.log(`Test  success rate: ${(testBinary.filter(v => v === 1).length / testBinary.length * 100).toFixed(1)}%\n`);

  // ─── Benchmark: Binary Classification (success/fail) ───
  console.log('═'.repeat(70));
  console.log('1. 이진 분류 (single_crystal 이상 = success)');
  console.log('═'.repeat(70));
  console.log(`${'k'.padStart(4)} | ${'Accuracy'.padStart(8)} | ${'Precision'.padStart(9)} | ${'Recall'.padStart(8)} | ${'F1'.padStart(8)} | ${'TP'.padStart(5)} ${'FP'.padStart(5)} ${'TN'.padStart(5)} ${'FN'.padStart(5)}`);
  console.log('─'.repeat(70));

  for (const k of kValues) {
    let tp = 0, fp = 0, tn = 0, fn = 0;

    for (let i = 0; i < testSet.length; i++) {
      const queryNorm = normalizeOne(testFeatures[i], mins, maxs);
      const pred = knnPredict(queryNorm, trainNorm, trainBinary, k);
      const actual = testBinary[i];

      if (pred === 1 && actual === 1) tp++;
      else if (pred === 1 && actual === 0) fp++;
      else if (pred === 0 && actual === 0) tn++;
      else fn++;
    }

    const accuracy = (tp + tn) / (tp + fp + tn + fn);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

    console.log(
      `${String(k).padStart(4)} | ${(accuracy * 100).toFixed(1).padStart(7)}% | ${(precision * 100).toFixed(1).padStart(8)}% | ${(recall * 100).toFixed(1).padStart(7)}% | ${(f1 * 100).toFixed(1).padStart(7)}% | ${String(tp).padStart(5)} ${String(fp).padStart(5)} ${String(tn).padStart(5)} ${String(fn).padStart(5)}`
    );
  }

  // ─── Benchmark: Multi-class (6-class outcome) ───
  console.log(`\n${'═'.repeat(70)}`);
  console.log('2. 다단계 분류 (6-class outcome)');
  console.log('═'.repeat(70));
  console.log(`${'k'.padStart(4)} | ${'Accuracy'.padStart(8)} | ${'±1 Acc'.padStart(8)} | ${'±2 Acc'.padStart(8)} | ${'MAE'.padStart(6)}`);
  console.log('─'.repeat(70));

  for (const k of kValues) {
    let exact = 0, within1 = 0, within2 = 0, totalError = 0;

    for (let i = 0; i < testSet.length; i++) {
      const queryNorm = normalizeOne(testFeatures[i], mins, maxs);
      const pred = knnPredict(queryNorm, trainNorm, trainOutcomes, k);
      const actual = testOutcomes[i];
      const diff = Math.abs(pred - actual);

      if (diff === 0) exact++;
      if (diff <= 1) within1++;
      if (diff <= 2) within2++;
      totalError += diff;
    }

    const n = testSet.length;
    console.log(
      `${String(k).padStart(4)} | ${(exact / n * 100).toFixed(1).padStart(7)}% | ${(within1 / n * 100).toFixed(1).padStart(7)}% | ${(within2 / n * 100).toFixed(1).padStart(7)}% | ${(totalError / n).toFixed(2).padStart(6)}`
    );
  }

  // ─── Feature importance (ablation) ───
  console.log(`\n${'═'.repeat(70)}`);
  console.log('3. Feature 중요도 (Ablation — k=10 이진분류)');
  console.log('═'.repeat(70));

  const featureNames = ['protein_conc', 'precipitant_type', 'precipitant_conc', 'pH', 'temperature', 'additive'];
  const k = 10;

  // baseline
  let baseTP = 0, baseTN = 0;
  for (let i = 0; i < testSet.length; i++) {
    const queryNorm = normalizeOne(testFeatures[i], mins, maxs);
    const pred = knnPredict(queryNorm, trainNorm, trainBinary, k);
    if (pred === testBinary[i]) { if (pred === 1) baseTP++; else baseTN++; }
  }
  const baselineAcc = (baseTP + baseTN) / testSet.length;
  console.log(`Baseline (all features): ${(baselineAcc * 100).toFixed(1)}%\n`);

  for (let fi = 0; fi < featureNames.length; fi++) {
    // Zero out feature fi
    const ablatedTrain = trainFeatures.map(r => r.map((v, j) => j === fi ? 0 : v));
    const ablatedTest = testFeatures.map(r => r.map((v, j) => j === fi ? 0 : v));
    const { normalized: ablTrainNorm, mins: ablMins, maxs: ablMaxs } = normalize(ablatedTrain);

    let correct = 0;
    for (let i = 0; i < testSet.length; i++) {
      const qNorm = normalizeOne(ablatedTest[i], ablMins, ablMaxs);
      const pred = knnPredict(qNorm, ablTrainNorm, trainBinary, k);
      if (pred === testBinary[i]) correct++;
    }
    const ablAcc = correct / testSet.length;
    const drop = baselineAcc - ablAcc;
    const bar = drop > 0 ? '▼'.repeat(Math.round(drop * 200)) : '▲'.repeat(Math.round(-drop * 200));
    console.log(`  ${featureNames[fi].padEnd(18)} ${(ablAcc * 100).toFixed(1).padStart(6)}% (${drop > 0 ? '-' : '+'}${(Math.abs(drop) * 100).toFixed(1)}%) ${bar}`);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log('벤치마크 완료');
  console.log('═'.repeat(70));
}

main().catch(console.error);
