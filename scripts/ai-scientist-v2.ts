/**
 * AI Scientist Agent v2 — Autonomous Hypothesis Discovery & Testing
 *
 * Connects directly to Lab PostgreSQL, auto-discovers patterns in crystallization
 * data, generates hypotheses, and runs statistical tests via Python scipy.
 *
 * Usage:
 *   npx tsx scripts/ai-scientist-v2.ts                     # Run all built-in hypotheses
 *   npx tsx scripts/ai-scientist-v2.ts --discover           # Discover new hypotheses from data
 *   npx tsx scripts/ai-scientist-v2.ts --hypothesis PH001   # Run specific hypothesis
 *   npx tsx scripts/ai-scientist-v2.ts --report             # Generate summary report
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getPgPool, closePg, pgQuery, pgScalar } from './lib/db';

// ─── Constants ───────────────────────────────────────────────
const ROOT = resolve(__dirname, '..');
const RESULTS_DIR = resolve(ROOT, 'data', 'ai-scientist-results');
mkdirSync(RESULTS_DIR, { recursive: true });

const ALPHA = 0.05;        // Significance level
const STRICT_ALPHA = 0.01; // Strict significance

// ─── Types ───────────────────────────────────────────────────

interface HypothesisResult {
  id: string;
  name: string;
  h0: string;
  h1: string;
  status: 'confirmed' | 'rejected' | 'inconclusive' | 'error';
  p_value: number | null;
  statistic: number | null;
  effect_size: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  sample_size: number;
  test_type: string;
  summary: string;
  data: Record<string, unknown>;
  timestamp: string;
  source: 'built-in' | 'discovered';
}

interface HypothesisDef {
  id: string;
  name: string;
  h0: string;
  h1: string;
  query: string;
  test: 'chi2' | 'chi2_contingency' | 'ttest' | 'mannwhitney' | 'pearson' | 'spearman' | 'kruskal' | 'anova';
  transform?: (rows: Record<string, unknown>[]) => Record<string, unknown>;
}

// ─── Statistical helper (calls Python scipy) ─────────────────

function runStats(
  testType: string,
  data: Record<string, unknown>
): { p_value: number; statistic: number; effect_size: number; ci_lower?: number; ci_upper?: number } {
  const pyScript = `
import json, sys
from scipy import stats
import numpy as np

import os
inp = json.loads(open(os.environ.get('STATS_INPUT', '/dev/stdin')).read())
test = inp['test']
d = inp['data']
result = {'p_value': 1.0, 'statistic': 0.0, 'effect_size': 0.0}

if test == 'chi2':
    observed = np.array(d['observed'], dtype=float)
    expected = np.array(d['expected'], dtype=float) if 'expected' in d else None
    if expected is not None:
        mask = expected > 0
        stat, p = stats.chisquare(observed[mask], expected[mask])
    else:
        stat, p = stats.chisquare(observed)
    n = float(np.sum(observed))
    k = len(observed)
    v = np.sqrt(stat / (n * max(k - 1, 1))) if n > 0 else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': float(v)}

elif test == 'chi2_contingency':
    table = np.array(d['table'], dtype=float)
    stat, p, dof, exp = stats.chi2_contingency(table)
    n = float(np.sum(table))
    k = min(table.shape)
    v = np.sqrt(stat / (n * max(k - 1, 1))) if n > 0 else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': float(v)}

elif test == 'ttest':
    a, b = np.array(d['group_a'], dtype=float), np.array(d['group_b'], dtype=float)
    stat, p = stats.ttest_ind(a, b, equal_var=False)
    pooled_std = np.sqrt((np.std(a, ddof=1)**2 + np.std(b, ddof=1)**2) / 2)
    cohens_d = float((np.mean(a) - np.mean(b)) / pooled_std) if pooled_std > 0 else 0
    se = np.sqrt(np.var(a, ddof=1)/len(a) + np.var(b, ddof=1)/len(b))
    diff = float(np.mean(a) - np.mean(b))
    ci_lo = diff - 1.96 * se
    ci_hi = diff + 1.96 * se
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': cohens_d, 'ci_lower': float(ci_lo), 'ci_upper': float(ci_hi)}

elif test == 'mannwhitney':
    a, b = np.array(d['group_a'], dtype=float), np.array(d['group_b'], dtype=float)
    stat, p = stats.mannwhitneyu(a, b, alternative='two-sided')
    r = 1 - (2*stat)/(len(a)*len(b)) if len(a)*len(b) > 0 else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': float(r)}

elif test == 'pearson':
    x, y = np.array(d['x'], dtype=float), np.array(d['y'], dtype=float)
    r, p = stats.pearsonr(x, y)
    n = len(x)
    se = np.sqrt((1 - r**2) / max(n - 2, 1))
    ci_lo = float(np.tanh(np.arctanh(r) - 1.96 / np.sqrt(max(n - 3, 1))))
    ci_hi = float(np.tanh(np.arctanh(r) + 1.96 / np.sqrt(max(n - 3, 1))))
    result = {'p_value': float(p), 'statistic': float(r), 'effect_size': float(r**2), 'ci_lower': ci_lo, 'ci_upper': ci_hi}

elif test == 'spearman':
    x, y = np.array(d['x'], dtype=float), np.array(d['y'], dtype=float)
    r, p = stats.spearmanr(x, y)
    result = {'p_value': float(p), 'statistic': float(r), 'effect_size': float(r**2)}

elif test == 'kruskal':
    groups = [np.array(g, dtype=float) for g in d['groups']]
    stat, p = stats.kruskal(*groups)
    n = sum(len(g) for g in groups)
    k = len(groups)
    eta2 = float((stat - k + 1) / (n - k)) if n > k else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': eta2}

elif test == 'anova':
    groups = [np.array(g, dtype=float) for g in d['groups']]
    stat, p = stats.f_oneway(*groups)
    n = sum(len(g) for g in groups)
    k = len(groups)
    eta2 = float((stat * (k - 1)) / (stat * (k - 1) + (n - k))) if (n > k and stat > 0) else 0
    result = {'p_value': float(p), 'statistic': float(stat), 'effect_size': eta2}

# Ensure all values are JSON-safe
for key in result:
    v = result[key]
    if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
        result[key] = None

print(json.dumps(result))
`;

  const input = JSON.stringify({ test: testType, data });
  const tmpDir = resolve(__dirname, '..', 'data');
  const tmpInput = resolve(tmpDir, '_stats_input.json');
  const tmpScript = resolve(tmpDir, '_stats_script.py');

  try {
    writeFileSync(tmpInput, input);
    writeFileSync(tmpScript, pyScript);
    const result = execSync(`python "${tmpScript}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, STATS_INPUT: tmpInput },
    });
    return JSON.parse(result.trim());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`    [stats] Python error: ${msg.substring(0, 200)}`);
    return { p_value: 1.0, statistic: 0, effect_size: 0 };
  }
}

function determineStatus(p: number | null, effectSize: number | null): HypothesisResult['status'] {
  if (p === null) return 'inconclusive';
  if (p < STRICT_ALPHA) return 'confirmed';
  if (p < ALPHA) return 'inconclusive';
  return 'rejected';
}

// ─── Built-in Hypotheses ─────────────────────────────────────

const HYPOTHESES: HypothesisDef[] = [
  // PH001: MW vs Success Rate
  {
    id: 'PH001',
    name: 'MW vs Success Rate',
    h0: 'Molecular weight range does not affect crystallization success rate',
    h1: 'Certain MW ranges have significantly different crystallization success rates',
    query: `
      SELECT
        CASE WHEN c.theoretical_mw < 20000 THEN 'small (<20kDa)'
             WHEN c.theoretical_mw < 50000 THEN 'medium (20-50kDa)'
             WHEN c.theoretical_mw < 100000 THEN 'large (50-100kDa)'
             ELSE 'xlarge (>100kDa)' END AS mw_group,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      WHERE c.theoretical_mw IS NOT NULL
        AND cr.outcome IS NOT NULL
        AND 1=1 /* include all data (experimental + synthetic) */
      GROUP BY mw_group
      ORDER BY mw_group`,
    test: 'chi2',
  },

  // PH002: Organism Effect
  {
    id: 'PH002',
    name: 'Organism Effect on Crystallization',
    h0: 'Source organism does not affect crystallization success rate',
    h1: 'Some organisms yield significantly higher crystallization success',
    query: `
      SELECT p.organism,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      JOIN kbsi_protein p ON p.id = c.protein_id
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND cr.outcome IS NOT NULL
        AND p.organism IS NOT NULL
      GROUP BY p.organism
      HAVING COUNT(*) >= 100
      ORDER BY COUNT(*) DESC
      LIMIT 10`,
    test: 'chi2_contingency',
  },

  // PH003: Expression System Effect
  {
    id: 'PH003',
    name: 'Expression System Effect',
    h0: 'Expression system does not affect downstream crystallization success',
    h1: 'Expression system significantly impacts crystallization outcome',
    query: `
      SELECT c.expression_system,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND cr.outcome IS NOT NULL
        AND c.expression_system IS NOT NULL
      GROUP BY c.expression_system
      HAVING COUNT(*) >= 50
      ORDER BY COUNT(*) DESC
      LIMIT 8`,
    test: 'chi2_contingency',
  },

  // PH004: PEG MW Correlation with Protein MW
  {
    id: 'PH004',
    name: 'PEG MW Correlation',
    h0: 'PEG molecular weight does not correlate with protein MW for successful crystallization',
    h1: 'Larger proteins tend to crystallize with higher MW PEGs',
    query: `
      SELECT c.theoretical_mw AS protein_mw,
        CASE
          WHEN cr.precipitant_type ILIKE '%PEG 400%' THEN 400
          WHEN cr.precipitant_type ILIKE '%PEG 1000%' THEN 1000
          WHEN cr.precipitant_type ILIKE '%PEG 2000%' THEN 2000
          WHEN cr.precipitant_type ILIKE '%PEG 3350%' THEN 3350
          WHEN cr.precipitant_type ILIKE '%PEG 4000%' THEN 4000
          WHEN cr.precipitant_type ILIKE '%PEG 6000%' THEN 6000
          WHEN cr.precipitant_type ILIKE '%PEG 8000%' THEN 8000
          WHEN cr.precipitant_type ILIKE '%PEG 10000%' THEN 10000
          WHEN cr.precipitant_type ILIKE '%PEG 20000%' THEN 20000
          ELSE NULL END AS peg_mw
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND cr.outcome IN ('single_crystal','diffraction_quality')
        AND c.theoretical_mw IS NOT NULL
        AND cr.precipitant_type ILIKE '%PEG%'`,
    test: 'spearman',
  },

  // PH005: Ligand-bound vs Apo
  {
    id: 'PH005',
    name: 'Ligand-bound vs Apo',
    h0: 'Ligand binding does not affect crystallization success rate',
    h1: 'Ligand-bound proteins crystallize at higher rates than apo proteins',
    query: `
      WITH bound AS (
        SELECT DISTINCT cr.construct_id
        FROM kbsi_construct_ligand cl
        JOIN kbsi_crystallization cr ON cr.construct_id = cl.construct_id
        WHERE 1=1 /* include all data (experimental + synthetic) */ AND cr.outcome IS NOT NULL
      )
      SELECT
        CASE WHEN b.construct_id IS NOT NULL THEN 'ligand_bound' ELSE 'apo' END AS group_name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
      FROM kbsi_crystallization cr
      LEFT JOIN bound b ON b.construct_id = cr.construct_id
      WHERE 1=1 /* include all data (experimental + synthetic) */ AND cr.outcome IS NOT NULL
      GROUP BY group_name`,
    test: 'chi2_contingency',
  },

  // PH006: Temperature Bimodal (4C vs 18C)
  {
    id: 'PH006',
    name: 'Temperature Bimodal',
    h0: 'There is no difference in crystallization success between 4C and 18C',
    h1: 'Temperature significantly affects crystallization success rate',
    query: `
      SELECT
        CASE WHEN cr.temperature BETWEEN 2 AND 6 THEN '4C'
             WHEN cr.temperature BETWEEN 16 AND 22 THEN '18C'
             ELSE NULL END AS temp_group,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
      FROM kbsi_crystallization cr
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND cr.outcome IS NOT NULL
        AND cr.temperature IS NOT NULL
        AND (cr.temperature BETWEEN 2 AND 6 OR cr.temperature BETWEEN 16 AND 22)
      GROUP BY temp_group`,
    test: 'chi2_contingency',
  },

  // PH007: pH Optimum per Precipitant
  {
    id: 'PH007',
    name: 'pH Optimum per Precipitant',
    h0: 'Optimal pH does not differ between PEG 3350 and Ammonium Sulfate crystallizations',
    h1: 'PEG 3350 and Ammonium Sulfate have different optimal pH distributions',
    query: `
      SELECT cr.precipitant_type, cr.ph
      FROM kbsi_crystallization cr
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND cr.outcome IN ('single_crystal','diffraction_quality')
        AND cr.ph IS NOT NULL
        AND (cr.precipitant_type ILIKE '%PEG 3350%' OR cr.precipitant_type ILIKE '%Ammonium sulfate%')
      LIMIT 50000`,
    test: 'mannwhitney',
  },

  // PH008: Additive Effect
  {
    id: 'PH008',
    name: 'Additive Effect',
    h0: 'Additives do not improve crystallization success rate',
    h1: 'Conditions with additives have higher crystallization success',
    query: `
      SELECT
        CASE WHEN cr.additive IS NOT NULL
             THEN 'with_additive' ELSE 'no_additive' END AS additive_group,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
      FROM kbsi_crystallization cr
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND cr.outcome IS NOT NULL
      GROUP BY additive_group`,
    test: 'chi2_contingency',
  },
];

// ─── Hypothesis runners ──────────────────────────────────────

async function runHypothesis(def: HypothesisDef, source: 'built-in' | 'discovered' = 'built-in'): Promise<HypothesisResult> {
  console.log(`\n  ${def.id}: ${def.name}`);
  console.log(`    H0: ${def.h0}`);
  console.log(`    H1: ${def.h1}`);

  const makeError = (msg: string): HypothesisResult => ({
    id: def.id, name: def.name, h0: def.h0, h1: def.h1,
    status: 'error', p_value: null, statistic: null, effect_size: null,
    ci_lower: null, ci_upper: null, sample_size: 0, test_type: def.test,
    summary: msg, data: {}, timestamp: new Date().toISOString(), source,
  });

  // 1. Collect data
  let rows: Record<string, unknown>[];
  try {
    rows = await pgQuery(def.query);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`    ERROR (query): ${msg.substring(0, 150)}`);
    return makeError(`Query failed: ${msg.substring(0, 200)}`);
  }

  if (rows.length === 0) {
    console.log('    No data returned');
    return makeError('No data returned from query');
  }

  console.log(`    Rows: ${rows.length}`);

  // 2. Transform data for statistical test
  let statsData: Record<string, unknown>;
  let sampleSize = 0;

  try {
    if (def.test === 'chi2') {
      // Rows have: group, total, success
      const observed = rows.map(r => Number(r.success));
      const totals = rows.map(r => Number(r.total));
      sampleSize = totals.reduce((a, b) => a + b, 0);
      const overallRate = observed.reduce((a, b) => a + b, 0) / sampleSize;
      const expected = totals.map(t => t * overallRate);

      for (const r of rows) {
        const total = Number(r.total);
        const success = Number(r.success);
        const rate = total > 0 ? (success / total * 100).toFixed(1) : '0.0';
        console.log(`    ${String(r.mw_group || r.group_name || '?').padEnd(22)} ${success}/${total} (${rate}%)`);
      }

      statsData = { observed, expected };

    } else if (def.test === 'chi2_contingency') {
      // Rows have: group, total, success
      const groups = rows.map(r => ({
        name: String(r.organism || r.expression_system || r.group_name || r.temp_group || r.additive_group || '?'),
        success: Number(r.success),
        fail: Number(r.total) - Number(r.success),
      }));
      sampleSize = groups.reduce((a, g) => a + g.success + g.fail, 0);

      // Build 2 x k contingency table: [successes], [failures]
      const successRow = groups.map(g => g.success);
      const failRow = groups.map(g => g.fail);

      for (const g of groups) {
        const rate = (g.success + g.fail) > 0
          ? (g.success / (g.success + g.fail) * 100).toFixed(1)
          : '0.0';
        console.log(`    ${g.name.padEnd(30)} ${g.success}/${g.success + g.fail} (${rate}%)`);
      }

      statsData = { table: [successRow, failRow] };

    } else if (def.test === 'ttest' || def.test === 'mannwhitney') {
      // For PH007: split by precipitant_type into two pH groups
      const groupA: number[] = [];
      const groupB: number[] = [];

      for (const r of rows) {
        const ptype = String(r.precipitant_type || '').toLowerCase();
        const ph = Number(r.ph);
        if (isNaN(ph)) continue;
        if (ptype.includes('peg 3350')) groupA.push(ph);
        else groupB.push(ph);
      }

      sampleSize = groupA.length + groupB.length;
      console.log(`    Group A (PEG 3350): n=${groupA.length}, mean pH=${groupA.length > 0 ? (groupA.reduce((a, b) => a + b, 0) / groupA.length).toFixed(2) : 'N/A'}`);
      console.log(`    Group B (AmSO4):    n=${groupB.length}, mean pH=${groupB.length > 0 ? (groupB.reduce((a, b) => a + b, 0) / groupB.length).toFixed(2) : 'N/A'}`);

      if (groupA.length < 10 || groupB.length < 10) {
        return makeError(`Insufficient data: group_a=${groupA.length}, group_b=${groupB.length}`);
      }

      statsData = { group_a: groupA.slice(0, 10000), group_b: groupB.slice(0, 10000) };

    } else if (def.test === 'pearson' || def.test === 'spearman') {
      // For PH004: protein_mw vs peg_mw
      const x: number[] = [];
      const y: number[] = [];

      for (const r of rows) {
        const px = Number(r.protein_mw);
        const py = Number(r.peg_mw);
        if (!isNaN(px) && !isNaN(py) && py > 0) {
          x.push(px);
          y.push(py);
        }
      }

      sampleSize = x.length;
      console.log(`    Valid pairs: ${x.length}`);

      if (x.length < 20) {
        return makeError(`Insufficient pairs: ${x.length}`);
      }

      // Sample if too large (for Python memory)
      const maxN = 20000;
      if (x.length > maxN) {
        const indices = Array.from({ length: x.length }, (_, i) => i);
        // Simple deterministic sampling
        const step = Math.floor(x.length / maxN);
        const sampledX: number[] = [];
        const sampledY: number[] = [];
        for (let i = 0; i < x.length && sampledX.length < maxN; i += step) {
          sampledX.push(x[i]);
          sampledY.push(y[i]);
        }
        statsData = { x: sampledX, y: sampledY };
      } else {
        statsData = { x, y };
      }

    } else if (def.test === 'kruskal' || def.test === 'anova') {
      // Generic grouped continuous data — not used in built-in but for discovery
      statsData = def.transform ? def.transform(rows) : {};
      sampleSize = rows.length;

    } else {
      return makeError(`Unknown test type: ${def.test}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`    ERROR (transform): ${msg.substring(0, 150)}`);
    return makeError(`Transform error: ${msg.substring(0, 200)}`);
  }

  // 3. Run statistical test
  console.log(`    Running ${def.test} test...`);
  const stats = runStats(def.test, statsData);

  // 4. Determine status
  const status = determineStatus(stats.p_value, stats.effect_size);

  const pStr = stats.p_value != null ? stats.p_value.toExponential(2) : 'N/A';
  const esStr = stats.effect_size != null ? stats.effect_size.toFixed(4) : 'N/A';

  const statusLabel = status === 'confirmed'
    ? 'CONFIRMED — H0 rejected, significant effect found'
    : status === 'rejected'
    ? 'REJECTED — cannot reject H0'
    : status === 'inconclusive'
    ? 'INCONCLUSIVE — marginal significance'
    : 'ERROR';

  const summary = `${statusLabel}. p=${pStr}, effect_size=${esStr}, n=${sampleSize}`;
  console.log(`    => ${summary}`);

  return {
    id: def.id,
    name: def.name,
    h0: def.h0,
    h1: def.h1,
    status,
    p_value: stats.p_value ?? null,
    statistic: stats.statistic ?? null,
    effect_size: stats.effect_size ?? null,
    ci_lower: stats.ci_lower ?? null,
    ci_upper: stats.ci_upper ?? null,
    sample_size: sampleSize,
    test_type: def.test,
    summary,
    data: { query_rows: rows.length, raw_sample: rows.slice(0, 5), stats },
    timestamp: new Date().toISOString(),
    source,
  };
}

