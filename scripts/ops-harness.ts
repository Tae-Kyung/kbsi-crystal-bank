/**
 * KBSI 결정화은행 운영 하네스
 * npx tsx scripts/ops-harness.ts [command]
 */

import pg from 'pg';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const pgClient = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kbsi-crystal-bank.vercel.app';
const ROOT = resolve(__dirname, '..');
const METRICS_DIR = resolve(ROOT, 'data', 'metrics-history');
const TREND_THRESHOLD = 0.05;

interface MetricsSnapshot {
  timestamp: string; date: string; tables: Record<string, number>;
  crystallization: { total: number; experimental: number; synthetic: number; field_coverage: { ph: number; temperature: number; precipitant: number } };
  quality: { ph_outliers: { low: number; high: number }; temp_outliers: { low: number; high: number }; null_outcome: number; null_source_db: number };
}
interface PipelineStep { id: string; script: string; args?: string[]; depends_on: string[]; description: string; category: string; }

function fmt(n: number) { return n.toLocaleString(); }
function pct(n: number, total: number) { return total > 0 ? (n / total * 100).toFixed(1) + '%' : '0%'; }
function bar(ratio: number, width = 30) { const filled = Math.round(ratio * width); return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled); }

async function count(sql: string, params: any[] = []): Promise<number> {
  const { rows: [{ count: c }] } = await pgClient.query(`SELECT COUNT(*) as count FROM ${sql}`, params);
  return parseInt(c);
}

async function countWhere(table: string, where = '', params: any[] = []): Promise<number> {
  const sql = where ? `${table} WHERE ${where}` : table;
  return count(sql, params);
}

async function cmdStatus() {
  console.log('\u2550'.repeat(60) + '\n  KBSI 결정화은행 시스템 현황\n  ' + new Date().toISOString() + '\n' + '\u2550'.repeat(60));
  const tables = [
    ['Proteins', 'kbsi_protein'], ['Constructs', 'kbsi_construct'], ['Crystallizations', 'kbsi_crystallization'],
    ['Structures', 'kbsi_structure'], ['Expressions', 'kbsi_expression'], ['Purifications', 'kbsi_purification'],
    ['Ligands', 'kbsi_ligand'], ['Bindings', 'kbsi_construct_ligand'],
    ['Staging (pending)', 'kbsi_extraction_staging'], ['Audit Log', 'kbsi_audit_log'],
  ];
  console.log('\n  Data Status');
  for (const [name, table] of tables) {
    const c = await countWhere(table);
    console.log(`  ${name.padEnd(22)} ${fmt(c).padStart(12)}`);
  }
  const crystTotal = await countWhere('kbsi_crystallization');
  const experimental = await countWhere('kbsi_crystallization', `source_type IN ('experimental','database','literature')`);
  const synthetic = await countWhere('kbsi_crystallization', `source_type = 'synthetic'`);
  console.log(`\n  Crystallization Classification\n  실험/DB/문헌       ${fmt(experimental).padStart(12)} (${pct(experimental, crystTotal)})\n  합성 (NC)          ${fmt(synthetic).padStart(12)} (${pct(synthetic, crystTotal)})\n  전체               ${fmt(crystTotal).padStart(12)}`);
  const hasPrecip = await countWhere('kbsi_crystallization', 'precipitant_type IS NOT NULL');
  const hasPH = await countWhere('kbsi_crystallization', 'ph IS NOT NULL');
  const hasTemp = await countWhere('kbsi_crystallization', 'temperature IS NOT NULL');
  console.log(`\n  Field Coverage\n  pH              ${bar(hasPH / crystTotal)} ${pct(hasPH, crystTotal)}\n  Temperature     ${bar(hasTemp / crystTotal)} ${pct(hasTemp, crystTotal)}\n  Precipitant     ${bar(hasPrecip / crystTotal)} ${pct(hasPrecip, crystTotal)}`);
}

