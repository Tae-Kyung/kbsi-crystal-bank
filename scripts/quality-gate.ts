/**
 * Quality Gate — 데이터 변경 전후 품질 검증 자동화
 *
 * Usage:
 *   npx tsx scripts/quality-gate.ts pre <작업명>
 *   npx tsx scripts/quality-gate.ts post <작업명>
 *   npx tsx scripts/quality-gate.ts wrap <작업명> -- <command...>
 *   npx tsx scripts/quality-gate.ts history [작업명]
 */

import pg from 'pg';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const pgClient = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const ROOT = resolve(__dirname, '..');
const GATE_DIR = resolve(ROOT, 'data', 'quality-gate');
mkdirSync(GATE_DIR, { recursive: true });

interface QualityMetric { name: string; dimension: string; value: number; total: number; pct: number; status: 'pass' | 'warn' | 'fail'; }
interface QualitySnapshot { timestamp: string; phase: 'pre' | 'post'; jobName: string; metrics: QualityMetric[]; summary: { pass: number; warn: number; fail: number; total: number; score: number; grade: string }; tableCounts: Record<string, number>; }
interface GateReport { jobName: string; pre: QualitySnapshot; post: QualitySnapshot; diff: DiffItem[]; verdict: 'PASS' | 'WARN' | 'FAIL'; summary: string; }
interface DiffItem { metric: string; dimension: string; before: number; after: number; delta: number; deltaPct: number; statusBefore: string; statusAfter: string; verdict: 'improved' | 'stable' | 'degraded'; }

function fmt(n: number) { return n.toLocaleString(); }
function pctCalc(n: number, total: number) { return total > 0 ? Math.round(n / total * 1000) / 10 : 0; }
function gradeFromPct(p: number): string { return p >= 90 ? 'A' : p >= 70 ? 'B' : p >= 50 ? 'C' : 'D'; }

async function tableCount(table: string, where = '', params: any[] = []): Promise<number> {
  const sql = where ? `SELECT COUNT(*) as c FROM ${table} WHERE ${where}` : `SELECT COUNT(*) as c FROM ${table}`;
  const { rows: [{ c }] } = await pgClient.query(sql, params);
  return parseInt(c);
}

async function collectMetrics(): Promise<{ metrics: QualityMetric[]; tableCounts: Record<string, number> }> {
  const metrics: QualityMetric[] = [];
  function addMetric(name: string, dimension: string, value: number, total: number, passThresh = 0.8, warnThresh = 0.5) {
    const p = pctCalc(value, total);
    const ratio = total > 0 ? value / total : 0;
    const status: 'pass' | 'warn' | 'fail' = ratio >= passThresh ? 'pass' : ratio >= warnThresh ? 'warn' : 'fail';
    metrics.push({ name, dimension, value, total, pct: p, status });
  }

  const tables: Record<string, number> = {};
  for (const t of ['kbsi_protein', 'kbsi_construct', 'kbsi_structure', 'kbsi_crystallization', 'kbsi_expression', 'kbsi_purification', 'kbsi_characterization', 'kbsi_diffraction', 'kbsi_nmr', 'kbsi_nmr_chemical_shift', 'kbsi_ligand', 'kbsi_binding', 'kbsi_mutation', 'kbsi_embedding', 'kbsi_reference']) {
    try { tables[t] = await tableCount(t); } catch { tables[t] = 0; }
  }

  const totalCryst = tables['kbsi_crystallization'];
  const totalConst = tables['kbsi_construct'];

  // Completeness
  addMetric('crystallization.ph', 'completeness', await tableCount('kbsi_crystallization', 'ph IS NOT NULL'), totalCryst, 0.95, 0.8);
  addMetric('crystallization.temperature', 'completeness', await tableCount('kbsi_crystallization', 'temperature IS NOT NULL'), totalCryst, 0.9, 0.7);
  addMetric('crystallization.precipitant', 'completeness', await tableCount('kbsi_crystallization', 'precipitant_type IS NOT NULL'), totalCryst, 0.8, 0.5);
  addMetric('crystallization.outcome', 'completeness', await tableCount('kbsi_crystallization', 'outcome IS NOT NULL'), totalCryst, 0.99, 0.9);
  addMetric('pipeline.expression', 'completeness', tables['kbsi_expression'], totalConst, 0.5, 0.1);
  addMetric('pipeline.diffraction', 'completeness', tables['kbsi_diffraction'], totalConst, 0.5, 0.1);

  // Consistency
  addMetric('orphan_constructs', 'consistency', totalConst - await tableCount('kbsi_construct', 'protein_id IS NULL'), totalConst, 0.99, 0.9);

  // Accuracy
  addMetric('ph_range_valid', 'accuracy', totalCryst - await tableCount('kbsi_crystallization', `ph < 1 AND ph IS NOT NULL AND source_type != 'synthetic'`), totalCryst, 0.999, 0.99);

  // Integrity
  addMetric('esm2_embedding', 'integrity', tables['kbsi_embedding'], totalConst, 0.9, 0.5);
  addMetric('reference_linkage', 'integrity', tables['kbsi_reference'], tables['kbsi_structure'], 0.5, 0.3);

  // Distribution
  const synthCount = await tableCount('kbsi_crystallization', `source_type = 'synthetic'`);
  const expCount = totalCryst - synthCount;
  addMetric('exp_vs_synth_ratio', 'distribution', expCount, totalCryst, 0.05, 0.01);

  // Provenance
  addMetric('source_type_coverage', 'provenance', await tableCount('kbsi_crystallization', 'source_type IS NOT NULL'), totalCryst, 0.99, 0.9);
  addMetric('source_db_coverage', 'provenance', await tableCount('kbsi_crystallization', 'source_db IS NOT NULL'), totalCryst, 0.99, 0.9);

  return { metrics, tableCounts: tables };
}