// ─── Auto-Discovery Mode ─────────────────────────────────────

async function discoverHypotheses(): Promise<HypothesisResult[]> {
  console.log('\n  === AUTO-DISCOVERY MODE ===');
  console.log('  Exploring data for surprising patterns...\n');

  const discovered: HypothesisResult[] = [];

  // Discovery 1: Organism success rate variation
  console.log('  [D1] Scanning organism success rate variation...');
  try {
    const orgRows = await pgQuery<{ organism: string; rate: string; n: string }>(`
      SELECT p.organism,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality'))::float
          / NULLIF(COUNT(*), 0) AS rate,
        COUNT(*) AS n
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      JOIN kbsi_protein p ON p.id = c.protein_id
      WHERE 1=1 /* include all data (experimental + synthetic) */ AND cr.outcome IS NOT NULL AND p.organism IS NOT NULL
      GROUP BY p.organism HAVING COUNT(*) >= 100
      ORDER BY rate DESC
    `);

    if (orgRows.length >= 3) {
      const top = orgRows[0];
      const bottom = orgRows[orgRows.length - 1];
      console.log(`    Top:    ${top.organism} (${(Number(top.rate) * 100).toFixed(1)}%, n=${top.n})`);
      console.log(`    Bottom: ${bottom.organism} (${(Number(bottom.rate) * 100).toFixed(1)}%, n=${bottom.n})`);

      const def: HypothesisDef = {
        id: 'D001',
        name: `Organism comparison: ${top.organism} vs ${bottom.organism}`,
        h0: `${top.organism} and ${bottom.organism} have equal crystallization success rates`,
        h1: `${top.organism} has significantly higher success than ${bottom.organism}`,
        query: `
          SELECT p.organism,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
          FROM kbsi_crystallization cr
          JOIN kbsi_construct c ON c.id = cr.construct_id
          JOIN kbsi_protein p ON p.id = c.protein_id
          WHERE 1=1 /* include all data (experimental + synthetic) */ AND cr.outcome IS NOT NULL
            AND p.organism IN ('${top.organism.replace(/'/g, "''")}', '${bottom.organism.replace(/'/g, "''")}')
          GROUP BY p.organism`,
        test: 'chi2_contingency',
      };
      discovered.push(await runHypothesis(def, 'discovered'));
    }
  } catch (err: unknown) {
    console.log(`    Skipped: ${err instanceof Error ? err.message.substring(0, 100) : String(err)}`);
  }

  // Discovery 2: Resolution vs precipitant type
  console.log('\n  [D2] Scanning resolution distribution by precipitant type...');
  try {
    const precipRows = await pgQuery<{ precipitant_type: string; avg_res: string; n: string }>(`
      SELECT cr.precipitant_type,
        AVG(d.resolution) AS avg_res,
        COUNT(*) AS n
      FROM kbsi_diffraction d
      JOIN kbsi_crystallization cr ON cr.construct_id = d.construct_id
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND d.resolution IS NOT NULL AND d.resolution BETWEEN 0.5 AND 10
        AND cr.precipitant_type IS NOT NULL
      GROUP BY cr.precipitant_type
      HAVING COUNT(*) >= 200
      ORDER BY avg_res ASC
      LIMIT 5
    `);

    if (precipRows.length >= 2) {
      const best = precipRows[0];
      const worst = precipRows[precipRows.length - 1];
      console.log(`    Best resolution:  ${best.precipitant_type} (${Number(best.avg_res).toFixed(2)} A, n=${best.n})`);
      console.log(`    Worst resolution: ${worst.precipitant_type} (${Number(worst.avg_res).toFixed(2)} A, n=${worst.n})`);

      const def: HypothesisDef = {
        id: 'D002',
        name: `Resolution by precipitant: ${best.precipitant_type} vs ${worst.precipitant_type}`,
        h0: 'Precipitant type does not affect diffraction resolution',
        h1: `${best.precipitant_type} yields better resolution than ${worst.precipitant_type}`,
        query: `
          SELECT cr.precipitant_type, d.resolution
          FROM kbsi_diffraction d
          JOIN kbsi_crystallization cr ON cr.construct_id = d.construct_id
          WHERE 1=1 /* include all data (experimental + synthetic) */
            AND d.resolution IS NOT NULL AND d.resolution BETWEEN 0.5 AND 10
            AND cr.precipitant_type IN ('${best.precipitant_type.replace(/'/g, "''")}', '${worst.precipitant_type.replace(/'/g, "''")}')
          LIMIT 30000`,
        test: 'mannwhitney',
      };

      // Custom handler for this one — split into groups by precipitant
      const resRows = await pgQuery<{ precipitant_type: string; resolution: number }>(def.query);
      const groupA = resRows.filter(r => String(r.precipitant_type) === best.precipitant_type).map(r => Number(r.resolution));
      const groupB = resRows.filter(r => String(r.precipitant_type) === worst.precipitant_type).map(r => Number(r.resolution));

      if (groupA.length >= 50 && groupB.length >= 50) {
        const stats = runStats('mannwhitney', {
          group_a: groupA.slice(0, 10000),
          group_b: groupB.slice(0, 10000),
        });
        const status = determineStatus(stats.p_value, stats.effect_size);
        discovered.push({
          id: def.id, name: def.name, h0: def.h0, h1: def.h1, status,
          p_value: stats.p_value, statistic: stats.statistic, effect_size: stats.effect_size,
          ci_lower: null, ci_upper: null,
          sample_size: groupA.length + groupB.length, test_type: 'mannwhitney',
          summary: `${status.toUpperCase()}. p=${stats.p_value?.toExponential(2)}, effect=${stats.effect_size?.toFixed(4)}, n=${groupA.length + groupB.length}. Mean res: ${(groupA.reduce((a, b) => a + b, 0) / groupA.length).toFixed(2)} vs ${(groupB.reduce((a, b) => a + b, 0) / groupB.length).toFixed(2)} A`,
          data: { best: best.precipitant_type, worst: worst.precipitant_type, n_a: groupA.length, n_b: groupB.length, stats },
          timestamp: new Date().toISOString(), source: 'discovered',
        });
        console.log(`    => ${discovered[discovered.length - 1].summary}`);
      }
    }
  } catch (err: unknown) {
    console.log(`    Skipped: ${err instanceof Error ? err.message.substring(0, 100) : String(err)}`);
  }

  // Discovery 3: pH sweet spots per organism
  console.log('\n  [D3] Scanning pH distributions across organisms...');
  try {
    const phRows = await pgQuery<{ organism: string; avg_ph: string; std_ph: string; n: string }>(`
      SELECT p.organism,
        AVG(cr.ph) AS avg_ph,
        STDDEV(cr.ph) AS std_ph,
        COUNT(*) AS n
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      JOIN kbsi_protein p ON p.id = c.protein_id
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND cr.outcome IN ('single_crystal','diffraction_quality')
        AND cr.ph IS NOT NULL AND p.organism IS NOT NULL
      GROUP BY p.organism
      HAVING COUNT(*) >= 100
      ORDER BY avg_ph ASC
      LIMIT 10
    `);

    if (phRows.length >= 2) {
      console.log('    Organism pH averages (successful crystallizations):');
      for (const r of phRows) {
        console.log(`      ${String(r.organism).padEnd(35)} pH ${Number(r.avg_ph).toFixed(2)} +/- ${Number(r.std_ph).toFixed(2)} (n=${r.n})`);
      }

      // Compare lowest vs highest avg pH organisms
      const lo = phRows[0];
      const hi = phRows[phRows.length - 1];

      const phData = await pgQuery<{ organism: string; ph: number }>(`
        SELECT p.organism, cr.ph
        FROM kbsi_crystallization cr
        JOIN kbsi_construct c ON c.id = cr.construct_id
        JOIN kbsi_protein p ON p.id = c.protein_id
        WHERE 1=1 /* include all data (experimental + synthetic) */
          AND cr.outcome IN ('single_crystal','diffraction_quality')
          AND cr.ph IS NOT NULL
          AND p.organism IN ('${lo.organism.replace(/'/g, "''")}', '${hi.organism.replace(/'/g, "''")}')
        LIMIT 20000
      `);

      const gA = phData.filter(r => r.organism === lo.organism).map(r => Number(r.ph));
      const gB = phData.filter(r => r.organism === hi.organism).map(r => Number(r.ph));

      if (gA.length >= 30 && gB.length >= 30) {
        const stats = runStats('mannwhitney', {
          group_a: gA.slice(0, 10000),
          group_b: gB.slice(0, 10000),
        });
        const status = determineStatus(stats.p_value, stats.effect_size);
        discovered.push({
          id: 'D003', name: `pH preference: ${lo.organism} vs ${hi.organism}`,
          h0: 'These organisms do not differ in optimal crystallization pH',
          h1: 'Optimal pH differs significantly between these organisms',
          status,
          p_value: stats.p_value, statistic: stats.statistic, effect_size: stats.effect_size,
          ci_lower: null, ci_upper: null,
          sample_size: gA.length + gB.length, test_type: 'mannwhitney',
          summary: `${status.toUpperCase()}. p=${stats.p_value?.toExponential(2)}, effect=${stats.effect_size?.toFixed(4)}. Mean pH: ${(gA.reduce((a, b) => a + b, 0) / gA.length).toFixed(2)} vs ${(gB.reduce((a, b) => a + b, 0) / gB.length).toFixed(2)}`,
          data: { organism_a: lo.organism, organism_b: hi.organism, n_a: gA.length, n_b: gB.length, stats },
          timestamp: new Date().toISOString(), source: 'discovered',
        });
        console.log(`    => ${discovered[discovered.length - 1].summary}`);
      }
    }
  } catch (err: unknown) {
    console.log(`    Skipped: ${err instanceof Error ? err.message.substring(0, 100) : String(err)}`);
  }

  // Discovery 4: Temperature x Organism interaction
  console.log('\n  [D4] Scanning temperature preference by organism...');
  try {
    const tempOrgRows = await pgQuery<{ organism: string; temp_group: string; total: string; success: string }>(`
      SELECT p.organism,
        CASE WHEN cr.temperature BETWEEN 2 AND 6 THEN 'cold_4C'
             WHEN cr.temperature BETWEEN 16 AND 22 THEN 'room_18C'
             ELSE NULL END AS temp_group,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      JOIN kbsi_protein p ON p.id = c.protein_id
      WHERE 1=1 /* include all data (experimental + synthetic) */ AND cr.outcome IS NOT NULL
        AND cr.temperature IS NOT NULL AND p.organism IS NOT NULL
        AND (cr.temperature BETWEEN 2 AND 6 OR cr.temperature BETWEEN 16 AND 22)
      GROUP BY p.organism, temp_group
      HAVING COUNT(*) >= 50
      ORDER BY p.organism, temp_group
    `);

    if (tempOrgRows.length >= 4) {
      // Group by organism, find those with data at both temps
      const orgMap = new Map<string, { cold: { total: number; success: number }; room: { total: number; success: number } }>();
      for (const r of tempOrgRows) {
        const org = String(r.organism);
        if (!orgMap.has(org)) orgMap.set(org, { cold: { total: 0, success: 0 }, room: { total: 0, success: 0 } });
        const entry = orgMap.get(org)!;
        const key = r.temp_group === 'cold_4C' ? 'cold' : 'room';
        entry[key] = { total: Number(r.total), success: Number(r.success) };
      }

      // Find organism with biggest temperature preference difference
      let maxDiff = 0;
      let bestOrg = '';
      for (const [org, data] of orgMap) {
        if (data.cold.total >= 50 && data.room.total >= 50) {
          const coldRate = data.cold.success / data.cold.total;
          const roomRate = data.room.success / data.room.total;
          const diff = Math.abs(coldRate - roomRate);
          if (diff > maxDiff) {
            maxDiff = diff;
            bestOrg = org;
          }
        }
      }

      if (bestOrg && maxDiff > 0.01) {
        const d = orgMap.get(bestOrg)!;
        const coldRate = (d.cold.success / d.cold.total * 100).toFixed(1);
        const roomRate = (d.room.success / d.room.total * 100).toFixed(1);
        console.log(`    Strongest temp preference: ${bestOrg}`);
        console.log(`      4C:  ${d.cold.success}/${d.cold.total} (${coldRate}%)`);
        console.log(`      18C: ${d.room.success}/${d.room.total} (${roomRate}%)`);

        // Chi2 test
        const table = [
          [d.cold.success, d.room.success],
          [d.cold.total - d.cold.success, d.room.total - d.room.success],
        ];
        const stats = runStats('chi2_contingency', { table });
        const status = determineStatus(stats.p_value, stats.effect_size);

        discovered.push({
          id: 'D004',
          name: `Temperature preference for ${bestOrg}`,
          h0: `${bestOrg} has equal success at 4C and 18C`,
          h1: `${bestOrg} shows temperature preference for crystallization`,
          status,
          p_value: stats.p_value, statistic: stats.statistic, effect_size: stats.effect_size,
          ci_lower: null, ci_upper: null,
          sample_size: d.cold.total + d.room.total, test_type: 'chi2_contingency',
          summary: `${status.toUpperCase()}. p=${stats.p_value?.toExponential(2)}. ${bestOrg}: 4C ${coldRate}% vs 18C ${roomRate}%`,
          data: { organism: bestOrg, cold: d.cold, room: d.room, stats },
          timestamp: new Date().toISOString(), source: 'discovered',
        });
        console.log(`    => ${discovered[discovered.length - 1].summary}`);
      }
    }
  } catch (err: unknown) {
    console.log(`    Skipped: ${err instanceof Error ? err.message.substring(0, 100) : String(err)}`);
  }

  // Discovery 5: Concentration sweet spot
  console.log('\n  [D5] Scanning precipitant concentration vs success...');
  try {
    const concRows = await pgQuery<{ conc_bin: string; total: string; success: string }>(`
      SELECT
        CASE WHEN cr.precipitant_conc < 5 THEN '0-5%'
             WHEN cr.precipitant_conc < 15 THEN '5-15%'
             WHEN cr.precipitant_conc < 25 THEN '15-25%'
             WHEN cr.precipitant_conc < 35 THEN '25-35%'
             ELSE '35%+' END AS conc_bin,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success
      FROM kbsi_crystallization cr
      WHERE 1=1 /* include all data (experimental + synthetic) */
        AND cr.outcome IS NOT NULL
        AND cr.precipitant_conc IS NOT NULL
      GROUP BY conc_bin
      ORDER BY conc_bin
    `);

    if (concRows.length >= 3) {
      const observed = concRows.map(r => Number(r.success));
      const totals = concRows.map(r => Number(r.total));
      const sampleSize = totals.reduce((a, b) => a + b, 0);
      const overallRate = observed.reduce((a, b) => a + b, 0) / sampleSize;
      const expected = totals.map(t => t * overallRate);

      for (const r of concRows) {
        const t = Number(r.total);
        const s = Number(r.success);
        console.log(`    ${String(r.conc_bin).padEnd(10)} ${s}/${t} (${(t > 0 ? s / t * 100 : 0).toFixed(1)}%)`);
      }

      const stats = runStats('chi2', { observed, expected });
      const status = determineStatus(stats.p_value, stats.effect_size);

      discovered.push({
        id: 'D005',
        name: 'Precipitant concentration vs success',
        h0: 'Precipitant concentration does not affect crystallization success',
        h1: 'Certain concentration ranges yield higher success rates',
        status,
        p_value: stats.p_value, statistic: stats.statistic, effect_size: stats.effect_size,
        ci_lower: null, ci_upper: null,
        sample_size: sampleSize, test_type: 'chi2',
        summary: `${status.toUpperCase()}. p=${stats.p_value?.toExponential(2)}, Cramer's V=${stats.effect_size?.toFixed(4)}, n=${sampleSize}`,
        data: { bins: concRows, stats },
        timestamp: new Date().toISOString(), source: 'discovered',
      });
      console.log(`    => ${discovered[discovered.length - 1].summary}`);
    }
  } catch (err: unknown) {
    console.log(`    Skipped: ${err instanceof Error ? err.message.substring(0, 100) : String(err)}`);
  }

  return discovered;
}

