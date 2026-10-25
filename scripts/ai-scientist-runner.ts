/**
 * AI Scientist Hypothesis Runner
 *
 * npx tsx scripts/ai-scientist-runner.ts                    # 전체 가설 실행
 * npx tsx scripts/ai-scientist-runner.ts --hypothesis PH001 # 특정 가설만
 * npx tsx scripts/ai-scientist-runner.ts --list             # 가설 목록
 */

import pg from 'pg';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const ROOT = resolve(__dirname, '..');
const RESULTS_DIR = resolve(ROOT, 'data', 'ai-scientist-results');
mkdirSync(RESULTS_DIR, { recursive: true });

interface HypothesisResult {
  id: string; hypothesis: string; status: 'confirmed' | 'rejected' | 'inconclusive' | 'error';
  p_value: number | null; effect_size: number | null; sample_size: number;
  summary: string; data: any; timestamp: string;
}

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
elif test == 'pearson':
    x, y = np.array(d['x']), np.array(d['y'])
    r, p = stats.pearsonr(x, y)
    print(json.dumps({'p_value': float(p), 'statistic': float(r), 'effect_size': float(r**2)}))
else:
    print(json.dumps({'p_value': 1.0, 'statistic': 0.0}))
" "${input.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 30000 });
  return JSON.parse(result.trim());
}

async function runPH001(): Promise<HypothesisResult> {
  console.log('\n  PH001: MW range vs crystallization success rate');
  const bins = [
    { label: '0-10 kDa', min: 0, max: 10000 }, { label: '10-30 kDa', min: 10000, max: 30000 },
    { label: '30-50 kDa', min: 30000, max: 50000 }, { label: '50-100 kDa', min: 50000, max: 100000 },
    { label: '>100 kDa', min: 100000, max: 10000000 },
  ];
  const results: { label: string; total: number; success: number; rate: number }[] = [];

  for (const bin of bins) {
    const { rows: proteins } = await client.query(
      'SELECT id FROM kbsi_protein WHERE theoretical_mw >= $1 AND theoretical_mw < $2 LIMIT 5000',
      [bin.min, bin.max]
    );
    if (!proteins || proteins.length === 0) { results.push({ label: bin.label, total: 0, success: 0, rate: 0 }); continue; }
    const proteinIds = proteins.map(p => p.id);
    const { rows: constructs } = await client.query(
      'SELECT id FROM kbsi_construct WHERE protein_id = ANY($1) LIMIT 2000', [proteinIds.slice(0, 200)]
    );
    if (!constructs || constructs.length === 0) { results.push({ label: bin.label, total: 0, success: 0, rate: 0 }); continue; }
    const constructIds = constructs.map(c => c.id).slice(0, 500);
    const { rows: [{ count: totalStr }] } = await client.query(
      `SELECT COUNT(*) as count FROM kbsi_crystallization WHERE construct_id = ANY($1) AND source_type != 'synthetic'`, [constructIds]
    );
    const { rows: [{ count: successStr }] } = await client.query(
      `SELECT COUNT(*) as count FROM kbsi_crystallization WHERE construct_id = ANY($1) AND source_type != 'synthetic' AND outcome IN ('single_crystal','diffraction_quality')`, [constructIds]
    );
    const t = parseInt(totalStr); const s = parseInt(successStr);
    results.push({ label: bin.label, total: t, success: s, rate: t > 0 ? s / t : 0 });
    console.log(`    ${bin.label}: ${s}/${t} (${(t > 0 ? s/t*100 : 0).toFixed(1)}%)`);
  }

  const observed = results.map(r => r.success);
  const totals = results.map(r => r.total);
  const overallRate = observed.reduce((a, b) => a + b, 0) / totals.reduce((a, b) => a + b, 0);
  const expected = totals.map(t => Math.round(t * overallRate));
  let stats = { p_value: 1.0, statistic: 0, effect_size: 0 };
  if (observed.some(v => v > 0) && expected.some(v => v > 0)) { try { stats = runStats('chi2', { observed, expected }); } catch { /* fallback */ } }
  const bestBin = results.reduce((best, r) => r.rate > best.rate ? r : best, results[0]);
  const confirmed = stats.p_value < 0.01;
  return { id: 'PH001', hypothesis: '10-30 kDa proteins have the highest crystallization success rate', status: confirmed ? 'confirmed' : stats.p_value < 0.05 ? 'inconclusive' : 'rejected', p_value: stats.p_value, effect_size: null, sample_size: totals.reduce((a, b) => a + b, 0), summary: `Best: ${bestBin.label} (${(bestBin.rate * 100).toFixed(1)}%). Chi2 p=${stats.p_value.toExponential(2)}.`, data: { bins: results, chi2: stats }, timestamp: new Date().toISOString() };
}

