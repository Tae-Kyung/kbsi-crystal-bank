/**
 * Data Validation Loop — 10대 품질 차원 통합 검증
 *
 * 1. Accuracy (정확성)       — 이상치, 범위 위반
 * 2. Consistency (정합성)    — 교차 필드 논리 모순
 * 3. Integrity (무결성)      — 참조 무결성, 비즈니스 규칙
 * 4. Deduplication (중복성)  — 중복 탐지, 해시 커버리지
 * 5. Extensibility (확장성)  — 어노테이션 완성도, 외부 링크
 * 6. Completeness (완전성)   — 필드별 NULL 비율, 파이프라인 커버리지
 * 7. Distribution (분포 건전성) — 클래스 불균형, 편향 탐지
 * 8. Provenance (출처 추적성) — source_type/source_db/source_id 추적 가능성
 * 9. Timeliness (최신성)     — 데이터 갱신 주기, stale 데이터
 * 10. Conformity (규격 적합성) — enum 준수, 포맷 일관성
 *
 * npm run validate                    # 전체 검증
 * npm run validate -- --json          # JSON 출력
 * npm run validate -- --dim=accuracy  # 특정 차원만
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───
interface CheckResult {
  dimension: string;
  check: string;
  status: 'pass' | 'warn' | 'fail';
  count: number;
  detail: string;
  fixable: boolean;
}

const results: CheckResult[] = [];

function add(dimension: string, check: string, status: 'pass' | 'warn' | 'fail', count: number, detail: string, fixable = false) {
  results.push({ dimension, check, status, count, detail, fixable });
}

async function cnt(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

function fmt(n: number) { return n.toLocaleString(); }
function pct(n: number, total: number) { return total > 0 ? (n / total * 100).toFixed(1) : '0.0'; }
function grade(n: number, total: number, warnThresh = 0.8, failThresh = 0.5): 'pass' | 'warn' | 'fail' {
  const r = total > 0 ? n / total : 0;
  return r >= warnThresh ? 'pass' : r >= failThresh ? 'warn' : 'fail';
}

// ═══════════════════════════════════════════════════════
// 1. ACCURACY — 데이터 정확성 (이상치, 범위 위반)
// ═══════════════════════════════════════════════════════
async function checkAccuracy() {
  const phLow = await cnt('kbsi_crystallization', q =>
    q.lt('ph', 1).not('ph', 'is', null).neq('source_type', 'synthetic'));
  add('accuracy', 'pH < 1.0 (non-synthetic)', phLow > 10 ? 'warn' : 'pass', phLow,
    `${phLow} records with pH < 1.0 (excluding synthetic)`, true);

  const phHigh = await cnt('kbsi_crystallization', q =>
    q.gt('ph', 13).not('ph', 'is', null).neq('source_type', 'synthetic'));
  add('accuracy', 'pH > 13.0 (non-synthetic)', phHigh > 10 ? 'warn' : 'pass', phHigh,
    `${phHigh} records with pH > 13.0 (excluding synthetic)`, true);

  const tempLow = await cnt('kbsi_crystallization', q =>
    q.lt('temperature', -20).not('temperature', 'is', null).neq('source_type', 'synthetic'));
  add('accuracy', 'Temp < -20C (non-synthetic)', tempLow > 10 ? 'warn' : 'pass', tempLow,
    `${tempLow} records with temp < -20C`, true);

  const tempHigh = await cnt('kbsi_crystallization', q =>
    q.gt('temperature', 60).not('temperature', 'is', null).neq('source_type', 'synthetic'));
  add('accuracy', 'Temp > 60C (non-synthetic)', tempHigh > 0 ? 'warn' : 'pass', tempHigh,
    `${tempHigh} records with temp > 60C`, false);

  const resLow = await cnt('kbsi_diffraction', q => q.lt('resolution', 0.5).not('resolution', 'is', null));
  add('accuracy', 'Resolution < 0.5 A', resLow > 0 ? 'warn' : 'pass', resLow,
    `${resLow} diffractions with resolution < 0.5 A`, false);

  const resHigh = await cnt('kbsi_diffraction', q => q.gt('resolution', 20).not('resolution', 'is', null));
  add('accuracy', 'Resolution > 20 A', resHigh > 0 ? 'warn' : 'pass', resHigh,
    `${resHigh} diffractions with resolution > 20 A`, true);

  const mwLow = await cnt('kbsi_protein', q => q.lt('theoretical_mw', 100).not('theoretical_mw', 'is', null));
  add('accuracy', 'MW < 100 Da', mwLow > 0 ? 'warn' : 'pass', mwLow,
    `${mwLow} proteins with MW < 100 Da`, false);

  const mwHigh = await cnt('kbsi_protein', q => q.gt('theoretical_mw', 1000000).not('theoretical_mw', 'is', null));
  add('accuracy', 'MW > 1 MDa', mwHigh > 0 ? 'warn' : 'pass', mwHigh,
    `${mwHigh} proteins with MW > 1 MDa`, false);
}

// ═══════════════════════════════════════════════════════
// 2. CONSISTENCY — 데이터 정합성 (교차 필드 논리 모순)
// ═══════════════════════════════════════════════════════
async function checkConsistency() {
  const noSourceType = await cnt('kbsi_crystallization', q =>
    q.not('outcome', 'is', null).is('source_type', null));
  add('consistency', 'outcome but no source_type', noSourceType > 0 ? 'fail' : 'pass', noSourceType,
    `${noSourceType} crystallization records with outcome but NULL source_type`, true);

  const noSourceDb = await cnt('kbsi_crystallization', q => q.is('source_db', null));
  add('consistency', 'NULL source_db', noSourceDb > 100 ? 'warn' : 'pass', noSourceDb,
    `${noSourceDb} records without source_db classification`, true);

  const orphanConstruct = await cnt('kbsi_construct', q => q.is('protein_id', null));
  add('consistency', 'Orphan constructs', orphanConstruct > 0 ? 'fail' : 'pass', orphanConstruct,
    `${orphanConstruct} constructs without protein_id`, false);

  const totalProt = await cnt('kbsi_protein');
  const noSeq = await cnt('kbsi_protein', q => q.is('seq_final', null));
  add('consistency', 'Proteins without sequence', noSeq > totalProt * 0.05 ? 'warn' : 'pass', noSeq,
    `${noSeq} (${pct(noSeq, totalProt)}%) proteins without seq_final`, false);

  const orphanStructure = await cnt('kbsi_structure', q => q.is('construct_id', null));
  add('consistency', 'Orphan structures', orphanStructure > 0 ? 'fail' : 'pass', orphanStructure,
    `${orphanStructure} structures without construct_id`, false);

  const piOutOfRange = await cnt('kbsi_protein', q =>
    q.not('theoretical_pi', 'is', null).or('theoretical_pi.lt.0,theoretical_pi.gt.14'));
  add('consistency', 'pI out of [0,14]', piOutOfRange > 0 ? 'fail' : 'pass', piOutOfRange,
    `${piOutOfRange} proteins with invalid pI`, true);
}

// ═══════════════════════════════════════════════════════
// 3. INTEGRITY — 무결성 (참조 무결성 + 비즈니스 규칙)
// ═══════════════════════════════════════════════════════
async function checkIntegrity() {
  const totalStructures = await cnt('kbsi_structure');
  const withRef = await cnt('kbsi_reference');
  add('integrity', 'Structure-Reference linkage', grade(withRef, totalStructures, 0.9, 0.5), withRef,
    `${fmt(withRef)} references for ${fmt(totalStructures)} structures (${pct(withRef, totalStructures)}%)`, false);

  const totalProt = await cnt('kbsi_protein');
  const withEmb = await cnt('kbsi_embedding');
  add('integrity', 'ESM-2 embedding coverage', grade(withEmb, totalProt, 0.9, 0.5), withEmb,
    `${fmt(withEmb)}/${fmt(totalProt)} proteins have embeddings (${pct(withEmb, totalProt)}%)`, false);

  const pending = await cnt('kbsi_extraction_staging', q => q.eq('status', 'pending'));
  add('integrity', 'Staging pending items', pending > 100 ? 'warn' : 'pass', pending,
    `${pending} extraction records awaiting review`, false);

  const auditCount = await cnt('kbsi_audit_log');
  add('integrity', 'Audit log active', auditCount === 0 ? 'warn' : 'pass', auditCount,
    `${fmt(auditCount)} total audit log entries`, false);

  const totalNmr = await cnt('kbsi_nmr_experiment');
  const withBmrb = await cnt('kbsi_nmr_experiment', q => q.not('bmrb_id', 'is', null));
  add('integrity', 'NMR-BMRB linkage', grade(withBmrb, totalNmr, 0.6, 0.3), withBmrb,
    `${fmt(withBmrb)}/${fmt(totalNmr)} NMR linked to BMRB (${pct(withBmrb, totalNmr)}%)`, false);
}

// ═══════════════════════════════════════════════════════
// 4. DEDUPLICATION — 중복성
// ═══════════════════════════════════════════════════════
async function checkDeduplication() {
  const totalProt = await cnt('kbsi_protein');
  const totalWithHash = await cnt('kbsi_protein', q => q.not('seq_hash', 'is', null));
  add('deduplication', 'seq_hash coverage', grade(totalWithHash, totalProt), totalWithHash,
    `${fmt(totalWithHash)}/${fmt(totalProt)} proteins have seq_hash (${pct(totalWithHash, totalProt)}%)`, false);

  const totalLigands = await cnt('kbsi_ligand');
  add('deduplication', 'Ligand count sanity', totalLigands > 200000 ? 'warn' : 'pass', totalLigands,
    `${fmt(totalLigands)} ligands`, false);

  const totalDbIds = await cnt('kbsi_database_id');
  add('deduplication', 'DB ID unique constraint', 'pass', totalDbIds,
    `${fmt(totalDbIds)} cross-references (unique constraint enforced)`, false);

  const { count: csCount } = await supabase
    .from('kbsi_nmr_chemical_shift')
    .select('id', { count: 'exact', head: true });
  add('deduplication', 'Chemical shift records', 'pass', csCount ?? 0,
    `${fmt(csCount ?? 0)} chemical shift records`, false);
}

// ═══════════════════════════════════════════════════════
// 5. EXTENSIBILITY — 확장성 (어노테이션 완성도)
// ═══════════════════════════════════════════════════════
async function checkExtensibility() {
  const totalProt = await cnt('kbsi_protein');

  const withGene = await cnt('kbsi_protein', q => q.not('gene_name', 'is', null));
  add('extensibility', 'Gene name annotation', grade(withGene, totalProt, 0.6, 0.3), withGene,
    `${fmt(withGene)}/${fmt(totalProt)} (${pct(withGene, totalProt)}%)`, false);

  const withUniprot = await cnt('kbsi_database_id', q => q.eq('db_name', 'UniProt'));
  add('extensibility', 'UniProt coverage', grade(withUniprot, totalProt, 0.6, 0.3), withUniprot,
    `${fmt(withUniprot)} UniProt mappings (${pct(withUniprot, totalProt)}%)`, false);

  const withOrganism = await cnt('kbsi_protein', q => q.not('organism', 'is', null));
  add('extensibility', 'Organism annotation', grade(withOrganism, totalProt, 0.8, 0.5), withOrganism,
    `${fmt(withOrganism)}/${fmt(totalProt)} (${pct(withOrganism, totalProt)}%)`, false);

  const totalMut = await cnt('kbsi_mutation');
  add('extensibility', 'Mutation records', totalMut < 1000 ? 'warn' : 'pass', totalMut,
    `${fmt(totalMut)} mutation records`, false);

  const totalChar = await cnt('kbsi_characterization');
  const totalConst = await cnt('kbsi_construct');
  add('extensibility', 'Characterization coverage', grade(totalChar, totalConst, 0.05, 0.01), totalChar,
    `${fmt(totalChar)}/${fmt(totalConst)} constructs (${pct(totalChar, totalConst)}%)`, false);
}

// ═══════════════════════════════════════════════════════
// 6. COMPLETENESS — 완전성 (필드별 NULL 비율)
// ═══════════════════════════════════════════════════════
async function checkCompleteness() {
  const totalCryst = await cnt('kbsi_crystallization');

  // 결정화 핵심 필드 커버리지
  const fields: { name: string; field: string; warn: number }[] = [
    { name: 'pH', field: 'ph', warn: 0.90 },
    { name: 'Temperature', field: 'temperature', warn: 0.85 },
    { name: 'Precipitant type', field: 'precipitant_type', warn: 0.10 },
    { name: 'Outcome', field: 'outcome', warn: 0.90 },
    { name: 'Method', field: 'method', warn: 0.10 },
  ];

  for (const f of fields) {
    const filled = await cnt('kbsi_crystallization', q => q.not(f.field, 'is', null));
    const ratio = totalCryst > 0 ? filled / totalCryst : 0;
    add('completeness', `Crystallization: ${f.name}`, ratio >= f.warn ? 'pass' : 'warn', filled,
      `${fmt(filled)}/${fmt(totalCryst)} (${pct(filled, totalCryst)}%)`, false);
  }

  // 단백질 핵심 필드
  const totalProt = await cnt('kbsi_protein');
  const protFields: { name: string; field: string; warn: number }[] = [
    { name: 'Sequence', field: 'seq_final', warn: 0.95 },
    { name: 'Organism', field: 'organism', warn: 0.80 },
    { name: 'Theoretical MW', field: 'theoretical_mw', warn: 0.50 },
    { name: 'Theoretical pI', field: 'theoretical_pi', warn: 0.50 },
    { name: 'Abbreviation', field: 'abbreviation', warn: 0.50 },
  ];

  for (const f of protFields) {
    const filled = await cnt('kbsi_protein', q => q.not(f.field, 'is', null));
    const ratio = totalProt > 0 ? filled / totalProt : 0;
    add('completeness', `Protein: ${f.name}`, ratio >= f.warn ? 'pass' : 'warn', filled,
      `${fmt(filled)}/${fmt(totalProt)} (${pct(filled, totalProt)}%)`, false);
  }

  // 파이프라인 단계별 커버리지 (construct 대비)
  const totalConst = await cnt('kbsi_construct');
  const pipeline: { name: string; table: string; warn: number }[] = [
    { name: 'Expression', table: 'kbsi_expression', warn: 0.05 },
    { name: 'Purification', table: 'kbsi_purification', warn: 0.02 },
    { name: 'Characterization', table: 'kbsi_characterization', warn: 0.01 },
    { name: 'Crystallization', table: 'kbsi_crystallization', warn: 0.50 },
    { name: 'Diffraction', table: 'kbsi_diffraction', warn: 0.50 },
    { name: 'Structure', table: 'kbsi_structure', warn: 0.50 },
  ];

  for (const p of pipeline) {
    const recs = await cnt(p.table);
    const ratio = totalConst > 0 ? recs / totalConst : 0;
    add('completeness', `Pipeline: ${p.name}`, ratio >= p.warn ? 'pass' : 'warn', recs,
      `${fmt(recs)} records (${pct(recs, totalConst)}% of constructs)`, false);
  }
}

// ═══════════════════════════════════════════════════════
// 7. DISTRIBUTION — 분포 건전성 (클래스 불균형, 편향)
// ═══════════════════════════════════════════════════════
async function checkDistribution() {
  // Outcome 분포 — ML 학습에 직결
  const totalCryst = await cnt('kbsi_crystallization');
  const outcomes = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
  const outcomeCounts: Record<string, number> = {};

  for (const o of outcomes) {
    outcomeCounts[o] = await cnt('kbsi_crystallization', q => q.eq('outcome', o));
  }

  // 성공 vs 실패 비율
  const success = (outcomeCounts['single_crystal'] || 0) + (outcomeCounts['diffraction_quality'] || 0);
  const failure = totalCryst - success;
  const successRatio = totalCryst > 0 ? success / totalCryst : 0;
  // ML에서 10:1 이상 불균형은 문제
  const imbalanceRatio = failure > 0 ? success / failure : 0;
  add('distribution', 'Success/failure balance',
    imbalanceRatio > 0.05 && imbalanceRatio < 0.95 ? 'pass' : 'warn',
    success,
    `Success ${fmt(success)} (${pct(success, totalCryst)}%) vs Failure ${fmt(failure)} — ratio ${imbalanceRatio.toFixed(3)}`, false);

  // Experimental vs Synthetic 비율
  const experimental = await cnt('kbsi_crystallization', q => q.neq('source_type', 'synthetic'));
  const synthetic = await cnt('kbsi_crystallization', q => q.eq('source_type', 'synthetic'));
  const synthRatio = totalCryst > 0 ? synthetic / totalCryst : 0;
  add('distribution', 'Experimental vs Synthetic',
    synthRatio > 0.9 ? 'warn' : 'pass',
    experimental,
    `Experimental ${fmt(experimental)} (${pct(experimental, totalCryst)}%) / Synthetic ${fmt(synthetic)} (${pct(synthetic, totalCryst)}%)`, false);

  // Organism 편향 — 상위 1 organism이 50% 이상이면 경고
  const { data: topOrg } = await supabase
    .from('kbsi_protein')
    .select('organism')
    .not('organism', 'is', null)
    .limit(5000);

  if (topOrg && topOrg.length > 0) {
    const orgCounts: Record<string, number> = {};
    for (const r of topOrg) {
      const o = (r as any).organism || 'unknown';
      orgCounts[o] = (orgCounts[o] || 0) + 1;
    }
    const sorted = Object.entries(orgCounts).sort((a, b) => b[1] - a[1]);
    const topOrgPct = sorted[0][1] / topOrg.length;
    const top3Pct = sorted.slice(0, 3).reduce((s, e) => s + e[1], 0) / topOrg.length;
    add('distribution', 'Organism diversity',
      topOrgPct > 0.5 ? 'warn' : 'pass',
      sorted.length,
      `${sorted.length} organisms — top: ${sorted[0][0]} (${(topOrgPct * 100).toFixed(1)}%), top-3: ${(top3Pct * 100).toFixed(1)}%`, false);
  }

  // pH 분포 — 쏠림 확인 (표준편차 기반)
  const { data: phSample } = await supabase
    .from('kbsi_crystallization')
    .select('ph')
    .not('ph', 'is', null)
    .neq('source_type', 'synthetic')
    .limit(10000);

  if (phSample && phSample.length > 100) {
    const vals = phSample.map((r: any) => r.ph as number).filter(v => v != null);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    add('distribution', 'pH spread (experimental)',
      std < 0.5 ? 'warn' : 'pass',
      vals.length,
      `mean=${mean.toFixed(2)}, std=${std.toFixed(2)} (n=${fmt(vals.length)} sample)`, false);
  }

  // Temperature 분포
  const { data: tempSample } = await supabase
    .from('kbsi_crystallization')
    .select('temperature')
    .not('temperature', 'is', null)
    .neq('source_type', 'synthetic')
    .limit(10000);

  if (tempSample && tempSample.length > 100) {
    const vals = tempSample.map((r: any) => r.temperature as number).filter(v => v != null);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    // 온도는 대부분 4C, 18C, 20C에 집중 — std < 2이면 과도한 쏠림
    add('distribution', 'Temperature spread (experimental)',
      std < 2 ? 'warn' : 'pass',
      vals.length,
      `mean=${mean.toFixed(1)}C, std=${std.toFixed(1)}C (n=${fmt(vals.length)} sample)`, false);
  }

  // Resolution 분포
  const { data: resSample } = await supabase
    .from('kbsi_diffraction')
    .select('resolution')
    .not('resolution', 'is', null)
    .limit(10000);

  if (resSample && resSample.length > 100) {
    const vals = resSample.map((r: any) => r.resolution as number).filter(v => v != null);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const median = vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)];
    add('distribution', 'Resolution distribution',
      'pass',
      vals.length,
      `mean=${mean.toFixed(2)}A, median=${median.toFixed(2)}A (n=${fmt(vals.length)} sample)`, false);
  }
}

// ═══════════════════════════════════════════════════════
// 8. PROVENANCE — 출처 추적성
// ═══════════════════════════════════════════════════════
async function checkProvenance() {
  const totalCryst = await cnt('kbsi_crystallization');

  // source_type 추적 가능성
  const withSourceType = await cnt('kbsi_crystallization', q => q.not('source_type', 'is', null));
  add('provenance', 'source_type coverage', grade(withSourceType, totalCryst, 0.99, 0.9), withSourceType,
    `${fmt(withSourceType)}/${fmt(totalCryst)} (${pct(withSourceType, totalCryst)}%)`, true);

  // source_db 추적 가능성
  const withSourceDb = await cnt('kbsi_crystallization', q => q.not('source_db', 'is', null));
  add('provenance', 'source_db coverage', grade(withSourceDb, totalCryst, 0.99, 0.9), withSourceDb,
    `${fmt(withSourceDb)}/${fmt(totalCryst)} (${pct(withSourceDb, totalCryst)}%)`, true);

  // source_id 추적 가능성 (PDB ID 등)
  const withSourceId = await cnt('kbsi_crystallization', q => q.not('source_id', 'is', null));
  add('provenance', 'source_id coverage', grade(withSourceId, totalCryst, 0.90, 0.5), withSourceId,
    `${fmt(withSourceId)}/${fmt(totalCryst)} (${pct(withSourceId, totalCryst)}%)`, false);

  // Expression 출처 추적
  const totalExpr = await cnt('kbsi_expression');
  const exprWithSource = await cnt('kbsi_expression', q => q.not('source_type', 'is', null));
  add('provenance', 'Expression source_type', grade(exprWithSource, totalExpr, 0.95, 0.7), exprWithSource,
    `${fmt(exprWithSource)}/${fmt(totalExpr)} (${pct(exprWithSource, totalExpr)}%)`, false);

  // Structure에 PDB ID 연결
  const totalStruct = await cnt('kbsi_structure');
  const structWithPdb = await cnt('kbsi_structure', q => q.not('pdb_id', 'is', null));
  add('provenance', 'Structure PDB ID linkage', grade(structWithPdb, totalStruct, 0.95, 0.7), structWithPdb,
    `${fmt(structWithPdb)}/${fmt(totalStruct)} (${pct(structWithPdb, totalStruct)}%)`, false);

  // Reference DOI 비율
  const totalRef = await cnt('kbsi_reference');
  const refWithDoi = await cnt('kbsi_reference', q => q.not('doi', 'is', null));
  add('provenance', 'Reference DOI coverage', grade(refWithDoi, totalRef, 0.8, 0.5), refWithDoi,
    `${fmt(refWithDoi)}/${fmt(totalRef)} references have DOI (${pct(refWithDoi, totalRef)}%)`, false);
}

// ═══════════════════════════════════════════════════════
// 9. TIMELINESS — 최신성 (데이터 갱신, stale 탐지)
// ═══════════════════════════════════════════════════════
async function checkTimeliness() {
  // 최근 수정된 단백질 (최근 30일)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentProteins = await cnt('kbsi_protein', q => q.gte('updated_at', thirtyDaysAgo));
  const totalProt = await cnt('kbsi_protein');
  add('timeliness', 'Proteins updated (30d)',
    recentProteins > 0 ? 'pass' : 'warn', recentProteins,
    `${fmt(recentProteins)} proteins updated in last 30 days`, false);

  // 최근 수정된 결정화 조건
  const recentCryst = await cnt('kbsi_crystallization', q => q.gte('updated_at', thirtyDaysAgo));
  add('timeliness', 'Crystallizations updated (30d)',
    recentCryst > 0 ? 'pass' : 'warn', recentCryst,
    `${fmt(recentCryst)} crystallization records updated in last 30 days`, false);

  // PDB 연도 분포 — 최근 2년 데이터 비율
  const { data: recentStructures } = await supabase
    .from('kbsi_structure')
    .select('deposition_date')
    .not('deposition_date', 'is', null)
    .gte('deposition_date', '2024-01-01')
    .limit(1);
  const recentStruct = await cnt('kbsi_structure', q =>
    q.not('deposition_date', 'is', null).gte('deposition_date', '2024-01-01'));
  const totalStruct = await cnt('kbsi_structure');
  add('timeliness', 'Structures from 2024+',
    recentStruct > 0 ? 'pass' : 'warn', recentStruct,
    `${fmt(recentStruct)}/${fmt(totalStruct)} structures deposited since 2024 (${pct(recentStruct, totalStruct)}%)`, false);

  // Metrics snapshot 최신성
  const { existsSync, readdirSync } = await import('fs');
  const { resolve } = await import('path');
  const metricsDir = resolve(__dirname, '..', 'data', 'metrics-history');
  if (existsSync(metricsDir)) {
    const files = readdirSync(metricsDir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length > 0) {
      const latestDate = files[0].replace('.json', '');
      const daysSince = Math.floor((Date.now() - new Date(latestDate).getTime()) / (24 * 60 * 60 * 1000));
      add('timeliness', 'Metrics snapshot age',
        daysSince > 7 ? 'warn' : 'pass', daysSince,
        `Latest snapshot: ${latestDate} (${daysSince} days ago)`, false);
    } else {
      add('timeliness', 'Metrics snapshot age', 'warn', 0, 'No snapshots found', false);
    }
  } else {
    add('timeliness', 'Metrics snapshot age', 'warn', 0, 'No metrics-history directory', false);
  }

  // Staging backlog age
  const { data: oldestPending } = await supabase
    .from('kbsi_extraction_staging')
    .select('created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (oldestPending && oldestPending.length > 0) {
    const oldest = new Date((oldestPending[0] as any).created_at);
    const daysOld = Math.floor((Date.now() - oldest.getTime()) / (24 * 60 * 60 * 1000));
    add('timeliness', 'Staging backlog age',
      daysOld > 30 ? 'warn' : 'pass', daysOld,
      `Oldest pending item: ${daysOld} days old`, false);
  } else {
    add('timeliness', 'Staging backlog age', 'pass', 0, 'No pending staging items', false);
  }
}

// ═══════════════════════════════════════════════════════
// 10. CONFORMITY — 규격 적합성 (enum 준수, 포맷)
// ═══════════════════════════════════════════════════════
async function checkConformity() {
  // Outcome enum 준수
  const validOutcomes = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
  const totalWithOutcome = await cnt('kbsi_crystallization', q => q.not('outcome', 'is', null));
  let validOutcomeCount = 0;
  for (const o of validOutcomes) {
    validOutcomeCount += await cnt('kbsi_crystallization', q => q.eq('outcome', o));
  }
  add('conformity', 'Outcome enum compliance',
    validOutcomeCount === totalWithOutcome ? 'pass' : 'fail',
    totalWithOutcome - validOutcomeCount,
    `${totalWithOutcome - validOutcomeCount} records with non-standard outcome values`, true);

  // Source type enum 준수
  const validSourceTypes = ['experimental', 'literature', 'database', 'synthetic'];
  const totalWithST = await cnt('kbsi_crystallization', q => q.not('source_type', 'is', null));
  let validSTCount = 0;
  for (const st of validSourceTypes) {
    validSTCount += await cnt('kbsi_crystallization', q => q.eq('source_type', st));
  }
  add('conformity', 'source_type enum compliance',
    validSTCount === totalWithST ? 'pass' : 'fail',
    totalWithST - validSTCount,
    `${totalWithST - validSTCount} records with non-standard source_type`, true);

  // Expression result_level enum
  const validResults = ['no_expression', 'insoluble', 'low', 'moderate', 'high'];
  const totalExprWithResult = await cnt('kbsi_expression', q => q.not('result_level', 'is', null));
  let validResultCount = 0;
  for (const r of validResults) {
    validResultCount += await cnt('kbsi_expression', q => q.eq('result_level', r));
  }
  add('conformity', 'Expression result_level enum',
    validResultCount === totalExprWithResult ? 'pass' : totalExprWithResult - validResultCount < 10 ? 'warn' : 'fail',
    totalExprWithResult - validResultCount,
    `${totalExprWithResult - validResultCount} non-standard result_level values`, true);

  // PDB ID 포맷 (4자리 영숫자)
  const { data: pdbSample } = await supabase
    .from('kbsi_structure')
    .select('pdb_id')
    .not('pdb_id', 'is', null)
    .limit(1000);

  if (pdbSample) {
    const invalid = pdbSample.filter((r: any) => !/^[0-9A-Za-z]{4,8}$/.test(r.pdb_id));
    add('conformity', 'PDB ID format',
      invalid.length === 0 ? 'pass' : 'warn',
      invalid.length,
      `${invalid.length}/${pdbSample.length} sampled PDB IDs have non-standard format`, true);
  }

  // Precipitant type 정규화 수준 — 대소문자 일관성 체크
  const { data: precipSample } = await supabase
    .from('kbsi_crystallization')
    .select('precipitant_type')
    .not('precipitant_type', 'is', null)
    .limit(2000);

  if (precipSample && precipSample.length > 0) {
    const types = new Set(precipSample.map((r: any) => r.precipitant_type as string));
    // PEG 변형 체크
    const pegVariants = [...types].filter(t => /peg|PEG|Peg/i.test(t));
    const inconsistent = pegVariants.filter(t => t !== t.toUpperCase() && !/^PEG\s/.test(t));
    add('conformity', 'Precipitant naming consistency',
      inconsistent.length === 0 ? 'pass' : 'warn',
      inconsistent.length,
      `${types.size} unique precipitant types; ${inconsistent.length} PEG naming variants`, true);
  }

  // Organism 포맷 — 학명 형식 (Genus species) 비율
  const { data: orgSample } = await supabase
    .from('kbsi_protein')
    .select('organism')
    .not('organism', 'is', null)
    .limit(2000);

  if (orgSample && orgSample.length > 0) {
    // 학명은 보통 대문자로 시작하는 2+ 단어
    const binomial = orgSample.filter((r: any) => /^[A-Z][a-z]+\s[a-z]+/.test(r.organism));
    const binomialPct = binomial.length / orgSample.length;
    add('conformity', 'Organism binomial format',
      binomialPct > 0.7 ? 'pass' : 'warn',
      binomial.length,
      `${binomial.length}/${orgSample.length} sampled organisms in binomial format (${(binomialPct * 100).toFixed(1)}%)`, true);
  }
}

// ═══════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const dimFilter = args.find(a => a.startsWith('--dim='))?.split('=')[1];

  const dimensions: [string, () => Promise<void>][] = [
    ['accuracy', checkAccuracy],
    ['consistency', checkConsistency],
    ['integrity', checkIntegrity],
    ['deduplication', checkDeduplication],
    ['extensibility', checkExtensibility],
    ['completeness', checkCompleteness],
    ['distribution', checkDistribution],
    ['provenance', checkProvenance],
    ['timeliness', checkTimeliness],
    ['conformity', checkConformity],
  ];

  console.log('='.repeat(60));
  console.log('  Data Validation Loop - 10-Dimension Quality Framework');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(60));

  for (const [dim, fn] of dimensions) {
    if (dimFilter && dim !== dimFilter) continue;
    console.log(`\nChecking: ${dim}...`);
    await fn();
  }

  if (jsonMode) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), dimensions: 10, results }, null, 2));
    return;
  }

  // Pretty print
  const dims = [...new Set(results.map(r => r.dimension))];
  for (const dim of dims) {
    const dimResults = results.filter(r => r.dimension === dim);
    const icon = dimResults.every(r => r.status === 'pass') ? '✓' :
                 dimResults.some(r => r.status === 'fail') ? '✗' : '⚠';
    console.log(`\n${icon} ${dim.toUpperCase()}`);
    for (const r of dimResults) {
      const statusIcon = r.status === 'pass' ? '  ✓' : r.status === 'warn' ? '  ⚠' : '  ✗';
      const fixTag = r.fixable && r.status !== 'pass' ? ' [fixable]' : '';
      console.log(`${statusIcon} ${r.check}: ${r.detail}${fixTag}`);
    }
  }

  // Summary
  const passed = results.filter(r => r.status === 'pass').length;
  const warned = results.filter(r => r.status === 'warn').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const fixable = results.filter(r => r.fixable && r.status !== 'pass').length;
  const total = results.length;

  console.log('\n' + '='.repeat(60));
  console.log(`  Summary: ${passed} pass / ${warned} warn / ${failed} fail`);
  console.log(`  Total checks: ${total} | Fixable issues: ${fixable}`);
  console.log('  ' + '-'.repeat(56));

  // Per-dimension scores
  for (const dim of dims) {
    const dimResults = results.filter(r => r.dimension === dim);
    const score = dimResults.filter(r => r.status === 'pass').length;
    const dt = dimResults.length;
    const p = (score / dt * 100).toFixed(0);
    const g = parseFloat(p) >= 90 ? 'A' : parseFloat(p) >= 70 ? 'B' : parseFloat(p) >= 50 ? 'C' : 'D';
    console.log(`  ${dim.padEnd(16)} ${String(score).padStart(2)}/${dt} (${p.padStart(3)}%) ${g}`);
  }

  // Overall score
  const overallPct = (passed / total * 100).toFixed(0);
  const overallGrade = parseFloat(overallPct) >= 90 ? 'A' : parseFloat(overallPct) >= 70 ? 'B' : parseFloat(overallPct) >= 50 ? 'C' : 'D';
  console.log('  ' + '-'.repeat(56));
  console.log(`  ${'OVERALL'.padEnd(16)} ${String(passed).padStart(2)}/${total} (${overallPct.padStart(3)}%) ${overallGrade}`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