// ─── Report Generation ───────────────────────────────────────

function generateReport(): void {
  console.log('\n  === GENERATING SUMMARY REPORT ===\n');

  // Gather all result files
  const files = readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('  No result files found. Run hypotheses first.');
    return;
  }

  // Load most recent result for each hypothesis
  const latestMap = new Map<string, HypothesisResult>();

  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(resolve(RESULTS_DIR, file), 'utf-8'));
      const results: HypothesisResult[] = Array.isArray(content) ? content : [content];
      for (const r of results) {
        if (!latestMap.has(r.id)) {
          latestMap.set(r.id, r);
        }
      }
    } catch {
      // skip malformed files
    }
  }

  const allResults = Array.from(latestMap.values()).sort((a, b) => a.id.localeCompare(b.id));

  // Console summary
  const confirmed = allResults.filter(r => r.status === 'confirmed').length;
  const rejected = allResults.filter(r => r.status === 'rejected').length;
  const inconclusive = allResults.filter(r => r.status === 'inconclusive').length;
  const errors = allResults.filter(r => r.status === 'error').length;

  console.log(`  Total hypotheses: ${allResults.length}`);
  console.log(`  Confirmed:    ${confirmed}`);
  console.log(`  Rejected:     ${rejected}`);
  console.log(`  Inconclusive: ${inconclusive}`);
  console.log(`  Errors:       ${errors}`);
  console.log('');

  console.log('  ' + '-'.repeat(96));
  console.log(`  ${'ID'.padEnd(8)} ${'Name'.padEnd(35)} ${'Status'.padEnd(14)} ${'p-value'.padEnd(14)} ${'Effect'.padEnd(10)} ${'n'.padEnd(10)}`);
  console.log('  ' + '-'.repeat(96));

  for (const r of allResults) {
    const pStr = r.p_value != null ? r.p_value.toExponential(2) : 'N/A';
    const esStr = r.effect_size != null ? r.effect_size.toFixed(4) : 'N/A';
    const marker = r.status === 'confirmed' ? '[+]' : r.status === 'rejected' ? '[-]' : r.status === 'error' ? '[!]' : '[?]';
    console.log(`  ${marker} ${r.id.padEnd(6)} ${r.name.substring(0, 33).padEnd(35)} ${r.status.padEnd(14)} ${pStr.padEnd(14)} ${esStr.padEnd(10)} ${String(r.sample_size).padEnd(10)}`);
  }
  console.log('  ' + '-'.repeat(96));

  // Write markdown report
  const now = new Date().toISOString();
  const lines: string[] = [
    `# AI Scientist Report`,
    ``,
    `Generated: ${now}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total hypotheses | ${allResults.length} |`,
    `| Confirmed (p < 0.01) | ${confirmed} |`,
    `| Rejected (p >= 0.05) | ${rejected} |`,
    `| Inconclusive | ${inconclusive} |`,
    `| Errors | ${errors} |`,
    ``,
    `## Hypothesis Results`,
    ``,
    `| ID | Name | Status | p-value | Effect Size | n | Source |`,
    `|----|------|--------|---------|-------------|---|--------|`,
  ];

  for (const r of allResults) {
    const pStr = r.p_value != null ? r.p_value.toExponential(2) : 'N/A';
    const esStr = r.effect_size != null ? r.effect_size.toFixed(4) : 'N/A';
    lines.push(`| ${r.id} | ${r.name} | **${r.status}** | ${pStr} | ${esStr} | ${r.sample_size.toLocaleString()} | ${r.source} |`);
  }

  lines.push('');
  lines.push('## Details');
  lines.push('');

  for (const r of allResults) {
    lines.push(`### ${r.id}: ${r.name}`);
    lines.push('');
    lines.push(`- **H0**: ${r.h0}`);
    lines.push(`- **H1**: ${r.h1}`);
    lines.push(`- **Test**: ${r.test_type}`);
    lines.push(`- **Result**: ${r.summary}`);
    if (r.ci_lower != null && r.ci_upper != null) {
      lines.push(`- **95% CI**: [${r.ci_lower.toFixed(4)}, ${r.ci_upper.toFixed(4)}]`);
    }
    lines.push('');
  }

  const reportPath = resolve(RESULTS_DIR, 'report.md');
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`\n  Report saved: ${reportPath}`);
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // --report mode
  if (args.includes('--report')) {
    generateReport();
    return;
  }

  console.log('='.repeat(64));
  console.log('  AI Scientist Agent v2');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(64));

  // Test DB connection
  try {
    const dbVersion = await pgScalar<string>('SELECT version()');
    console.log(`  DB: ${String(dbVersion).substring(0, 60)}`);
  } catch (err: unknown) {
    console.error(`  FATAL: Cannot connect to Lab PG — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const allResults: HypothesisResult[] = [];

  // --discover mode
  if (args.includes('--discover')) {
    const discovered = await discoverHypotheses();
    allResults.push(...discovered);
  }

  // --hypothesis mode (specific)
  const targetId = args.find(a => a.startsWith('--hypothesis='))?.split('=')[1]
    || args.find(a => a.startsWith('--hypothesis'))
      ? args[args.indexOf('--hypothesis') + 1]
      : null;

  // Run built-in hypotheses (unless --discover only)
  if (!args.includes('--discover') || targetId) {
    const toRun = targetId
      ? HYPOTHESES.filter(h => h.id === targetId)
      : HYPOTHESES;

    if (targetId && toRun.length === 0) {
      console.log(`\n  Unknown hypothesis: ${targetId}`);
      console.log('  Available: ' + HYPOTHESES.map(h => h.id).join(', '));
    }

    for (const def of toRun) {
      try {
        const result = await runHypothesis(def);
        allResults.push(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`\n  ${def.id} FATAL: ${msg.substring(0, 200)}`);
        allResults.push({
          id: def.id, name: def.name, h0: def.h0, h1: def.h1,
          status: 'error', p_value: null, statistic: null, effect_size: null,
          ci_lower: null, ci_upper: null, sample_size: 0, test_type: def.test,
          summary: msg.substring(0, 200), data: {}, timestamp: new Date().toISOString(),
          source: 'built-in',
        });
      }
    }
  }

  // Save results
  if (allResults.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = resolve(RESULTS_DIR, `run-${ts}.json`);
    writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`\n  Results saved: ${outputPath}`);

    // Also save per-hypothesis latest
    for (const r of allResults) {
      const perPath = resolve(RESULTS_DIR, `${r.id}-latest.json`);
      writeFileSync(perPath, JSON.stringify(r, null, 2));
    }
  }

  // Summary table
  console.log('\n' + '='.repeat(64));
  console.log('  Summary');
  console.log('='.repeat(64));

  for (const r of allResults) {
    const marker = r.status === 'confirmed' ? '[+]' : r.status === 'rejected' ? '[-]' : r.status === 'error' ? '[!]' : '[?]';
    const pStr = r.p_value != null ? `p=${r.p_value.toExponential(2)}` : 'p=N/A';
    console.log(`  ${marker} ${r.id.padEnd(8)} ${r.status.padEnd(14)} ${pStr.padEnd(16)} n=${r.sample_size}`);
  }

  console.log('='.repeat(64));
  console.log(`  Total: ${allResults.length} | Confirmed: ${allResults.filter(r => r.status === 'confirmed').length} | Rejected: ${allResults.filter(r => r.status === 'rejected').length} | Inconclusive: ${allResults.filter(r => r.status === 'inconclusive').length}`);

  await closePg();
}

main().catch(async (err) => {
  console.error(err);
  await closePg();
  process.exit(1);
});
