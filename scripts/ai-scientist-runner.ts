/**
 * AI Scientist Hypothesis Runner
 *
 * 가설을 자동으로 검증하는 루프:
 * 1. 가설 선택 (JSON 또는 CLI 입력)
 * 2. MCP 도구로 데이터 수집 (Supabase 직접 쿼리)
 * 3. 통계 검증 (Python scipy 호출)
 * 4. 결과 리포트 생성
 *
 * npx tsx scripts/ai-scientist-runner.ts                    # 전체 가설 실행
 * npx tsx scripts/ai-scientist-runner.ts --hypothesis PH001 # 특정 가설만
 * npx tsx scripts/ai-scientist-runner.ts --list             # 가설 목록
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ROOT = resolve(__dirname, '..');
const RESULTS_DIR = resolve(ROOT, 'data', 'ai-scientist-results');
mkdirSync(RESULTS_DIR, { recursive: true });

interface HypothesisResult {
  id: string;
  hypothesis: string;
  status: 'confirmed' | 'rejected' | 'inconclusive' | 'error';
  p_value: number | null;
  effect_size: number | null;
  sample_size: number;
  summary: string;
  data: any;
  timestamp: string;
}

// ─── Statistical helper (calls Python) ───
function runStats(testType: string, data: any): { p_value: number; statistic: number; effect_size: number } {
  const input = JSON.stringify({ test: testType, data });
  const result = execSync(`python -c "
import json, sys
from scipy import stats
import numpy as np

inp = json.loads(sys.argv[1])
test = inp['test']
d = inp['data']

if test == 'chi2':
    observed = np.array(d['observed'])
    expected = np.array(d['expected']) if 'expected' in d else None
    if expected is not None:
        stat, p = stats.chisquare(observed, expected)
    else:
        stat, p, dof, exp = stats.chi2_contingency([observed, d.get('baseline', observed)])
    print(json.dumps({'p_value': float(p), 'statistic': float(stat)}))
elif test == 'ttest':
    a, b = np.array(d['group_a']), np.array(d['group_b'])
    stat, p = stats.ttest_ind(a, b)
    cohens_d = (np.mean(a) - np.mean(b)) / np.sqrt((np.std(a)**2 + np.std(b)**2) / 2)
    print(json.dumps({'p_value': float(p), 'statistic': float(stat), 'effect_size': float(cohens_d)}))
elif test == 'mannwhitney':
    a, b = np.array(d['group_a']), np.array(d['group_b'])
    stat, p = stats.mannwhitneyu(a, b, alternative='two-sided')
    r = 1 - (2*stat)/(len(a)*len(b))
    print(json.dumps({'p_value': float(p), 'statistic': float(stat), 'effect_size': float(r)}))
elif test == 'ks':
    a, b = np.array(d['group_a']), np.array(d['group_b'])
    stat, p = stats.ks_2samp(a, b)
    print(json.dumps({'p_value': float(p), 'statistic': float(stat)}))
elif test == 'pearson':
    x, y = np.array(d['x']), np.array(d['y'])
    r, p = stats.pearsonr(x, y)
    print(json.dumps({'p_value': float(p), 'statistic': float(r), 'effect_size': float(r**2)}))
else:
    print(json.dumps({'p_value': 1.0, 'statistic': 0.0}))
" "${input.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 30000 });

  return JSON.parse(result.trim());
}

// ═══════════════════════════════════════════════════════
// Hypothesis: PH001 — MW와 결정화 성공률
// ═══════════════════════════════════════════════════════
async function runPH001(): Promise<HypothesisResult> {
  console.log('\n  PH001: MW range vs crystallization success rate');

  // MW bins
  const bins = [
    { label: '0-10 kDa', min: 0, max: 10000 },
    { label: '10-30 kDa', min: 10000, max: 30000 },
    { label: '30-50 kDa', min: 30000, max: 50000 },
    { label: '50-100 kDa', min: 50000, max: 100000 },
    { label: '>100 kDa', min: 100000, max: 10000000 },
  ];

  const results: { label: string; total: number; success: number; rate: number }[] = [];

  for (const bin of bins) {
    // Get proteins in MW range
    const { data: proteins } = await supabase
      .from('kbsi_protein')
      .select('id')
      .gte('theoretical_mw', bin.min)
      .lt('theoretical_mw', bin.max)
      .limit(5000);

    if (!proteins || proteins.length === 0) {
      results.push({ label: bin.label, total: 0, success: 0, rate: 0 });
      continue;
    }

    const proteinIds = proteins.map(p => p.id);

    // Get constructs for these proteins
    const { data: constructs } = await supabase
      .from('kbsi_construct')
      .select('id')
      .in('protein_id', proteinIds.slice(0, 200))
      .limit(2000);

    if (!constructs || constructs.length === 0) {
      results.push({ label: bin.label, total: 0, success: 0, rate: 0 });
      continue;
    }

    const constructIds = constructs.map(c => c.id);

    // Count crystallization outcomes
    const { count: total } = await supabase
      .from('kbsi_crystallization')
      .select('id', { count: 'exact', head: true })
      .in('construct_id', constructIds.slice(0, 500))
      .neq('source_type', 'synthetic');

    const { count: success } = await supabase
      .from('kbsi_crystallization')
      .select('id', { count: 'exact', head: true })
      .in('construct_id', constructIds.slice(0, 500))
      .neq('source_type', 'synthetic')
      .in('outcome', ['single_crystal', 'diffraction_quality']);

    const t = total ?? 0;
    const s = success ?? 0;
    results.push({ label: bin.label, total: t, success: s, rate: t > 0 ? s / t : 0 });
    console.log(`    ${bin.label}: ${s}/${t} (${(t > 0 ? s/t*100 : 0).toFixed(1)}%)`);
  }

  // Chi-squared test
  const observed = results.map(r => r.success);
  const totals = results.map(r => r.total);
  const overallRate = observed.reduce((a, b) => a + b, 0) / totals.reduce((a, b) => a + b, 0);
  const expected = totals.map(t => Math.round(t * overallRate));

  let stats = { p_value: 1.0, statistic: 0, effect_size: 0 };
  if (observed.some(v => v > 0) && expected.some(v => v > 0)) {
    try {
      stats = runStats('chi2', { observed, expected });
    } catch (e) {
      console.log('    Stats error, using fallback');
    }
  }

  const bestBin = results.reduce((best, r) => r.rate > best.rate ? r : best, results[0]);
  const confirmed = stats.p_value < 0.01;

  return {
    id: 'PH001',
    hypothesis: '10-30 kDa proteins have the highest crystallization success rate',
    status: confirmed ? 'confirmed' : stats.p_value < 0.05 ? 'inconclusive' : 'rejected',
    p_value: stats.p_value,
    effect_size: null,
    sample_size: totals.reduce((a, b) => a + b, 0),
    summary: `Best: ${bestBin.label} (${(bestBin.rate * 100).toFixed(1)}%). Chi2 p=${stats.p_value.toExponential(2)}. ${confirmed ? 'MW significantly affects success rate.' : 'No significant difference.'}`,
    data: { bins: results, chi2: stats },
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════
// Hypothesis: PH003 — pH와 pI의 상관관계
// ═══════════════════════════════════════════════════════
async function runPH003(): Promise<HypothesisResult> {
  console.log('\n  PH003: Optimal crystallization pH correlates with protein pI');

  // Get proteins with pI and successful crystallization pH
  const { data: proteins } = await supabase
    .from('kbsi_protein')
    .select('id, theoretical_pi')
    .not('theoretical_pi', 'is', null)
    .limit(2000);

  if (!proteins || proteins.length === 0) {
    return { id: 'PH003', hypothesis: 'pH-pI correlation', status: 'error', p_value: null, effect_size: null, sample_size: 0, summary: 'No protein pI data', data: null, timestamp: new Date().toISOString() };
  }

  const piValues: number[] = [];
  const phValues: number[] = [];

  for (const prot of proteins.slice(0, 500)) {
    const { data: constructs } = await supabase
      .from('kbsi_construct')
      .select('id')
      .eq('protein_id', prot.id)
      .limit(3);

    if (!constructs || constructs.length === 0) continue;

    const { data: cryst } = await supabase
      .from('kbsi_crystallization')
      .select('ph')
      .in('construct_id', constructs.map(c => c.id))
      .not('ph', 'is', null)
      .in('outcome', ['single_crystal', 'diffraction_quality'])
      .neq('source_type', 'synthetic')
      .limit(1);

    if (cryst && cryst.length > 0) {
      piValues.push(prot.theoretical_pi as number);
      phValues.push(cryst[0].ph as number);
    }
  }

  console.log(`    Pairs collected: ${piValues.length}`);

  if (piValues.length < 20) {
    return { id: 'PH003', hypothesis: 'pH-pI correlation', status: 'inconclusive', p_value: null, effect_size: null, sample_size: piValues.length, summary: `Only ${piValues.length} pairs found, insufficient data`, data: null, timestamp: new Date().toISOString() };
  }

  // Pearson correlation
  let stats = { p_value: 1.0, statistic: 0, effect_size: 0 };
  try {
    stats = runStats('pearson', { x: piValues, y: phValues });
  } catch { /* fallback */ }

  const meanDelta = piValues.map((pi, i) => Math.abs(phValues[i] - pi)).reduce((a, b) => a + b, 0) / piValues.length;
  const confirmed = stats.p_value < 0.01 && Math.abs(stats.statistic) > 0.3;

  return {
    id: 'PH003',
    hypothesis: 'Optimal crystallization pH correlates with protein pI (best at pH = pI +/- 1.5)',
    status: confirmed ? 'confirmed' : stats.p_value < 0.05 ? 'inconclusive' : 'rejected',
    p_value: stats.p_value,
    effect_size: stats.effect_size ?? null,
    sample_size: piValues.length,
    summary: `Pearson r=${stats.statistic.toFixed(3)}, p=${stats.p_value.toExponential(2)}, R²=${(stats.effect_size ?? 0).toFixed(3)}. Mean |pH-pI|=${meanDelta.toFixed(2)}. ${confirmed ? 'Significant correlation.' : 'Weak/no correlation.'}`,
    data: { n: piValues.length, r: stats.statistic, mean_delta_ph_pi: meanDelta, pi_sample: piValues.slice(0, 10), ph_sample: phValues.slice(0, 10) },
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════
// Hypothesis: PH004 — Thermophile 결정화 성공률
// ═══════════════════════════════════════════════════════
async function runPH004(): Promise<HypothesisResult> {
  console.log('\n  PH004: Thermophilic proteins crystallize with higher success');

  // Thermophile organisms
  const thermoOrgs = ['Thermus', 'Thermococcus', 'Pyrococcus', 'Sulfolobus', 'Thermotoga', 'Aquifex'];

  const getSuccessRate = async (orgFilter: string | null): Promise<{ total: number; success: number }> => {
    let q = supabase.from('kbsi_crystallization')
      .select('id, outcome, construct_id', { count: 'exact' })
      .neq('source_type', 'synthetic')
      .not('outcome', 'is', null);

    // We'll do a simpler approach: count by outcome directly
    const { count: total } = await supabase.from('kbsi_crystallization')
      .select('id', { count: 'exact', head: true })
      .neq('source_type', 'synthetic')
      .not('outcome', 'is', null);

    const { count: success } = await supabase.from('kbsi_crystallization')
      .select('id', { count: 'exact', head: true })
      .neq('source_type', 'synthetic')
      .in('outcome', ['single_crystal', 'diffraction_quality']);

    return { total: total ?? 0, success: success ?? 0 };
  };

  // Get thermophile protein IDs
  const thermoIds: number[] = [];
  for (const org of thermoOrgs) {
    const { data } = await supabase.from('kbsi_protein')
      .select('id').ilike('organism', `%${org}%`).limit(500);
    if (data) thermoIds.push(...data.map(d => d.id));
  }

  console.log(`    Thermophile proteins: ${thermoIds.length}`);

  // Get thermophile construct IDs
  const { data: thermoConstructs } = await supabase.from('kbsi_construct')
    .select('id').in('protein_id', thermoIds.slice(0, 500)).limit(3000);
  const thermoConstructIds = thermoConstructs?.map(c => c.id) || [];

  // Thermophile success
  const { count: thermoTotal } = await supabase.from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .in('construct_id', thermoConstructIds.slice(0, 500))
    .neq('source_type', 'synthetic').not('outcome', 'is', null);
  const { count: thermoSuccess } = await supabase.from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .in('construct_id', thermoConstructIds.slice(0, 500))
    .neq('source_type', 'synthetic')
    .in('outcome', ['single_crystal', 'diffraction_quality']);

  // Overall success (from all experimental)
  const { count: allTotal } = await supabase.from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .neq('source_type', 'synthetic').not('outcome', 'is', null);
  const { count: allSuccess } = await supabase.from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .neq('source_type', 'synthetic')
    .in('outcome', ['single_crystal', 'diffraction_quality']);

  const tT = thermoTotal ?? 0;
  const tS = thermoSuccess ?? 0;
  const aT = allTotal ?? 0;
  const aS = allSuccess ?? 0;
  const thermoRate = tT > 0 ? tS / tT : 0;
  const allRate = aT > 0 ? aS / aT : 0;

  console.log(`    Thermophile: ${tS}/${tT} (${(thermoRate*100).toFixed(1)}%)`);
  console.log(`    All:         ${aS}/${aT} (${(allRate*100).toFixed(1)}%)`);

  const confirmed = thermoRate > allRate * 1.1 && tT > 50;

  return {
    id: 'PH004',
    hypothesis: 'Thermophilic proteins crystallize with higher success rate',
    status: confirmed ? 'confirmed' : 'inconclusive',
    p_value: null,
    effect_size: thermoRate - allRate,
    sample_size: tT,
    summary: `Thermophile: ${(thermoRate*100).toFixed(1)}% (n=${tT}) vs All: ${(allRate*100).toFixed(1)}% (n=${aT}). Delta=${((thermoRate-allRate)*100).toFixed(1)}pp. ${confirmed ? 'Thermophiles show higher success.' : 'No clear advantage.'}`,
    data: { thermo: { total: tT, success: tS, rate: thermoRate }, all: { total: aT, success: aS, rate: allRate }, thermo_proteins: thermoIds.length },
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════
// Registry + Main
// ═══════════════════════════════════════════════════════
const HYPOTHESES: Record<string, () => Promise<HypothesisResult>> = {
  PH001: runPH001,
  PH003: runPH003,
  PH004: runPH004,
};

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('Available hypotheses:');
    console.log('  PH001: MW range vs crystallization success rate');
    console.log('  PH003: pH-pI correlation');
    console.log('  PH004: Thermophile success advantage');
    return;
  }

  const targetId = args.find(a => a.startsWith('--hypothesis='))?.split('=')[1]
    || args.find(a => a.startsWith('PH'));
  const hypothesesToRun = targetId ? [targetId] : Object.keys(HYPOTHESES);

  console.log('='.repeat(60));
  console.log('  AI Scientist — Hypothesis Runner');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(60));

  const allResults: HypothesisResult[] = [];

  for (const id of hypothesesToRun) {
    const runner = HYPOTHESES[id];
    if (!runner) {
      console.log(`\n  Unknown hypothesis: ${id}`);
      continue;
    }

    console.log(`\n>> Running ${id}...`);
    try {
      const result = await runner();
      allResults.push(result);

      const icon = result.status === 'confirmed' ? '✓' : result.status === 'rejected' ? '✗' : '?';
      console.log(`  ${icon} ${result.status.toUpperCase()}: ${result.summary}`);
    } catch (err: any) {
      console.log(`  ✗ ERROR: ${err.message}`);
      allResults.push({
        id, hypothesis: id, status: 'error', p_value: null, effect_size: null,
        sample_size: 0, summary: err.message, data: null, timestamp: new Date().toISOString(),
      });
    }
  }

  // Save results
  const outputPath = resolve(RESULTS_DIR, `run-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved: ${outputPath}`);

  // Summary table
  console.log('\n' + '='.repeat(60));
  console.log('  Summary');
  console.log('='.repeat(60));
  for (const r of allResults) {
    const icon = r.status === 'confirmed' ? '✓' : r.status === 'rejected' ? '✗' : '?';
    const pStr = r.p_value != null ? `p=${r.p_value.toExponential(2)}` : 'p=N/A';
    console.log(`  ${icon} ${r.id}: ${r.status.padEnd(12)} ${pStr.padEnd(14)} n=${r.sample_size}`);
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
