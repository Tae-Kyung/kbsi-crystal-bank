/**
 * Quality Gate — 데이터 변경 전후 품질 검증 자동화
 *
 * 데이터 보완/확장 스크립트 실행 전후로 자동으로 품질을 검증하고,
 * 악화된 차원이 있으면 경고/롤백 권고를 제공합니다.
 *
 * Usage:
 *   # 1) 변경 전 스냅샷 저장
 *   npx tsx scripts/quality-gate.ts pre <작업명>
 *
 *   # 2) 데이터 변경 스크립트 실행 (사용자가 직접)
 *
 *   # 3) 변경 후 검증 + diff 비교
 *   npx tsx scripts/quality-gate.ts post <작업명>
 *
 *   # 4) 한 번에 wrap (pre → 명령 실행 → post)
 *   npx tsx scripts/quality-gate.ts wrap <작업명> -- <command...>
 *   npx tsx scripts/quality-gate.ts wrap "D-2 Expression" -- npx tsx scripts/harvest-expression-from-pdb.ts
 *
 *   # 5) 이력 조회
 *   npx tsx scripts/quality-gate.ts history
 *   npx tsx scripts/quality-gate.ts history <작업명>
 *
 * npm run quality:pre <작업명>
 * npm run quality:post <작업명>
 * npm run quality:wrap <작업명> -- <command...>
 * npm run quality:history
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ROOT = resolve(__dirname, '..');
const GATE_DIR = resolve(ROOT, 'data', 'quality-gate');
mkdirSync(GATE_DIR, { recursive: true });

// ─── Types ───
interface QualityMetric {
  name: string;
  dimension: string;
  value: number;
  total: number;
  pct: number;
  status: 'pass' | 'warn' | 'fail';
}

interface QualitySnapshot {
  timestamp: string;
  phase: 'pre' | 'post';
  jobName: string;
  metrics: QualityMetric[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    total: number;
    score: number;
    grade: string;
  };
  tableCounts: Record<string, number>;
}

interface GateReport {
  jobName: string;
  pre: QualitySnapshot;
  post: QualitySnapshot;
  diff: DiffItem[];
  verdict: 'PASS' | 'WARN' | 'FAIL';
  summary: string;
}

interface DiffItem {
  metric: string;
  dimension: string;
  before: number;
  after: number;
  delta: number;
  deltaPct: number;
  statusBefore: string;
  statusAfter: string;
  verdict: 'improved' | 'stable' | 'degraded';
}

// ─── Helpers ───
function fmt(n: number) { return n.toLocaleString(); }
function pct(n: number, total: number) { return total > 0 ? Math.round(n / total * 1000) / 10 : 0; }
function gradeFromPct(p: number): string {
  return p >= 90 ? 'A' : p >= 70 ? 'B' : p >= 50 ? 'C' : 'D';
}

async function tableCount(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

// ─── Collect Quality Metrics ───
async function collectMetrics(): Promise<{ metrics: QualityMetric[]; tableCounts: Record<string, number> }> {
  const metrics: QualityMetric[] = [];

  function addMetric(name: string, dimension: string, value: number, total: number, passThresh = 0.8, warnThresh = 0.5) {
    const p = pct(value, total);
    const ratio = total > 0 ? value / total : 0;
    const status: 'pass' | 'warn' | 'fail' = ratio >= passThresh ? 'pass' : ratio >= warnThresh ? 'warn' : 'fail';
    metrics.push({ name, dimension, value, total, pct: p, status });
  }

  // Table counts
  const tables: Record<string, number> = {};
  for (const t of ['kbsi_protein', 'kbsi_construct', 'kbsi_structure', 'kbsi_crystallization',
    'kbsi_expression', 'kbsi_purification', 'kbsi_characterization',
    'kbsi_diffraction', 'kbsi_nmr', 'kbsi_nmr_chemical_shift',
    'kbsi_ligand', 'kbsi_binding', 'kbsi_mutation', 'kbsi_embedding', 'kbsi_reference']) {
    tables[t] = await tableCount(t);
  }

  const totalCryst = tables['kbsi_crystallization'];
  const totalProt = tables['kbsi_protein'];
  const totalConst = tables['kbsi_construct'];

  // --- Completeness ---
  const crystWithPh = await tableCount('kbsi_crystallization', q => q.not('ph', 'is', null));
  addMetric('crystallization.ph', 'completeness', crystWithPh, totalCryst, 0.95, 0.8);

  const crystWithTemp = await tableCount('kbsi_crystallization', q => q.not('temperature', 'is', null));
  addMetric('crystallization.temperature', 'completeness', crystWithTemp, totalCryst, 0.9, 0.7);

  const crystWithPrecip = await tableCount('kbsi_crystallization', q => q.not('precipitant_type', 'is', null));
  addMetric('crystallization.precipitant', 'completeness', crystWithPrecip, totalCryst, 0.8, 0.5);

  const crystWithOutcome = await tableCount('kbsi_crystallization', q => q.not('outcome', 'is', null));
  addMetric('crystallization.outcome', 'completeness', crystWithOutcome, totalCryst, 0.99, 0.9);

  addMetric('pipeline.expression', 'completeness', tables['kbsi_expression'], totalConst, 0.5, 0.1);
  addMetric('pipeline.purification', 'completeness', tables['kbsi_purification'], totalConst, 0.1, 0.01);
  addMetric('pipeline.diffraction', 'completeness', tables['kbsi_diffraction'], totalConst, 0.5, 0.1);

  // --- Consistency ---
  const orphanConstructs = await tableCount('kbsi_construct', q => q.is('protein_id', null));
  addMetric('orphan_constructs', 'consistency', totalConst - orphanConstructs, totalConst, 0.99, 0.9);

  const outcomeNoSource = await tableCount('kbsi_crystallization', q =>
    q.not('outcome', 'is', null).is('source_type', null));
  addMetric('outcome_has_source_type', 'consistency', totalCryst - outcomeNoSource, totalCryst, 0.99, 0.9);

  // --- Accuracy ---
  const phOutlierLow = await tableCount('kbsi_crystallization', q =>
    q.lt('ph', 1).not('ph', 'is', null).neq('source_type', 'synthetic'));
  addMetric('ph_range_valid', 'accuracy', totalCryst - phOutlierLow, totalCryst, 0.999, 0.99);

  const phOutlierHigh = await tableCount('kbsi_crystallization', q =>
    q.gt('ph', 13).not('ph', 'is', null).neq('source_type', 'synthetic'));
  addMetric('ph_range_high_valid', 'accuracy', totalCryst - phOutlierHigh, totalCryst, 0.999, 0.99);

  const tempOutlierLow = await tableCount('kbsi_crystallization', q =>
    q.lt('temperature', -20).not('temperature', 'is', null).neq('source_type', 'synthetic'));
  addMetric('temp_range_valid', 'accuracy', totalCryst - tempOutlierLow, totalCryst, 0.999, 0.99);

  // --- Integrity ---
  const embCount = tables['kbsi_embedding'];
  addMetric('esm2_embedding', 'integrity', embCount, totalConst, 0.9, 0.5);

  const refCount = tables['kbsi_reference'];
  addMetric('reference_linkage', 'integrity', refCount, tables['kbsi_structure'], 0.5, 0.3);

  // --- Distribution ---
  const synthCount = await tableCount('kbsi_crystallization', q => q.eq('source_type', 'synthetic'));
  const expCount = totalCryst - synthCount;
  const successCount = await tableCount('kbsi_crystallization', q =>
    q.or('outcome.eq.single_crystal,outcome.eq.diffraction_quality'));
  addMetric('exp_vs_synth_ratio', 'distribution', expCount, totalCryst, 0.05, 0.01);

  const successRate = pct(successCount, totalCryst);
  // Success rate between 5-30% is healthy
  const successHealthy = successRate >= 5 && successRate <= 30;
  metrics.push({
    name: 'success_rate_healthy',
    dimension: 'distribution',
    value: successCount,
    total: totalCryst,
    pct: successRate,
    status: successHealthy ? 'pass' : 'warn',
  });

  // --- Provenance ---
  const withSourceType = await tableCount('kbsi_crystallization', q => q.not('source_type', 'is', null));
  addMetric('source_type_coverage', 'provenance', withSourceType, totalCryst, 0.99, 0.9);

  const withSourceDb = await tableCount('kbsi_crystallization', q => q.not('source_db', 'is', null));
  addMetric('source_db_coverage', 'provenance', withSourceDb, totalCryst, 0.99, 0.9);

  // --- Conformity ---
  const nonStdOutcome = await tableCount('kbsi_crystallization', q =>
    q.not('outcome', 'is', null)
      .not('outcome', 'in', '(clear,precipitate,phase_separation,microcrystal,single_crystal,diffraction_quality,skin,nucleation,spherulite)'));
  addMetric('outcome_enum_valid', 'conformity', totalCryst - nonStdOutcome, totalCryst, 0.99, 0.9);

  const nonStdSource = await tableCount('kbsi_crystallization', q =>
    q.not('source_type', 'is', null)
      .not('source_type', 'in', '(database,paper,synthetic,manual)'));
  addMetric('source_type_enum_valid', 'conformity', totalCryst - nonStdSource, totalCryst, 0.99, 0.9);

  // --- Shared constants ---
  const PAGE = 1000;

  // --- Cross-table Consistency (교차 테이블 정합성) ---
  console.log('  Checking cross-table consistency (sampling)...');

  // 1) Expression host vs construct.expression_system 일치 여부
  let exprConsist: any[] = [];
  let ecOff = 0;
  while (exprConsist.length < 5000) {
    const { data } = await supabase.from('kbsi_expression')
      .select('construct_id, host')
      .not('host', 'is', null)
      .range(ecOff, ecOff + PAGE - 1);
    if (!data || data.length === 0) break;
    exprConsist.push(...data);
    if (data.length < PAGE) break;
    ecOff += PAGE;
  }
  // Look up construct.expression_system for these
  const ecConstructIds = [...new Set(exprConsist.map(e => e.construct_id))].slice(0, 2000);
  let exprMatch = 0, exprChecked = 0;
  for (let i = 0; i < ecConstructIds.length; i += 200) {
    const batch = ecConstructIds.slice(i, i + 200);
    const { data: constructs } = await supabase.from('kbsi_construct')
      .select('id, expression_system')
      .in('id', batch)
      .not('expression_system', 'is', null);
    if (constructs) {
      const cMap = new Map(constructs.map(c => [c.id, c.expression_system?.toLowerCase()]));
      for (const e of exprConsist.filter(x => cMap.has(x.construct_id))) {
        exprChecked++;
        const cSys = cMap.get(e.construct_id) || '';
        const eHost = (e.host || '').toLowerCase();
        // Fuzzy match: both mention E. coli, both mention human, etc.
        if (cSys === eHost ||
            (cSys.includes('coli') && eHost.includes('coli')) ||
            (cSys.includes('sapiens') && eHost.includes('sapiens')) ||
            (cSys.includes('frugiperda') && eHost.includes('frugiperda')) ||
            (cSys.includes('pastoris') && eHost.includes('pastoris')) ||
            (cSys.includes('cerevisiae') && eHost.includes('cerevisiae'))) {
          exprMatch++;
        }
      }
    }
  }
  if (exprChecked > 0) {
    addMetric('consistency.expr_host_match', 'consistency', exprMatch, exprChecked, 0.85, 0.6);
  }

  // 2) Diffraction records should link to constructs with crystallization success
  let diffConsist: any[] = [];
  let dcOff = 0;
  while (diffConsist.length < 5000) {
    const { data } = await supabase.from('kbsi_diffraction')
      .select('construct_id')
      .range(dcOff, dcOff + PAGE - 1);
    if (!data || data.length === 0) break;
    diffConsist.push(...data);
    if (data.length < PAGE) break;
    dcOff += PAGE;
  }
  const dcConstructIds = [...new Set(diffConsist.map(d => d.construct_id))].slice(0, 2000);
  let diffHasCryst = 0;
  for (let i = 0; i < dcConstructIds.length; i += 200) {
    const batch = dcConstructIds.slice(i, i + 200);
    const { data: crystals } = await supabase.from('kbsi_crystallization')
      .select('construct_id')
      .in('construct_id', batch)
      .or('outcome.eq.single_crystal,outcome.eq.diffraction_quality')
      .limit(1000);
    if (crystals) {
      const found = new Set(crystals.map(c => c.construct_id));
      diffHasCryst += batch.filter(id => found.has(id)).length;
    }
  }
  addMetric('consistency.diffraction_has_success', 'consistency', diffHasCryst, dcConstructIds.length, 0.8, 0.5);

  // --- Cross-field Logic (값 범위 일관성) ---
  console.log('  Checking cross-field logic (sampling)...');

  // 3) success outcome but protein_concentration = 0
  const successZeroProtein = await tableCount('kbsi_crystallization', q =>
    q.or('outcome.eq.single_crystal,outcome.eq.diffraction_quality')
      .eq('protein_concentration', 0)
      .neq('source_type', 'synthetic'));
  const totalSuccess = await tableCount('kbsi_crystallization', q =>
    q.or('outcome.eq.single_crystal,outcome.eq.diffraction_quality')
      .neq('source_type', 'synthetic'));
  addMetric('logic.success_has_protein_conc', 'consistency', totalSuccess - successZeroProtein, totalSuccess, 0.95, 0.8);

  // 4) pH extreme (<2 or >12) with success outcome (suspicious)
  const extremePhSuccess = await tableCount('kbsi_crystallization', q =>
    q.or('outcome.eq.single_crystal,outcome.eq.diffraction_quality')
      .neq('source_type', 'synthetic')
      .or('ph.lt.2,ph.gt.12'));
  addMetric('logic.no_extreme_ph_success', 'consistency', totalSuccess - extremePhSuccess, totalSuccess, 0.99, 0.95);

  // 5) temperature < 0 with success outcome (unusual)
  const coldSuccess = await tableCount('kbsi_crystallization', q =>
    q.or('outcome.eq.single_crystal,outcome.eq.diffraction_quality')
      .neq('source_type', 'synthetic')
      .lt('temperature', 0));
  addMetric('logic.no_subzero_success', 'consistency', totalSuccess - coldSuccess, totalSuccess, 0.99, 0.95);

  // --- Source Consistency (출처 간 일관성) ---
  console.log('  Checking source consistency (sampling)...');

  // 6) database records should have non-null precipitant or condition_detail
  const dbNoPrecipNoDetail = await tableCount('kbsi_crystallization', q =>
    q.eq('source_type', 'database')
      .is('precipitant_type', null)
      .is('condition_detail', null));
  const totalDb = await tableCount('kbsi_crystallization', q => q.eq('source_type', 'database'));
  addMetric('source.db_has_condition_info', 'consistency', totalDb - dbNoPrecipNoDetail, totalDb, 0.8, 0.5);

  // 7) synthetic records must have outcome
  const synthNoOutcome = await tableCount('kbsi_crystallization', q =>
    q.eq('source_type', 'synthetic').is('outcome', null));
  const totalSynth = await tableCount('kbsi_crystallization', q => q.eq('source_type', 'synthetic'));
  addMetric('source.synth_has_outcome', 'consistency', totalSynth - synthNoOutcome, totalSynth, 0.999, 0.99);

  // --- Deduplication (중복 체크) ---
  console.log('  Checking duplicates (sampling)...');
  const DEDUP_SAMPLE = 50000;

  // Construct: same name + protein_id
  let constSample: any[] = [];
  let cOff = 0;
  while (constSample.length < DEDUP_SAMPLE) {
    const { data } = await supabase.from('kbsi_construct').select('id, name, protein_id').range(cOff, cOff + PAGE - 1);
    if (!data || data.length === 0) break;
    constSample.push(...data);
    if (data.length < PAGE) break;
    cOff += PAGE;
  }
  const constGroups = new Map<string, number>();
  for (const c of constSample) {
    const key = `${c.name}::${c.protein_id}`;
    constGroups.set(key, (constGroups.get(key) || 0) + 1);
  }
  const constDups = [...constGroups.values()].filter(v => v > 1).reduce((s, v) => s + v - 1, 0);
  const constUnique = constSample.length - constDups;
  addMetric('dedup.construct', 'deduplication', constUnique, constSample.length, 0.99, 0.9);

  // Expression: same construct_id + host
  let exprSample: any[] = [];
  let eOff = 0;
  while (exprSample.length < DEDUP_SAMPLE) {
    const { data } = await supabase.from('kbsi_expression').select('id, construct_id, host').range(eOff, eOff + PAGE - 1);
    if (!data || data.length === 0) break;
    exprSample.push(...data);
    if (data.length < PAGE) break;
    eOff += PAGE;
  }
  const exprGroups = new Map<string, number>();
  for (const e of exprSample) {
    const key = `${e.construct_id}::${e.host}`;
    exprGroups.set(key, (exprGroups.get(key) || 0) + 1);
  }
  const exprDups = [...exprGroups.values()].filter(v => v > 1).reduce((s, v) => s + v - 1, 0);
  const exprUnique = exprSample.length - exprDups;
  addMetric('dedup.expression', 'deduplication', exprUnique, exprSample.length, 0.95, 0.8);

  // Crystallization (non-synthetic): same construct_id + ph + temp + precipitant + outcome
  let crystSample: any[] = [];
  let crOff = 0;
  while (crystSample.length < DEDUP_SAMPLE) {
    const { data } = await supabase.from('kbsi_crystallization')
      .select('id, construct_id, ph, temperature, precipitant_type, outcome')
      .neq('source_type', 'synthetic')
      .range(crOff, crOff + PAGE - 1);
    if (!data || data.length === 0) break;
    crystSample.push(...data);
    if (data.length < PAGE) break;
    crOff += PAGE;
  }
  const crystGroups = new Map<string, number>();
  for (const c of crystSample) {
    const key = `${c.construct_id}::${c.ph}::${c.temperature}::${c.precipitant_type}::${c.outcome}`;
    crystGroups.set(key, (crystGroups.get(key) || 0) + 1);
  }
  const crystDups = [...crystGroups.values()].filter(v => v > 1).reduce((s, v) => s + v - 1, 0);
  const crystUnique = crystSample.length - crystDups;
  addMetric('dedup.crystallization', 'deduplication', crystUnique, crystSample.length, 0.95, 0.8);

  // Diffraction: same construct_id + resolution
  let diffSample: any[] = [];
  let dOff = 0;
  while (diffSample.length < DEDUP_SAMPLE) {
    const { data } = await supabase.from('kbsi_diffraction').select('id, construct_id, resolution').range(dOff, dOff + PAGE - 1);
    if (!data || data.length === 0) break;
    diffSample.push(...data);
    if (data.length < PAGE) break;
    dOff += PAGE;
  }
  const diffGroups = new Map<string, number>();
  for (const d of diffSample) {
    const key = `${d.construct_id}::${d.resolution}`;
    diffGroups.set(key, (diffGroups.get(key) || 0) + 1);
  }
  const diffDups = [...diffGroups.values()].filter(v => v > 1).reduce((s, v) => s + v - 1, 0);
  const diffUnique = diffSample.length - diffDups;
  addMetric('dedup.diffraction', 'deduplication', diffUnique, diffSample.length, 0.95, 0.8);

  return { metrics, tableCounts: tables };
}

// ─── Build Snapshot ───
async function buildSnapshot(phase: 'pre' | 'post', jobName: string): Promise<QualitySnapshot> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Quality Gate — ${phase.toUpperCase()} check: "${jobName}"`);
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  console.log('\nCollecting metrics...');
  const { metrics, tableCounts } = await collectMetrics();

  const pass = metrics.filter(m => m.status === 'pass').length;
  const warn = metrics.filter(m => m.status === 'warn').length;
  const fail = metrics.filter(m => m.status === 'fail').length;
  const total = metrics.length;
  const score = Math.round(pass / total * 100);

  const snapshot: QualitySnapshot = {
    timestamp: new Date().toISOString(),
    phase,
    jobName,
    metrics,
    summary: { pass, warn, fail, total, score, grade: gradeFromPct(score) },
    tableCounts,
  };

  // Print metrics
  const dims = [...new Set(metrics.map(m => m.dimension))];
  for (const dim of dims) {
    const dimMetrics = metrics.filter(m => m.dimension === dim);
    const icon = dimMetrics.every(m => m.status === 'pass') ? '✓' :
                 dimMetrics.some(m => m.status === 'fail') ? '✗' : '⚠';
    console.log(`\n${icon} ${dim.toUpperCase()}`);
    for (const m of dimMetrics) {
      const si = m.status === 'pass' ? '  ✓' : m.status === 'warn' ? '  ⚠' : '  ✗';
      console.log(`${si} ${m.name}: ${fmt(m.value)}/${fmt(m.total)} (${m.pct}%)`);
    }
  }

  // Print table counts
  console.log('\n--- Table Counts ---');
  for (const [t, c] of Object.entries(tableCounts)) {
    console.log(`  ${t.replace('kbsi_', '').padEnd(22)} ${fmt(c).padStart(12)}`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Score: ${pass}/${total} (${score}%) ${snapshot.summary.grade}`);
  console.log('─'.repeat(60));

  return snapshot;
}

// ─── Save / Load Snapshot ───
function snapshotPath(jobName: string, phase: 'pre' | 'post'): string {
  const safe = jobName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return resolve(GATE_DIR, `${safe}_${phase}.json`);
}

function reportPath(jobName: string): string {
  const safe = jobName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return resolve(GATE_DIR, `${safe}_report_${ts}.json`);
}

function saveSnapshot(snapshot: QualitySnapshot) {
  const path = snapshotPath(snapshot.jobName, snapshot.phase);
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot saved: ${path}`);
}

function loadSnapshot(jobName: string, phase: 'pre' | 'post'): QualitySnapshot | null {
  const path = snapshotPath(jobName, phase);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ─── Compare Pre/Post ───
function compareSnapshots(pre: QualitySnapshot, post: QualitySnapshot): DiffItem[] {
  const diffs: DiffItem[] = [];

  for (const postM of post.metrics) {
    const preM = pre.metrics.find(m => m.name === postM.name);
    if (!preM) continue;

    const delta = postM.pct - preM.pct;
    const deltaPct = preM.pct > 0 ? (delta / preM.pct) * 100 : (postM.pct > 0 ? 100 : 0);

    let verdict: 'improved' | 'stable' | 'degraded';
    if (delta > 0.5) verdict = 'improved';
    else if (delta < -0.5) verdict = 'degraded';
    else verdict = 'stable';

    diffs.push({
      metric: postM.name,
      dimension: postM.dimension,
      before: preM.pct,
      after: postM.pct,
      delta: Math.round(delta * 10) / 10,
      deltaPct: Math.round(deltaPct * 10) / 10,
      statusBefore: preM.status,
      statusAfter: postM.status,
      verdict,
    });
  }

  // Table count diffs
  for (const [table, postCount] of Object.entries(post.tableCounts)) {
    const preCount = pre.tableCounts[table] || 0;
    if (postCount !== preCount) {
      const delta = postCount - preCount;
      diffs.push({
        metric: `table:${table}`,
        dimension: 'volume',
        before: preCount,
        after: postCount,
        delta,
        deltaPct: preCount > 0 ? Math.round(delta / preCount * 1000) / 10 : 100,
        statusBefore: 'n/a',
        statusAfter: 'n/a',
        verdict: delta > 0 ? 'improved' : delta < 0 ? 'degraded' : 'stable',
      });
    }
  }

  return diffs;
}

// ─── Generate Report ───
function generateReport(pre: QualitySnapshot, post: QualitySnapshot, diffs: DiffItem[]): GateReport {
  const degraded = diffs.filter(d => d.verdict === 'degraded' && d.dimension !== 'volume');
  const degradedFail = degraded.filter(d => d.statusAfter === 'fail' && d.statusBefore !== 'fail');

  let verdict: 'PASS' | 'WARN' | 'FAIL';
  if (degradedFail.length > 0) verdict = 'FAIL';
  else if (degraded.length > 0) verdict = 'WARN';
  else verdict = 'PASS';

  const improved = diffs.filter(d => d.verdict === 'improved' && d.dimension !== 'volume');
  const summary = [
    `Score: ${pre.summary.score}% → ${post.summary.score}% (${post.summary.score - pre.summary.score >= 0 ? '+' : ''}${post.summary.score - pre.summary.score}%)`,
    `Improved: ${improved.length} metrics`,
    `Degraded: ${degraded.length} metrics`,
    degradedFail.length > 0 ? `NEW FAILURES: ${degradedFail.map(d => d.metric).join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  return { jobName: pre.jobName, pre, post, diff: diffs, verdict, summary };
}

// ─── Print Report ───
function printReport(report: GateReport) {
  const { pre, post, diff, verdict } = report;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  QUALITY GATE REPORT: "${report.jobName}"`);
  console.log(`  Pre:  ${pre.timestamp}`);
  console.log(`  Post: ${post.timestamp}`);
  console.log('═'.repeat(70));

  // Score change
  const scoreDelta = post.summary.score - pre.summary.score;
  console.log(`\n  Score: ${pre.summary.score}% (${pre.summary.grade}) → ${post.summary.score}% (${post.summary.grade})  [${scoreDelta >= 0 ? '+' : ''}${scoreDelta}%]`);

  // Table volume changes
  const volumeDiffs = diff.filter(d => d.dimension === 'volume');
  if (volumeDiffs.length > 0) {
    console.log('\n  --- Data Volume Changes ---');
    for (const d of volumeDiffs) {
      const arrow = d.delta > 0 ? '↑' : d.delta < 0 ? '↓' : '→';
      console.log(`  ${d.metric.replace('table:', '').padEnd(30)} ${fmt(d.before).padStart(12)} → ${fmt(d.after).padStart(12)}  ${arrow} ${d.delta > 0 ? '+' : ''}${fmt(d.delta)} (${d.deltaPct > 0 ? '+' : ''}${d.deltaPct}%)`);
    }
  }

  // Quality metric changes
  const qualityDiffs = diff.filter(d => d.dimension !== 'volume');
  const improved = qualityDiffs.filter(d => d.verdict === 'improved');
  const degraded = qualityDiffs.filter(d => d.verdict === 'degraded');
  const stable = qualityDiffs.filter(d => d.verdict === 'stable');

  if (improved.length > 0) {
    console.log('\n  --- Improved Metrics ---');
    for (const d of improved) {
      console.log(`  ✓ ${d.metric.padEnd(35)} ${d.before}% → ${d.after}%  (+${d.delta}%p)`);
    }
  }

  if (degraded.length > 0) {
    console.log('\n  --- DEGRADED Metrics (ATTENTION) ---');
    for (const d of degraded) {
      console.log(`  ✗ ${d.metric.padEnd(35)} ${d.before}% → ${d.after}%  (${d.delta}%p)  [${d.statusBefore} → ${d.statusAfter}]`);
    }
  }

  console.log(`\n  Stable: ${stable.length} metrics unchanged`);

  // Verdict
  const verdictIcon = verdict === 'PASS' ? '✓' : verdict === 'WARN' ? '⚠' : '✗';
  const verdictColor = verdict === 'PASS' ? 'APPROVED' : verdict === 'WARN' ? 'APPROVED WITH WARNINGS' : 'REJECTED — REVIEW REQUIRED';
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${verdictIcon} VERDICT: ${verdict} — ${verdictColor}`);
  if (verdict === 'FAIL') {
    console.log(`\n  Action required: Review degraded metrics before proceeding.`);
    console.log(`  Consider rolling back if data quality is unacceptable.`);
  } else if (verdict === 'WARN') {
    console.log(`\n  Some metrics degraded slightly. Review if acceptable for your use case.`);
  }
  console.log('═'.repeat(70));
}

// ─── Commands ───
async function cmdPre(jobName: string) {
  const snapshot = await buildSnapshot('pre', jobName);
  saveSnapshot(snapshot);
  console.log(`\nNext: Run your data modification, then:\n  npx tsx scripts/quality-gate.ts post "${jobName}"`);
}

async function cmdPost(jobName: string) {
  const pre = loadSnapshot(jobName, 'pre');
  if (!pre) {
    console.error(`\nERROR: No pre-snapshot found for "${jobName}".`);
    console.error(`Run: npx tsx scripts/quality-gate.ts pre "${jobName}" first.`);
    process.exit(1);
  }

  const post = await buildSnapshot('post', jobName);
  saveSnapshot(post);

  const diffs = compareSnapshots(pre, post);
  const report = generateReport(pre, post, diffs);
  printReport(report);

  // Save report
  const rPath = reportPath(jobName);
  writeFileSync(rPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${rPath}`);

  process.exit(report.verdict === 'FAIL' ? 1 : 0);
}

async function cmdWrap(jobName: string, command: string[]) {
  // Pre
  const pre = await buildSnapshot('pre', jobName);
  saveSnapshot(pre);

  // Execute command
  const cmd = command.join(' ');
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Executing: ${cmd}`);
  console.log('═'.repeat(60));

  const startTime = Date.now();
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT, timeout: 600_000 });
  } catch (e: any) {
    console.error(`\nCommand failed with exit code ${e.status}`);
    console.log('Running post-check anyway to assess impact...');
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCommand completed in ${elapsed}s`);

  // Post
  const post = await buildSnapshot('post', jobName);
  saveSnapshot(post);

  const diffs = compareSnapshots(pre, post);
  const report = generateReport(pre, post, diffs);
  printReport(report);

  const rPath = reportPath(jobName);
  writeFileSync(rPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${rPath}`);

  process.exit(report.verdict === 'FAIL' ? 1 : 0);
}

function cmdHistory(jobName?: string) {
  const files = readdirSync(GATE_DIR).filter(f => f.endsWith('_report_') || f.includes('_report_'));
  const reports = files
    .filter(f => f.includes('_report_'))
    .filter(f => !jobName || f.startsWith(jobName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()))
    .sort();

  if (reports.length === 0) {
    console.log('No quality gate reports found.');
    return;
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log('  Quality Gate History');
  console.log('═'.repeat(70));
  console.log(`\n${'Date'.padEnd(22)} ${'Job'.padEnd(25)} ${'Score'.padEnd(14)} ${'Verdict'.padEnd(10)}`);
  console.log('─'.repeat(70));

  for (const f of reports) {
    try {
      const report: GateReport = JSON.parse(readFileSync(resolve(GATE_DIR, f), 'utf-8'));
      const date = report.post.timestamp.slice(0, 19).replace('T', ' ');
      const scoreDelta = report.post.summary.score - report.pre.summary.score;
      console.log(
        `${date.padEnd(22)} ${report.jobName.padEnd(25)} ` +
        `${report.pre.summary.score}→${report.post.summary.score}% (${scoreDelta >= 0 ? '+' : ''}${scoreDelta})`.padEnd(14) +
        ` ${report.verdict}`
      );
    } catch { /* skip corrupt files */ }
  }
  console.log('═'.repeat(70));
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
Quality Gate — 데이터 변경 전후 품질 검증

