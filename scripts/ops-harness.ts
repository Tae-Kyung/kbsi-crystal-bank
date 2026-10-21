/**
 * KBSI 결정화은행 운영 하네스
 * 시스템 상태, 데이터 품질, API 헬스체크를 한 번에 점검
 *
 * npx tsx scripts/ops-harness.ts [command]
 *
 * Commands:
 *   status      — 전체 시스템 현황 (기본)
 *   health      — API 헬스체크
 *   quality     — 데이터 품질 점검
 *   report      — 종합 보고서 생성
 *   maintenance — 유지보수 작업 (정규화, 이상치 정리)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kbsi-crystal-bank.vercel.app';
const ROOT = resolve(__dirname, '..');
const METRICS_DIR = resolve(ROOT, 'data', 'metrics-history');
const TREND_THRESHOLD = 0.05; // 5% change triggers alert

// ─── 타입 ───
interface MetricsSnapshot {
  timestamp: string;
  date: string;
  tables: Record<string, number>;
  crystallization: {
    total: number;
    experimental: number;
    synthetic: number;
    field_coverage: { ph: number; temperature: number; precipitant: number };
  };
  quality: {
    ph_outliers: { low: number; high: number };
    temp_outliers: { low: number; high: number };
    null_outcome: number;
    null_source_db: number;
  };
}

interface PipelineStep {
  id: string;
  script: string;
  args?: string[];
  depends_on: string[];
  description: string;
  category: 'harvest' | 'backfill' | 'enrich' | 'validate' | 'cleanup';
}

// ─── 유틸 ───
function fmt(n: number) { return n.toLocaleString(); }
function pct(n: number, total: number) { return total > 0 ? (n / total * 100).toFixed(1) + '%' : '0%'; }
function bar(ratio: number, width = 30) {
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

// ═══════════════════════════════════════════════════════
// 1. STATUS — 전체 시스템 현황
// ═══════════════════════════════════════════════════════
async function cmdStatus() {
  console.log('═'.repeat(60));
  console.log('  KBSI 결정화은행 시스템 현황');
  console.log('  ' + new Date().toISOString());
  console.log('═'.repeat(60));

  const tables = [
    { name: 'Proteins', table: 'kbsi_protein' },
    { name: 'Constructs', table: 'kbsi_construct' },
    { name: 'Crystallizations', table: 'kbsi_crystallization' },
    { name: 'Structures', table: 'kbsi_structure' },
    { name: 'Expressions', table: 'kbsi_expression' },
    { name: 'Purifications', table: 'kbsi_purification' },
    { name: 'Ligands', table: 'kbsi_ligand' },
    { name: 'Bindings', table: 'kbsi_construct_ligand' },
    { name: 'Staging (pending)', table: 'kbsi_extraction_staging' },
    { name: 'Audit Log', table: 'kbsi_audit_log' },
  ];

  console.log('\n📊 데이터 현황');
  for (const t of tables) {
    const c = await count(t.table);
    console.log(`  ${t.name.padEnd(22)} ${fmt(c).padStart(12)}`);
  }

  // 결정화 상세
  const crystTotal = await count('kbsi_crystallization');
  const experimental = await count('kbsi_crystallization', q => q.or('source_type.eq.experimental,source_type.eq.database,source_type.eq.literature'));
  const synthetic = await count('kbsi_crystallization', q => q.eq('source_type', 'synthetic'));

  console.log('\n📈 결정화 데이터 분류');
  console.log(`  실험/DB/문헌       ${fmt(experimental).padStart(12)} (${pct(experimental, crystTotal)})`);
  console.log(`  합성 (NC)          ${fmt(synthetic).padStart(12)} (${pct(synthetic, crystTotal)})`);
  console.log(`  전체               ${fmt(crystTotal).padStart(12)}`);

  // 구조화율
  const hasPrecip = await count('kbsi_crystallization', q => q.not('precipitant_type', 'is', null));
  const hasPH = await count('kbsi_crystallization', q => q.not('ph', 'is', null));
  const hasTemp = await count('kbsi_crystallization', q => q.not('temperature', 'is', null));

  console.log('\n🔬 필드 구조화율');
  console.log(`  pH              ${bar(hasPH / crystTotal)} ${pct(hasPH, crystTotal)}`);
  console.log(`  Temperature     ${bar(hasTemp / crystTotal)} ${pct(hasTemp, crystTotal)}`);
  console.log(`  Precipitant     ${bar(hasPrecip / crystTotal)} ${pct(hasPrecip, crystTotal)}`);
}

// ═══════════════════════════════════════════════════════
// 2. HEALTH — API 헬스체크
// ═══════════════════════════════════════════════════════
async function cmdHealth() {
  console.log('═'.repeat(60));
  console.log('  API 헬스체크');
  console.log('═'.repeat(60));

  const endpoints = [
    { name: 'Site', url: '/', method: 'GET' },
    { name: 'OpenAPI', url: '/api/openapi', method: 'GET' },
    { name: 'Proteins API', url: '/api/proteins?limit=1', method: 'GET' },
    { name: 'Recommend API', url: '/api/recommend?ph=7&k=1', method: 'GET' },
    { name: 'Scatter SVG', url: '/api/charts/scatter?width=100&height=100', method: 'GET' },
    { name: 'Benchmark Dataset', url: '/api/export/benchmark-dataset?limit=1', method: 'GET' },
    { name: 'MCP (initialize)', url: '/api/mcp', method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1.0"}}}', headers: { 'Accept': 'application/json, text/event-stream' } },
  ];

  for (const ep of endpoints) {
    const start = Date.now();
    try {
      const opts: RequestInit = { method: ep.method };
      if (ep.body) {
        opts.body = ep.body;
        opts.headers = { 'Content-Type': 'application/json', ...(ep.headers || {}) };
      }
      const res = await fetch(`${BASE_URL}${ep.url}`, opts);
      const ms = Date.now() - start;
      const status = res.ok ? '✓' : '✗';
      const color = res.ok ? '' : ' ⚠';
      console.log(`  ${status} ${ep.name.padEnd(22)} ${String(res.status).padStart(3)} ${String(ms).padStart(5)}ms${color}`);
    } catch (err: any) {
      const ms = Date.now() - start;
      console.log(`  ✗ ${ep.name.padEnd(22)} ERR ${String(ms).padStart(5)}ms — ${err.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════
// 3. QUALITY — 데이터 품질 점검
// ═══════════════════════════════════════════════════════
async function cmdQuality() {
  console.log('═'.repeat(60));
  console.log('  데이터 품질 점검');
  console.log('═'.repeat(60));

  // pH 이상치
  const phLow = await count('kbsi_crystallization', q => q.lt('ph', 1).not('ph', 'is', null));
  const phHigh = await count('kbsi_crystallization', q => q.gt('ph', 13).not('ph', 'is', null));
  console.log('\n🧪 pH 이상치');
  console.log(`  pH < 1:   ${phLow}건 ${phLow > 10 ? '⚠' : '✓'}`);
  console.log(`  pH > 13:  ${phHigh}건 ${phHigh > 10 ? '⚠' : '✓'}`);

  // 온도 이상치
  const tempLow = await count('kbsi_crystallization', q => q.lt('temperature', -30).not('temperature', 'is', null));
  const tempHigh = await count('kbsi_crystallization', q => q.gt('temperature', 60).not('temperature', 'is', null));
  console.log('\n🌡️ Temperature 이상치');
  console.log(`  < -30°C:  ${tempLow}건 ${tempLow > 10 ? '⚠' : '✓'}`);
  console.log(`  > 60°C:   ${tempHigh}건 ${tempHigh > 10 ? '⚠' : '✓'}`);

  // Outcome 분포
  const outcomes = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
  const crystTotal = await count('kbsi_crystallization');
  const nullOutcome = await count('kbsi_crystallization', q => q.is('outcome', null));

  console.log('\n📊 Outcome 분포');
  for (const o of outcomes) {
    const c = await count('kbsi_crystallization', q => q.eq('outcome', o));
    console.log(`  ${o.padEnd(22)} ${fmt(c).padStart(10)} (${pct(c, crystTotal)})`);
  }
  console.log(`  ${'NULL'.padEnd(22)} ${fmt(nullOutcome).padStart(10)} (${pct(nullOutcome, crystTotal)})`);

  // source_db 분포
  const sourceDbs = ['PDB', 'TargetTrack', 'ChEMBL', 'KBSI', 'synthetic'];
  const nullSource = await count('kbsi_crystallization', q => q.is('source_db', null));

  console.log('\n🔗 Source DB 분포');
  for (const db of sourceDbs) {
    const c = await count('kbsi_crystallization', q => q.eq('source_db', db));
    console.log(`  ${db.padEnd(15)} ${fmt(c).padStart(10)}`);
  }
  console.log(`  ${'NULL (미분류)'.padEnd(15)} ${fmt(nullSource).padStart(10)} ${nullSource > 1000 ? '⚠ 정리 필요' : '✓'}`);

  // Precipitant 정규화 현황
  const { data: topPrecip } = await supabase
    .from('kbsi_crystallization')
    .select('precipitant_type')
    .not('precipitant_type', 'is', null)
    .limit(1000);

  if (topPrecip) {
    const precipCounts: Record<string, number> = {};
    for (const r of topPrecip as any[]) {
      const p = r.precipitant_type;
      precipCounts[p] = (precipCounts[p] || 0) + 1;
    }
    const sorted = Object.entries(precipCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log('\n💊 Top 10 Precipitant Types (샘플 1000건)');
    for (const [name, cnt] of sorted) {
      console.log(`  ${name.padEnd(25)} ${cnt}`);
    }
  }
}

// ═══════════════════════════════════════════════════════
// 4. REPORT — 종합 보고서
// ═══════════════════════════════════════════════════════
async function cmdReport() {
  console.log('═'.repeat(60));
  console.log('  KBSI 결정화은행 종합 보고서');
  console.log('  ' + new Date().toLocaleDateString('ko-KR'));
  console.log('═'.repeat(60));

  await cmdStatus();
  console.log('\n');
  await cmdHealth();
  console.log('\n');
  await cmdQuality();

  console.log('\n═'.repeat(60));
  console.log('  보고서 완료');
  console.log('═'.repeat(60));
}

// ═══════════════════════════════════════════════════════
// 5. MAINTENANCE — 유지보수 작업
// ═══════════════════════════════════════════════════════
async function cmdMaintenance() {
  console.log('═'.repeat(60));
  console.log('  유지보수 작업');
  console.log('═'.repeat(60));

  // 1. source_db NULL 정리
  console.log('\n1. source_db NULL 정리...');
  const { count: fixedPDB } = await supabase
    .from('kbsi_crystallization')
    .update({ source_db: 'PDB' })
    .like('notes', 'PDB %')
    .is('source_db', null)
    .select('id');
  console.log(`  PDB notes → source_db 정리 완료`);

  const { count: fixedTT } = await supabase
    .from('kbsi_crystallization')
    .update({ source_db: 'TargetTrack' })
    .like('notes', 'TargetTrack%')
    .is('source_db', null)
    .select('id');
  console.log(`  TargetTrack → source_db 정리 완료`);

  const { count: fixedNC } = await supabase
    .from('kbsi_crystallization')
    .update({ source_db: 'synthetic' })
    .eq('source_type', 'synthetic')
    .is('source_db', null)
    .select('id');
  console.log(`  synthetic → source_db 정리 완료`);

  // 2. Precipitant 정규화
  console.log('\n2. Precipitant 정규화 (룩업 테이블 기반)...');
  // 수동 정규화
  const normalizations = [
    ['PEG3350', 'PEG 3350'], ['PEG4000', 'PEG 4000'], ['PEG6000', 'PEG 6000'],
    ['PEG8000', 'PEG 8000'], ['PEG400', 'PEG 400'], ['PEG1500', 'PEG 1500'],
    ['ammonium sulfate', 'Ammonium Sulfate'], ['ammonium sulphate', 'Ammonium Sulfate'],
    ['sodium chloride', 'Sodium Chloride'], ['(NH4)2SO4', 'Ammonium Sulfate'],
  ];
  let totalNormalized = 0;
  for (const [raw, norm] of normalizations) {
    const { count: c } = await supabase
      .from('kbsi_crystallization')
      .update({ precipitant_type: norm })
      .eq('precipitant_type', raw)
      .select('id');
    if ((c ?? 0) > 0) {
      console.log(`  ${raw} → ${norm}: ${c}건`);
      totalNormalized += c ?? 0;
    }
  }
  console.log(`  총 정규화: ${totalNormalized}건`);

  // 3. 통계 요약
  console.log('\n3. 최종 확인...');
  const nullSource = await count('kbsi_crystallization', q => q.is('source_db', null));
  console.log(`  source_db NULL 잔여: ${fmt(nullSource)}건`);

  console.log('\n═'.repeat(60));
  console.log('  유지보수 완료');
  console.log('═'.repeat(60));
}

// ═══════════════════════════════════════════════════════
// 6. COLLECT METRICS — 구조화된 메트릭 수집
// ═══════════════════════════════════════════════════════
async function collectMetrics(): Promise<MetricsSnapshot> {
  const tableNames = [
    { key: 'protein', table: 'kbsi_protein' },
    { key: 'construct', table: 'kbsi_construct' },
    { key: 'crystallization', table: 'kbsi_crystallization' },
    { key: 'structure', table: 'kbsi_structure' },
    { key: 'expression', table: 'kbsi_expression' },
    { key: 'purification', table: 'kbsi_purification' },
    { key: 'ligand', table: 'kbsi_ligand' },
    { key: 'binding', table: 'kbsi_construct_ligand' },
    { key: 'diffraction', table: 'kbsi_diffraction' },
    { key: 'nmr_experiment', table: 'kbsi_nmr_experiment' },
    { key: 'embedding', table: 'kbsi_embedding' },
  ];

  const tables: Record<string, number> = {};
  for (const t of tableNames) {
    tables[t.key] = await count(t.table);
  }

  const crystTotal = tables.crystallization;
  const experimental = await count('kbsi_crystallization', q => q.or('source_type.eq.experimental,source_type.eq.database,source_type.eq.literature'));
  const synthetic = await count('kbsi_crystallization', q => q.eq('source_type', 'synthetic'));
  const hasPH = await count('kbsi_crystallization', q => q.not('ph', 'is', null));
  const hasTemp = await count('kbsi_crystallization', q => q.not('temperature', 'is', null));
  const hasPrecip = await count('kbsi_crystallization', q => q.not('precipitant_type', 'is', null));

  const phLow = await count('kbsi_crystallization', q => q.lt('ph', 1).not('ph', 'is', null));
  const phHigh = await count('kbsi_crystallization', q => q.gt('ph', 13).not('ph', 'is', null));
  const tempLow = await count('kbsi_crystallization', q => q.lt('temperature', -30).not('temperature', 'is', null));
  const tempHigh = await count('kbsi_crystallization', q => q.gt('temperature', 60).not('temperature', 'is', null));
  const nullOutcome = await count('kbsi_crystallization', q => q.is('outcome', null));
  const nullSourceDb = await count('kbsi_crystallization', q => q.is('source_db', null));

  const now = new Date();
  return {
    timestamp: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    tables,
    crystallization: {
      total: crystTotal,
      experimental,
      synthetic,
      field_coverage: {
        ph: crystTotal > 0 ? hasPH / crystTotal : 0,
        temperature: crystTotal > 0 ? hasTemp / crystTotal : 0,
        precipitant: crystTotal > 0 ? hasPrecip / crystTotal : 0,
      },
    },
    quality: {
      ph_outliers: { low: phLow, high: phHigh },
      temp_outliers: { low: tempLow, high: tempHigh },
      null_outcome: nullOutcome,
      null_source_db: nullSourceDb,
    },
  };
}

// ═══════════════════════════════════════════════════════
// 7. SNAPSHOT — 메트릭 스냅샷 저장
// ═══════════════════════════════════════════════════════
async function cmdSnapshot() {
  console.log('Collecting metrics...');
  const snapshot = await collectMetrics();

  mkdirSync(METRICS_DIR, { recursive: true });
  const filePath = resolve(METRICS_DIR, `${snapshot.date}.json`);
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2));

  console.log(`Snapshot saved: ${filePath}`);
  console.log(`  Tables: ${Object.entries(snapshot.tables).map(([k, v]) => `${k}=${fmt(v)}`).join(', ')}`);
  console.log(`  Coverage: pH=${pct(snapshot.crystallization.field_coverage.ph, 1)}, temp=${pct(snapshot.crystallization.field_coverage.temperature, 1)}`);
}

// ═══════════════════════════════════════════════════════
// 8. TREND — 트렌드 비교 (이전 스냅샷 vs 현재)
// ═══════════════════════════════════════════════════════
function loadLatestSnapshot(): MetricsSnapshot | null {
  if (!existsSync(METRICS_DIR)) return null;
  const files = readdirSync(METRICS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return JSON.parse(readFileSync(resolve(METRICS_DIR, files[0]), 'utf-8'));
}

async function cmdTrend() {
  const previous = loadLatestSnapshot();
  console.log('Collecting current metrics...');
  const current = await collectMetrics();

  // Save current snapshot
  mkdirSync(METRICS_DIR, { recursive: true });
  writeFileSync(resolve(METRICS_DIR, `${current.date}.json`), JSON.stringify(current, null, 2));

  if (!previous) {
    console.log('No previous snapshot found. First snapshot saved.');
    console.log('Run again later to see trends.');
    return;
  }

  console.log('═'.repeat(60));
  console.log(`  Trend: ${previous.date} → ${current.date}`);
  console.log('═'.repeat(60));

  // Compare table counts
  console.log('\n📊 Table Counts');
  for (const key of Object.keys(current.tables)) {
    const prev = previous.tables[key] ?? 0;
    const curr = current.tables[key];
    const delta = prev > 0 ? (curr - prev) / prev : (curr > 0 ? 1 : 0);
    const deltaStr = prev > 0 ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%` : 'new';
    const flag = Math.abs(delta) > TREND_THRESHOLD ? ' ⚠' : '';
    console.log(`  ${key.padEnd(20)} ${fmt(prev).padStart(10)} → ${fmt(curr).padStart(10)}  (${deltaStr})${flag}`);
  }

  // Compare quality
  console.log('\n🔬 Quality');
  const qMetrics = [
    { name: 'pH outliers (low)', prev: previous.quality.ph_outliers.low, curr: current.quality.ph_outliers.low },
    { name: 'pH outliers (high)', prev: previous.quality.ph_outliers.high, curr: current.quality.ph_outliers.high },
    { name: 'temp outliers (low)', prev: previous.quality.temp_outliers.low, curr: current.quality.temp_outliers.low },
    { name: 'temp outliers (high)', prev: previous.quality.temp_outliers.high, curr: current.quality.temp_outliers.high },
    { name: 'NULL outcome', prev: previous.quality.null_outcome, curr: current.quality.null_outcome },
    { name: 'NULL source_db', prev: previous.quality.null_source_db, curr: current.quality.null_source_db },
  ];
  for (const m of qMetrics) {
    const diff = m.curr - m.prev;
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
    console.log(`  ${m.name.padEnd(22)} ${m.prev} → ${m.curr} ${arrow}${Math.abs(diff) > 10 ? ' ⚠' : ''}`);
  }

  // Coverage comparison
  console.log('\n📈 Field Coverage');
  const covKeys = ['ph', 'temperature', 'precipitant'] as const;
  for (const k of covKeys) {
    const prev = previous.crystallization.field_coverage[k];
    const curr = current.crystallization.field_coverage[k];
    console.log(`  ${k.padEnd(15)} ${(prev * 100).toFixed(1)}% → ${(curr * 100).toFixed(1)}%`);
  }
}

// ═══════════════════════════════════════════════════════
// 9. PIPELINE — 수확 스크립트 오케스트레이션
// ═══════════════════════════════════════════════════════
const PIPELINE_DAG: PipelineStep[] = [
  // Layer 0: Primary sources
  { id: 'pdb-harvest', script: 'scripts/bulk-pdb-harvest.ts', depends_on: [], description: 'PDB bulk harvest', category: 'harvest' },
  { id: 'targettrack', script: 'scripts/bulk-targettrack.ts', depends_on: [], description: 'TargetTrack harvest', category: 'harvest' },
  { id: 'chembl', script: 'scripts/harvest-chembl-expanded.ts', depends_on: [], description: 'ChEMBL ligands', category: 'harvest' },

  // Layer 1: Structure-level data
  { id: 'pdb-sweep', script: 'scripts/bulk-pdb-sweep.ts', depends_on: ['pdb-harvest'], description: 'PDB method sweep', category: 'harvest' },
  { id: 'diffraction', script: 'scripts/harvest-diffraction-from-pdb.ts', depends_on: ['pdb-harvest'], description: 'Diffraction data', category: 'harvest' },
  { id: 'ligands-v2', script: 'scripts/harvest-pdb-ligands-v2.ts', depends_on: ['pdb-harvest'], description: 'PDB ligands v2', category: 'harvest' },
  { id: 'nmr-pdb', script: 'scripts/harvest-nmr-from-pdb.ts', depends_on: ['pdb-harvest'], description: 'NMR from PDB', category: 'harvest' },
  { id: 'papers', script: 'scripts/harvest-papers-extended.ts', depends_on: ['pdb-harvest'], description: 'Paper references', category: 'harvest' },

  // Layer 2: Backfill core metadata
  { id: 'expressions', script: 'scripts/backfill-expressions.ts', depends_on: ['pdb-harvest'], description: 'Expression backfill', category: 'backfill' },
  { id: 'uniprot', script: 'scripts/backfill-sifts-uniprot.ts', depends_on: ['pdb-harvest'], description: 'UniProt via SIFTS', category: 'backfill' },
  { id: 'protein-meta', script: 'scripts/backfill-protein-metadata.ts', depends_on: ['pdb-harvest'], description: 'Protein metadata', category: 'backfill' },
  { id: 'structure-meta', script: 'scripts/backfill-structure-metadata.ts', depends_on: ['pdb-harvest'], description: 'Structure metadata', category: 'backfill' },
  { id: 'pdb-db-ids', script: 'scripts/backfill-pdb-database-ids.ts', depends_on: ['pdb-harvest'], description: 'PDB database IDs', category: 'backfill' },
  { id: 'mutations', script: 'scripts/backfill-mutations.ts', depends_on: ['pdb-harvest'], description: 'Mutations', category: 'backfill' },

  // Layer 3: Enrichment
  { id: 'enrich-cond', script: 'scripts/bulk-enrich-conditions.ts', depends_on: ['pdb-harvest'], description: 'Enrich conditions', category: 'enrich' },
  { id: 'references', script: 'scripts/backfill-references.ts', depends_on: ['papers'], description: 'Reference backfill', category: 'enrich' },
  { id: 'gene-name', script: 'scripts/backfill-gene-name-pdb.ts', depends_on: ['pdb-harvest'], description: 'Gene names', category: 'enrich' },
  { id: 'ncbi-gene', script: 'scripts/backfill-ncbi-gene.ts', depends_on: ['uniprot'], description: 'NCBI gene IDs', category: 'enrich' },
  { id: 'bmrb-map', script: 'scripts/backfill-bmrb-mapping.ts', depends_on: ['nmr-pdb'], description: 'BMRB mapping', category: 'enrich' },
  { id: 'bmrb-shifts', script: 'scripts/harvest-bmrb-chemical-shifts.ts', depends_on: ['bmrb-map'], description: 'BMRB chemical shifts', category: 'enrich' },
  { id: 'mw-calc', script: 'scripts/backfill-theoretical-mw.ts', depends_on: ['pdb-harvest'], description: 'Theoretical MW', category: 'enrich' },
  { id: 'seq-hash', script: 'scripts/backfill-seq-hash.ts', depends_on: ['pdb-harvest'], description: 'Sequence hashes', category: 'enrich' },

  // Layer 4: Cleanup
  { id: 'norm-org', script: 'scripts/normalize-organism.ts', depends_on: ['protein-meta'], description: 'Normalize organisms', category: 'cleanup' },
  { id: 'clean-names', script: 'scripts/cleanup-protein-names.ts', depends_on: ['protein-meta'], description: 'Clean protein names', category: 'cleanup' },
  { id: 'clean-quality', script: 'scripts/cleanup-data-quality.ts', depends_on: ['enrich-cond'], description: 'Data quality cleanup', category: 'cleanup' },
  { id: 'dedupe', script: 'scripts/dedupe-proteins.ts', depends_on: ['seq-hash'], description: 'Deduplicate proteins', category: 'cleanup' },
  { id: 'rebuild-search', script: 'scripts/rebuild-search-keywords.ts', depends_on: ['clean-names', 'gene-name'], description: 'Rebuild search index', category: 'cleanup' },

  // Layer 5: Validation
  { id: 'cross-validate', script: 'scripts/cross-validate.ts', depends_on: ['clean-quality', 'dedupe'], description: 'Cross-validation', category: 'validate' },
];

function topoSort(dag: PipelineStep[]): PipelineStep[] {
  const visited = new Set<string>();
  const sorted: PipelineStep[] = [];
  const byId = new Map(dag.map(s => [s.id, s]));

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const step = byId.get(id);
    if (!step) return;
    for (const dep of step.depends_on) visit(dep);
    sorted.push(step);
  }

  for (const step of dag) visit(step.id);
  return sorted;
}

async function cmdPipeline() {
  const args = process.argv.slice(3);
  const dryRun = args.includes('--dry-run');
  const continueOnError = args.includes('--continue-on-error');
  const categoryFilter = args.find(a => a.startsWith('--category='))?.split('=')[1];
  const fromStep = args.find(a => a.startsWith('--from='))?.split('=')[1];

  let steps = topoSort(PIPELINE_DAG);

  if (categoryFilter) {
    steps = steps.filter(s => s.category === categoryFilter);
  }

  if (fromStep) {
    const idx = steps.findIndex(s => s.id === fromStep);
    if (idx === -1) {
      console.log(`Step "${fromStep}" not found. Available: ${steps.map(s => s.id).join(', ')}`);
      return;
    }
    steps = steps.slice(idx);
  }

  console.log('═'.repeat(60));
  console.log(`  Pipeline: ${steps.length} steps${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('═'.repeat(60));

  if (dryRun) {
    for (const step of steps) {
      const deps = step.depends_on.length > 0 ? ` (after: ${step.depends_on.join(', ')})` : '';
      console.log(`  [${step.category.padEnd(8)}] ${step.id.padEnd(18)} ${step.description}${deps}`);
    }
    return;
  }

  const results: { id: string; status: string; ms: number }[] = [];

  for (const step of steps) {
    const scriptPath = resolve(ROOT, step.script);
    if (!existsSync(scriptPath)) {
      console.log(`  [SKIP] ${step.id} — script not found: ${step.script}`);
      results.push({ id: step.id, status: 'skip', ms: 0 });
      continue;
    }

    console.log(`\n▶ ${step.id}: ${step.description}`);
    const start = Date.now();
    try {
      const argsStr = step.args ? ' ' + step.args.join(' ') : '';
      execSync(`npx tsx ${step.script}${argsStr}`, {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: 1800_000, // 30 min per step
      });
      const ms = Date.now() - start;
      console.log(`  ✓ ${step.id} completed (${(ms / 1000).toFixed(0)}s)`);
      results.push({ id: step.id, status: 'pass', ms });
    } catch (err: any) {
      const ms = Date.now() - start;
      console.log(`  ✗ ${step.id} FAILED (${(ms / 1000).toFixed(0)}s)`);
      results.push({ id: step.id, status: 'fail', ms });
      if (!continueOnError) {
        console.log('\nPipeline stopped. Use --continue-on-error to proceed past failures.');
        break;
      }
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('  Pipeline Summary');
  console.log('═'.repeat(60));
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}`);
  for (const r of results) {
    const icon = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '–';
    console.log(`  ${icon} ${r.id.padEnd(20)} ${r.status.padEnd(6)} ${(r.ms / 1000).toFixed(0)}s`);
  }
}

// ─── Main ───
async function main() {
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
    default:
      console.log('Usage: npx tsx scripts/ops-harness.ts <command>\n');
      console.log('Commands:');
      console.log('  status        System overview (default)');
      console.log('  health        API health check');
      console.log('  quality       Data quality inspection');
      console.log('  report        Full report (status + health + quality)');
      console.log('  maintenance   Run maintenance tasks');
      console.log('  snapshot      Save metrics snapshot to data/metrics-history/');
      console.log('  trend         Compare current vs previous snapshot');
      console.log('  pipeline      Orchestrate harvest/backfill scripts');
      console.log('');
      console.log('Pipeline options:');
      console.log('  --dry-run             Show execution order only');
      console.log('  --continue-on-error   Keep going after failures');
      console.log('  --category=<cat>      Filter by: harvest|backfill|enrich|validate|cleanup');
      console.log('  --from=<step-id>      Start from a specific step');
  }
}

main().catch(console.error);
