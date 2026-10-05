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

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kbsi-crystal-bank.vercel.app';

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

// ─── Main ───
async function main() {
  const command = process.argv[2] || 'status';

  switch (command) {
    case 'status': await cmdStatus(); break;
    case 'health': await cmdHealth(); break;
    case 'quality': await cmdQuality(); break;
    case 'report': await cmdReport(); break;
    case 'maintenance': await cmdMaintenance(); break;
    default:
      console.log('Usage: npx tsx scripts/ops-harness.ts [status|health|quality|report|maintenance]');
  }
}

main().catch(console.error);