async function buildSnapshot(phase: 'pre' | 'post', jobName: string): Promise<QualitySnapshot> {
  console.log(`\n${'='.repeat(60)}\n  Quality Gate -- ${phase.toUpperCase()} check: "${jobName}"\n  ${new Date().toISOString()}\n${'='.repeat(60)}\n\nCollecting metrics...`);
  const { metrics, tableCounts } = await collectMetrics();
  const pass = metrics.filter(m => m.status === 'pass').length;
  const warn = metrics.filter(m => m.status === 'warn').length;
  const fail = metrics.filter(m => m.status === 'fail').length;
  const total = metrics.length;
  const score = Math.round(pass / total * 100);
  const snapshot: QualitySnapshot = { timestamp: new Date().toISOString(), phase, jobName, metrics, summary: { pass, warn, fail, total, score, grade: gradeFromPct(score) }, tableCounts };

  const dims = [...new Set(metrics.map(m => m.dimension))];
  for (const dim of dims) { console.log(`\n  ${dim.toUpperCase()}`); for (const m of metrics.filter(m => m.dimension === dim)) console.log(`    ${m.status === 'pass' ? 'V' : m.status === 'warn' ? '!' : 'X'} ${m.name}: ${fmt(m.value)}/${fmt(m.total)} (${m.pct}%)`); }
  console.log(`\n--- Table Counts ---`);
  for (const [t, c] of Object.entries(tableCounts)) console.log(`  ${t.replace('kbsi_', '').padEnd(22)} ${fmt(c).padStart(12)}`);
  console.log(`\n  Score: ${pass}/${total} (${score}%) ${snapshot.summary.grade}`);
  return snapshot;
}

function snapshotPath(jobName: string, phase: 'pre' | 'post'): string { return resolve(GATE_DIR, `${jobName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}_${phase}.json`); }
function reportPath(jobName: string): string { return resolve(GATE_DIR, `${jobName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}_report_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`); }
function saveSnapshot(s: QualitySnapshot) { writeFileSync(snapshotPath(s.jobName, s.phase), JSON.stringify(s, null, 2)); }
function loadSnapshot(jobName: string, phase: 'pre' | 'post'): QualitySnapshot | null { const p = snapshotPath(jobName, phase); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null; }

function compareSnapshots(pre: QualitySnapshot, post: QualitySnapshot): DiffItem[] {
  const diffs: DiffItem[] = [];
  for (const postM of post.metrics) {
    const preM = pre.metrics.find(m => m.name === postM.name);
    if (!preM) continue;
    const delta = postM.pct - preM.pct;
    const deltaPct = preM.pct > 0 ? (delta / preM.pct) * 100 : (postM.pct > 0 ? 100 : 0);
    const verdict: 'improved' | 'stable' | 'degraded' = delta > 0.5 ? 'improved' : delta < -0.5 ? 'degraded' : 'stable';
    diffs.push({ metric: postM.name, dimension: postM.dimension, before: preM.pct, after: postM.pct, delta: Math.round(delta * 10) / 10, deltaPct: Math.round(deltaPct * 10) / 10, statusBefore: preM.status, statusAfter: postM.status, verdict });
  }
  for (const [table, postCount] of Object.entries(post.tableCounts)) {
    const preCount = pre.tableCounts[table] || 0;
    if (postCount !== preCount) {
      const delta = postCount - preCount;
      diffs.push({ metric: `table:${table}`, dimension: 'volume', before: preCount, after: postCount, delta, deltaPct: preCount > 0 ? Math.round(delta / preCount * 1000) / 10 : 100, statusBefore: 'n/a', statusAfter: 'n/a', verdict: delta > 0 ? 'improved' : delta < 0 ? 'degraded' : 'stable' });
    }
  }
  return diffs;
}

function generateReport(pre: QualitySnapshot, post: QualitySnapshot, diffs: DiffItem[]): GateReport {
  const degraded = diffs.filter(d => d.verdict === 'degraded' && d.dimension !== 'volume');
  const degradedFail = degraded.filter(d => d.statusAfter === 'fail' && d.statusBefore !== 'fail');
  const verdict: 'PASS' | 'WARN' | 'FAIL' = degradedFail.length > 0 ? 'FAIL' : degraded.length > 0 ? 'WARN' : 'PASS';
  const summary = `Score: ${pre.summary.score}% -> ${post.summary.score}% | Degraded: ${degraded.length}`;
  return { jobName: pre.jobName, pre, post, diff: diffs, verdict, summary };
}