async function cmdHealth() {
  console.log('\u2550'.repeat(60) + '\n  API Health Check\n' + '\u2550'.repeat(60));
  const endpoints = [
    { name: 'Site', url: '/', method: 'GET' },
    { name: 'OpenAPI', url: '/api/openapi', method: 'GET' },
    { name: 'Proteins API', url: '/api/proteins?limit=1', method: 'GET' },
  ];
  for (const ep of endpoints) {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}${ep.url}`, { method: ep.method });
      const ms = Date.now() - start;
      console.log(`  ${res.ok ? 'V' : 'X'} ${ep.name.padEnd(22)} ${String(res.status).padStart(3)} ${String(ms).padStart(5)}ms`);
    } catch (err: any) { console.log(`  X ${ep.name.padEnd(22)} ERR — ${err.message}`); }
  }
}

async function cmdQuality() {
  console.log('\u2550'.repeat(60) + '\n  Data Quality\n' + '\u2550'.repeat(60));
  const phLow = await countWhere('kbsi_crystallization', 'ph < 1 AND ph IS NOT NULL');
  const phHigh = await countWhere('kbsi_crystallization', 'ph > 13 AND ph IS NOT NULL');
  console.log(`\n  pH outliers: < 1: ${phLow} | > 13: ${phHigh}`);
  const tempLow = await countWhere('kbsi_crystallization', 'temperature < -30 AND temperature IS NOT NULL');
  const tempHigh = await countWhere('kbsi_crystallization', 'temperature > 60 AND temperature IS NOT NULL');
  console.log(`  Temp outliers: < -30: ${tempLow} | > 60: ${tempHigh}`);

  const outcomes = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
  const crystTotal = await countWhere('kbsi_crystallization');
  const nullOutcome = await countWhere('kbsi_crystallization', 'outcome IS NULL');
  console.log('\n  Outcome Distribution');
  for (const o of outcomes) {
    const c = await countWhere('kbsi_crystallization', 'outcome = $1', [o]);
    console.log(`  ${o.padEnd(22)} ${fmt(c).padStart(10)} (${pct(c, crystTotal)})`);
  }
  console.log(`  ${'NULL'.padEnd(22)} ${fmt(nullOutcome).padStart(10)} (${pct(nullOutcome, crystTotal)})`);

  const { rows: topPrecip } = await pgClient.query('SELECT precipitant_type FROM kbsi_crystallization WHERE precipitant_type IS NOT NULL LIMIT 1000');
  if (topPrecip) {
    const precipCounts: Record<string, number> = {};
    for (const r of topPrecip) precipCounts[r.precipitant_type] = (precipCounts[r.precipitant_type] || 0) + 1;
    const sorted = Object.entries(precipCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log('\n  Top 10 Precipitant Types (sample 1000)');
    for (const [name, cnt] of sorted) console.log(`  ${name.padEnd(25)} ${cnt}`);
  }
}

async function cmdReport() { await cmdStatus(); console.log('\n'); await cmdHealth(); console.log('\n'); await cmdQuality(); }

async function cmdMaintenance() {
  console.log('  Maintenance tasks');
  await pgClient.query(`UPDATE kbsi_crystallization SET source_db = 'PDB' WHERE notes LIKE 'PDB %' AND source_db IS NULL`);
  await pgClient.query(`UPDATE kbsi_crystallization SET source_db = 'TargetTrack' WHERE notes LIKE 'TargetTrack%' AND source_db IS NULL`);
  await pgClient.query(`UPDATE kbsi_crystallization SET source_db = 'synthetic' WHERE source_type = 'synthetic' AND source_db IS NULL`);

  const normalizations = [['PEG3350', 'PEG 3350'], ['PEG4000', 'PEG 4000'], ['ammonium sulfate', 'Ammonium Sulfate'], ['sodium chloride', 'Sodium Chloride']];
  for (const [raw, norm] of normalizations) {
    const { rowCount } = await pgClient.query('UPDATE kbsi_crystallization SET precipitant_type = $1 WHERE precipitant_type = $2', [norm, raw]);
    if ((rowCount ?? 0) > 0) console.log(`  ${raw} -> ${norm}: ${rowCount}건`);
  }
  console.log('  Maintenance complete');
}

async function collectMetrics(): Promise<MetricsSnapshot> {
  const tableNames = [
    ['protein', 'kbsi_protein'], ['construct', 'kbsi_construct'], ['crystallization', 'kbsi_crystallization'],
    ['structure', 'kbsi_structure'], ['expression', 'kbsi_expression'], ['purification', 'kbsi_purification'],
    ['ligand', 'kbsi_ligand'], ['binding', 'kbsi_construct_ligand'], ['diffraction', 'kbsi_diffraction'],
    ['nmr_experiment', 'kbsi_nmr_experiment'], ['embedding', 'kbsi_embedding'],
  ];
  const tables: Record<string, number> = {};
  for (const [key, table] of tableNames) tables[key] = await countWhere(table);

  const ct = tables.crystallization;
  const experimental = await countWhere('kbsi_crystallization', `source_type IN ('experimental','database','literature')`);
  const synthetic = await countWhere('kbsi_crystallization', `source_type = 'synthetic'`);
  const hasPH = await countWhere('kbsi_crystallization', 'ph IS NOT NULL');
  const hasTemp = await countWhere('kbsi_crystallization', 'temperature IS NOT NULL');
  const hasPrecip = await countWhere('kbsi_crystallization', 'precipitant_type IS NOT NULL');
  const phLow = await countWhere('kbsi_crystallization', 'ph < 1 AND ph IS NOT NULL');
  const phHigh = await countWhere('kbsi_crystallization', 'ph > 13 AND ph IS NOT NULL');
  const tempLow = await countWhere('kbsi_crystallization', 'temperature < -30 AND temperature IS NOT NULL');
  const tempHigh = await countWhere('kbsi_crystallization', 'temperature > 60 AND temperature IS NOT NULL');
  const nullOutcome = await countWhere('kbsi_crystallization', 'outcome IS NULL');
  const nullSourceDb = await countWhere('kbsi_crystallization', 'source_db IS NULL');

  const now = new Date();
  return {
    timestamp: now.toISOString(), date: now.toISOString().slice(0, 10), tables,
    crystallization: { total: ct, experimental, synthetic, field_coverage: { ph: ct > 0 ? hasPH / ct : 0, temperature: ct > 0 ? hasTemp / ct : 0, precipitant: ct > 0 ? hasPrecip / ct : 0 } },
    quality: { ph_outliers: { low: phLow, high: phHigh }, temp_outliers: { low: tempLow, high: tempHigh }, null_outcome: nullOutcome, null_source_db: nullSourceDb },
  };
}

async function cmdSnapshot() {
  console.log('Collecting metrics...');
  const snapshot = await collectMetrics();
  mkdirSync(METRICS_DIR, { recursive: true });
  writeFileSync(resolve(METRICS_DIR, `${snapshot.date}.json`), JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot saved: ${snapshot.date}.json`);
}