Commands:
  pre <jobName>                    변경 전 스냅샷 저장
  post <jobName>                   변경 후 검증 + diff 리포트
  wrap <jobName> -- <command...>   pre → 실행 → post 한번에
  history [jobName]                이력 조회

Examples:
  npx tsx scripts/quality-gate.ts pre "D-2 Expression"
  npx tsx scripts/quality-gate.ts post "D-2 Expression"
  npx tsx scripts/quality-gate.ts wrap "D-1 Precipitant" -- npm run enrich:precipitant
  npx tsx scripts/quality-gate.ts history
`);
    return;
  }

  switch (command) {
    case 'pre': {
      const jobName = args[1];
      if (!jobName) { console.error('Usage: quality-gate.ts pre <jobName>'); process.exit(1); }
      await cmdPre(jobName);
      break;
    }
    case 'post': {
      const jobName = args[1];
      if (!jobName) { console.error('Usage: quality-gate.ts post <jobName>'); process.exit(1); }
      await cmdPost(jobName);
      break;
    }
    case 'wrap': {
      const dashIdx = args.indexOf('--');
      if (dashIdx < 0) { console.error('Usage: quality-gate.ts wrap <jobName> -- <command...>'); process.exit(1); }
      const jobName = args.slice(1, dashIdx).join(' ');
      const cmd = args.slice(dashIdx + 1);
      if (!jobName || cmd.length === 0) { console.error('Usage: quality-gate.ts wrap <jobName> -- <command...>'); process.exit(1); }
      await cmdWrap(jobName, cmd);
      break;
    }
    case 'history': {
      cmdHistory(args[1]);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(console.error);