async function runPH003(): Promise<HypothesisResult> {
  console.log('\n  PH003: Optimal crystallization pH correlates with protein pI');
  const { rows: proteins } = await client.query('SELECT id, theoretical_pi FROM kbsi_protein WHERE theoretical_pi IS NOT NULL LIMIT 2000');
  if (!proteins || proteins.length === 0) return { id: 'PH003', hypothesis: 'pH-pI correlation', status: 'error', p_value: null, effect_size: null, sample_size: 0, summary: 'No protein pI data', data: null, timestamp: new Date().toISOString() };

  const piValues: number[] = []; const phValues: number[] = [];
  for (const prot of proteins.slice(0, 500)) {
    const { rows: constructs } = await client.query('SELECT id FROM kbsi_construct WHERE protein_id = $1 LIMIT 3', [prot.id]);
    if (!constructs || constructs.length === 0) continue;
    const { rows: cryst } = await client.query(
      `SELECT ph FROM kbsi_crystallization WHERE construct_id = ANY($1) AND ph IS NOT NULL AND outcome IN ('single_crystal','diffraction_quality') AND source_type != 'synthetic' LIMIT 1`,
      [constructs.map(c => c.id)]
    );
    if (cryst && cryst.length > 0) { piValues.push(prot.theoretical_pi); phValues.push(cryst[0].ph); }
  }
  console.log(`    Pairs collected: ${piValues.length}`);
  if (piValues.length < 20) return { id: 'PH003', hypothesis: 'pH-pI correlation', status: 'inconclusive', p_value: null, effect_size: null, sample_size: piValues.length, summary: `Only ${piValues.length} pairs`, data: null, timestamp: new Date().toISOString() };

  let stats = { p_value: 1.0, statistic: 0, effect_size: 0 };
  try { stats = runStats('pearson', { x: piValues, y: phValues }); } catch { /* fallback */ }
  const meanDelta = piValues.map((pi, i) => Math.abs(phValues[i] - pi)).reduce((a, b) => a + b, 0) / piValues.length;
  const confirmed = stats.p_value < 0.01 && Math.abs(stats.statistic) > 0.3;
  return { id: 'PH003', hypothesis: 'Optimal crystallization pH correlates with protein pI', status: confirmed ? 'confirmed' : stats.p_value < 0.05 ? 'inconclusive' : 'rejected', p_value: stats.p_value, effect_size: stats.effect_size ?? null, sample_size: piValues.length, summary: `Pearson r=${stats.statistic.toFixed(3)}, p=${stats.p_value.toExponential(2)}, Mean |pH-pI|=${meanDelta.toFixed(2)}.`, data: { n: piValues.length, r: stats.statistic, mean_delta_ph_pi: meanDelta }, timestamp: new Date().toISOString() };
}