function printReport(report: GateReport) {
  const { pre, post, diff, verdict } = report;
  console.log(`\n${'='.repeat(70)}\n  QUALITY GATE REPORT: "${report.jobName}"\n  Verdict: ${verdict}\n  Score: ${pre.summary.score}% -> ${post.summary.score}%\n${'='.repeat(70)}`);
  const volumeDiffs = diff.filter(d => d.dimension === 'volume');
  if (volumeDiffs.length > 0) { console.log('\n  --- Data Volume Changes ---'); for (const d of volumeDiffs) console.log(`  ${d.metric.replace('table:', '').padEnd(30)} ${fmt(d.before).padStart(12)} -> ${fmt(d.after).padStart(12)}  (${d.deltaPct > 0 ? '+' : ''}${d.deltaPct}%)`); }
  const improved = diff.filter(d => d.verdict === 'improved' && d.dimension !== 'volume');
  const degradedList = diff.filter(d => d.verdict === 'degraded' && d.dimension !== 'volume');
  if (improved.length > 0) { console.log('\n  --- Improved ---'); for (const d of improved) console.log(`  V ${d.metric.padEnd(35)} ${d.before}% -> ${d.after}%`); }
  if (degradedList.length > 0) { console.log('\n  --- DEGRADED ---'); for (const d of degradedList) console.log(`  X ${d.metric.padEnd(35)} ${d.before}% -> ${d.after}%`); }
  console.log('='.repeat(70));
}

async function cmdPre(jobName: string) { const snapshot = await buildSnapshot('pre', jobName); saveSnapshot(snapshot); console.log(`\nNext: Run your data modification, then:\n  npx tsx scripts/quality-gate.ts post "${jobName}"`); }

async function cmdPost(jobName: string) {
  const pre = loadSnapshot(jobName, 'pre');
  if (!pre) { console.error(`No pre-snapshot found for "${jobName}". Run pre first.`); process.exit(1); }
  const post = await buildSnapshot('post', jobName); saveSnapshot(post);
  const diffs = compareSnapshots(pre, post);
  const report = generateReport(pre, post, diffs);
  printReport(report);
  const rPath = reportPath(jobName);
  writeFileSync(rPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${rPath}`);
  process.exit(report.verdict === 'FAIL' ? 1 : 0);
}

async function cmdWrap(jobName: string, command: string[]) {
  const pre = await buildSnapshot('pre', jobName); saveSnapshot(pre);
  const cmd = command.join(' ');
  console.log(`\n  Executing: ${cmd}`);
  const startTime = Date.now();
  try { execSync(cmd, { stdio: 'inherit', cwd: ROOT, timeout: 600_000 }); } catch (e: any) { console.error(`Command failed with exit code ${e.status}`); }
  console.log(`\nCommand completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  const post = await buildSnapshot('post', jobName); saveSnapshot(post);
  const diffs = compareSnapshots(pre, post);
  const report = generateReport(pre, post, diffs);
  printReport(report);
  writeFileSync(reportPath(jobName), JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'FAIL' ? 1 : 0);
}

function cmdHistory(jobName?: string) {
  const files = readdirSync(GATE_DIR).filter(f => f.includes('_report_')).filter(f => !jobName || f.startsWith(jobName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase())).sort();
  if (files.length === 0) { console.log('No quality gate reports found.'); return; }
  console.log(`\n  Quality Gate History`);
  for (const f of files) {
    try { const report: GateReport = JSON.parse(readFileSync(resolve(GATE_DIR, f), 'utf-8')); console.log(`  ${report.post.timestamp.slice(0, 19)} ${report.jobName.padEnd(25)} ${report.pre.summary.score}->${report.post.summary.score}% ${report.verdict}`); }
    catch { /* skip */ }
  }
}

async function main() {
  await pgClient.connect();
  try {
    const args = process.argv.slice(2);
    const command = args[0];
    if (!command || command === '--help') { console.log('Usage: quality-gate.ts <pre|post|wrap|history> <jobName>'); return; }
    switch (command) {
      case 'pre': { const jobName = args[1]; if (!jobName) { console.error('Usage: quality-gate.ts pre <jobName>'); process.exit(1); } await cmdPre(jobName); break; }
      case 'post': { const jobName = args[1]; if (!jobName) { console.error('Usage: quality-gate.ts post <jobName>'); process.exit(1); } await cmdPost(jobName); break; }
      case 'wrap': { const dashIdx = args.indexOf('--'); if (dashIdx < 0) { console.error('Usage: quality-gate.ts wrap <jobName> -- <command...>'); process.exit(1); } const jobName = args.slice(1, dashIdx).join(' '); const cmd = args.slice(dashIdx + 1); await cmdWrap(jobName, cmd); break; }
      case 'history': { cmdHistory(args[1]); break; }
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } finally {
    await pgClient.end();
  }
}

main().catch(console.error);