function loadLatestSnapshot(): MetricsSnapshot | null {
  if (!existsSync(METRICS_DIR)) return null;
  const files = readdirSync(METRICS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
  if (files.length === 0) return null;
  return JSON.parse(readFileSync(resolve(METRICS_DIR, files[0]), 'utf-8'));
}

async function cmdTrend() {
  const previous = loadLatestSnapshot();
  const current = await collectMetrics();
  mkdirSync(METRICS_DIR, { recursive: true });
  writeFileSync(resolve(METRICS_DIR, `${current.date}.json`), JSON.stringify(current, null, 2));
  if (!previous) { console.log('No previous snapshot found. First snapshot saved.'); return; }
  console.log(`  Trend: ${previous.date} -> ${current.date}`);
  for (const key of Object.keys(current.tables)) {
    const prev = previous.tables[key] ?? 0;
    const curr = current.tables[key];
    const delta = prev > 0 ? (curr - prev) / prev : (curr > 0 ? 1 : 0);
    const flag = Math.abs(delta) > TREND_THRESHOLD ? ' !' : '';
    console.log(`  ${key.padEnd(20)} ${fmt(prev).padStart(10)} -> ${fmt(curr).padStart(10)}  (${(delta * 100).toFixed(1)}%)${flag}`);
  }
}

const PIPELINE_DAG: PipelineStep[] = [
  { id: 'pdb-harvest', script: 'scripts/bulk-pdb-harvest.ts', depends_on: [], description: 'PDB bulk harvest', category: 'harvest' },
  { id: 'targettrack', script: 'scripts/bulk-targettrack.ts', depends_on: [], description: 'TargetTrack harvest', category: 'harvest' },
  { id: 'cross-validate', script: 'scripts/cross-validate.ts', depends_on: [], description: 'Cross-validation', category: 'validate' },
  { id: 'enrich-precip', script: 'scripts/enrich-precipitant.ts', depends_on: [], description: 'Precipitant enrichment', category: 'enrich' },
  { id: 'provenance', script: 'scripts/backfill-provenance.ts', depends_on: ['cross-validate'], description: 'Provenance backfill', category: 'enrich' },
];

function topoSort(dag: PipelineStep[]): PipelineStep[] {
  const visited = new Set<string>(); const sorted: PipelineStep[] = [];
  const byId = new Map(dag.map(s => [s.id, s]));
  function visit(id: string) { if (visited.has(id)) return; visited.add(id); const step = byId.get(id); if (!step) return; for (const dep of step.depends_on) visit(dep); sorted.push(step); }
  for (const step of dag) visit(step.id);
  return sorted;
}

async function cmdPipeline() {
  const pArgs = process.argv.slice(3);
  const isDryRun = pArgs.includes('--dry-run');
  let steps = topoSort(PIPELINE_DAG);
  const categoryFilter = pArgs.find(a => a.startsWith('--category='))?.split('=')[1];
  if (categoryFilter) steps = steps.filter(s => s.category === categoryFilter);

  console.log(`  Pipeline: ${steps.length} steps${isDryRun ? ' (DRY RUN)' : ''}`);
  if (isDryRun) { for (const step of steps) console.log(`  [${step.category.padEnd(8)}] ${step.id.padEnd(18)} ${step.description}`); return; }

  for (const step of steps) {
    const scriptPath = resolve(ROOT, step.script);
    if (!existsSync(scriptPath)) { console.log(`  [SKIP] ${step.id}`); continue; }
    console.log(`\n> ${step.id}: ${step.description}`);
    try { execSync(`npx tsx ${step.script}`, { cwd: ROOT, stdio: 'inherit', timeout: 1800_000 }); }
    catch { console.log(`  X ${step.id} FAILED`); }
  }
}

async function main() {
  await pgClient.connect();
  try {
    const command = process.argv[2] || 'status';
    switch (command) {
      case 'status': await cmdStatus(); break;
      case 'health': await cmdHealth(); break;
      case 'quality': await cmdQuality(); break;
      case 'report': await cmdReport(); break;
      case 'maintenance': await cmdMaintenance(); break;
      case 'snapshot': await cmdSnapshot(); break;
      case 'trend': await cmdTrend(); break;
      case 'pipeline': await cmdPipeline(); break;
      default: console.log('Usage: npx tsx scripts/ops-harness.ts <status|health|quality|report|maintenance|snapshot|trend|pipeline>');
    }
  } finally {
    await pgClient.end();
  }
}

main().catch(console.error);