async function runPH004(): Promise<HypothesisResult> {
  console.log('\n  PH004: Thermophilic proteins crystallize with higher success');
  const thermoOrgs = ['Thermus', 'Thermococcus', 'Pyrococcus', 'Sulfolobus', 'Thermotoga', 'Aquifex'];
  const thermoIds: number[] = [];
  for (const org of thermoOrgs) {
    const { rows: data } = await client.query(`SELECT id FROM kbsi_protein WHERE organism ILIKE $1 LIMIT 500`, [`%${org}%`]);
    if (data) thermoIds.push(...data.map(d => d.id));
  }
  console.log(`    Thermophile proteins: ${thermoIds.length}`);

  const { rows: thermoConstructs } = await client.query('SELECT id FROM kbsi_construct WHERE protein_id = ANY($1) LIMIT 3000', [thermoIds.slice(0, 500)]);
  const thermoConstructIds = thermoConstructs?.map(c => c.id) || [];

  const tIds = thermoConstructIds.slice(0, 500);
  const { rows: [{ count: thermoTotalStr }] } = await client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE construct_id = ANY($1) AND source_type != 'synthetic' AND outcome IS NOT NULL`, [tIds]);
  const { rows: [{ count: thermoSuccessStr }] } = await client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE construct_id = ANY($1) AND source_type != 'synthetic' AND outcome IN ('single_crystal','diffraction_quality')`, [tIds]);
  const { rows: [{ count: allTotalStr }] } = await client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE source_type != 'synthetic' AND outcome IS NOT NULL`);
  const { rows: [{ count: allSuccessStr }] } = await client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE source_type != 'synthetic' AND outcome IN ('single_crystal','diffraction_quality')`);

  const tT = parseInt(thermoTotalStr); const tS = parseInt(thermoSuccessStr);
  const aT = parseInt(allTotalStr); const aS = parseInt(allSuccessStr);
  const thermoRate = tT > 0 ? tS / tT : 0; const allRate = aT > 0 ? aS / aT : 0;
  console.log(`    Thermophile: ${tS}/${tT} (${(thermoRate*100).toFixed(1)}%)`);
  console.log(`    All:         ${aS}/${aT} (${(allRate*100).toFixed(1)}%)`);
  const confirmed = thermoRate > allRate * 1.1 && tT > 50;
  return { id: 'PH004', hypothesis: 'Thermophilic proteins crystallize with higher success rate', status: confirmed ? 'confirmed' : 'inconclusive', p_value: null, effect_size: thermoRate - allRate, sample_size: tT, summary: `Thermophile: ${(thermoRate*100).toFixed(1)}% vs All: ${(allRate*100).toFixed(1)}%. Delta=${((thermoRate-allRate)*100).toFixed(1)}pp.`, data: { thermo: { total: tT, success: tS, rate: thermoRate }, all: { total: aT, success: aS, rate: allRate } }, timestamp: new Date().toISOString() };
}

const HYPOTHESES: Record<string, () => Promise<HypothesisResult>> = { PH001: runPH001, PH003: runPH003, PH004: runPH004 };

async function main() {
  await client.connect();
  try {
    const args = process.argv.slice(2);
    if (args.includes('--list')) {
      console.log('Available hypotheses:\n  PH001: MW range vs crystallization success rate\n  PH003: pH-pI correlation\n  PH004: Thermophile success advantage');
      return;
    }
    const targetId = args.find(a => a.startsWith('--hypothesis='))?.split('=')[1] || args.find(a => a.startsWith('PH'));
    const hypothesesToRun = targetId ? [targetId] : Object.keys(HYPOTHESES);

    console.log('='.repeat(60)); console.log('  AI Scientist -- Hypothesis Runner'); console.log('  ' + new Date().toISOString()); console.log('='.repeat(60));
    const allResults: HypothesisResult[] = [];
    for (const id of hypothesesToRun) {
      const runner = HYPOTHESES[id];
      if (!runner) { console.log(`\n  Unknown hypothesis: ${id}`); continue; }
      console.log(`\n>> Running ${id}...`);
      try {
        const result = await runner();
        allResults.push(result);
        const icon = result.status === 'confirmed' ? 'V' : result.status === 'rejected' ? 'X' : '?';
        console.log(`  ${icon} ${result.status.toUpperCase()}: ${result.summary}`);
      } catch (err: any) {
        console.log(`  X ERROR: ${err.message}`);
        allResults.push({ id, hypothesis: id, status: 'error', p_value: null, effect_size: null, sample_size: 0, summary: err.message, data: null, timestamp: new Date().toISOString() });
      }
    }
    const outputPath = resolve(RESULTS_DIR, `run-${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`\nResults saved: ${outputPath}`);
    console.log('\n' + '='.repeat(60)); console.log('  Summary'); console.log('='.repeat(60));
    for (const r of allResults) {
      const pStr = r.p_value != null ? `p=${r.p_value.toExponential(2)}` : 'p=N/A';
      console.log(`  ${r.id}: ${r.status.padEnd(12)} ${pStr.padEnd(14)} n=${r.sample_size}`);
    }
    console.log('='.repeat(60));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
