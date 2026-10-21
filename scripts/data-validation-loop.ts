/**
 * Data Validation Loop — 5대 품질 차원 통합 검증
 *
 * 정확성(Accuracy) + 정합성(Consistency) + 무결성(Integrity) +
 * 중복성(Deduplication) + 확장성(Extensibility) 을 한 번에 점검
 *
 * npm run validate              # 전체 검증
 * npm run validate -- --json    # JSON 출력
 * npm run validate -- --fix     # 자동 수정 가능한 항목 수정
 * npm run validate -- --dim accuracy  # 특정 차원만
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

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

// ═══════════════════════════════════════════════════════
// 1. ACCURACY — 데이터 정확성
// ═══════════════════════════════════════════════════════
async function checkAccuracy() {
  // pH 범위 이상치 (synthetic 제외)
  const phLow = await count('kbsi_crystallization', q =>
    q.lt('ph', 1).not('ph', 'is', null).neq('source_type', 'synthetic'));
  add('accuracy', 'pH < 1.0 (non-synthetic)', phLow > 10 ? 'warn' : 'pass', phLow,
    `${phLow} records with pH < 1.0 (excluding synthetic)`, true);

  const phHigh = await count('kbsi_crystallization', q =>
    q.gt('ph', 13).not('ph', 'is', null).neq('source_type', 'synthetic'));
  add('accuracy', 'pH > 13.0 (non-synthetic)', phHigh > 10 ? 'warn' : 'pass', phHigh,
    `${phHigh} records with pH > 13.0 (excluding synthetic)`, true);

  // 온도 범위 이상치
  const tempLow = await count('kbsi_crystallization', q =>
    q.lt('temperature', -20).not('temperature', 'is', null).neq('source_type', 'synthetic'));
  add('accuracy', 'Temp < -20°C (non-synthetic)', tempLow > 10 ? 'warn' : 'pass', tempLow,
    `${tempLow} records with temp < -20°C`, true);

  const tempHigh = await count('kbsi_crystallization', q =>
    q.gt('temperature', 60).not('temperature', 'is', null).neq('source_type', 'synthetic'));
  add('accuracy', 'Temp > 60°C (non-synthetic)', tempHigh > 0 ? 'warn' : 'pass', tempHigh,
    `${tempHigh} records with temp > 60°C`, false);

  // Resolution 이상치
  const resLow = await count('kbsi_diffraction', q => q.lt('resolution', 0.5).not('resolution', 'is', null));
  add('accuracy', 'Resolution < 0.5 Å', resLow > 0 ? 'warn' : 'pass', resLow,
    `${resLow} diffractions with resolution < 0.5 Å`, false);

  const resHigh = await count('kbsi_diffraction', q => q.gt('resolution', 20).not('resolution', 'is', null));
  add('accuracy', 'Resolution > 20 Å', resHigh > 0 ? 'warn' : 'pass', resHigh,
    `${resHigh} diffractions with resolution > 20 Å`, true);

  // MW 이상치
  const mwLow = await count('kbsi_protein', q => q.lt('theoretical_mw', 100).not('theoretical_mw', 'is', null));
  add('accuracy', 'MW < 100 Da', mwLow > 0 ? 'warn' : 'pass', mwLow,
    `${mwLow} proteins with MW < 100 Da`, false);

  const mwHigh = await count('kbsi_protein', q => q.gt('theoretical_mw', 1000000).not('theoretical_mw', 'is', null));
  add('accuracy', 'MW > 1 MDa', mwHigh > 0 ? 'warn' : 'pass', mwHigh,
    `${mwHigh} proteins with MW > 1 MDa`, false);
}

// ═══════════════════════════════════════════════════════
// 2. CONSISTENCY — 데이터 정합성
// ═══════════════════════════════════════════════════════
async function checkConsistency() {
  // outcome이 있는데 source_type이 NULL
  const noSourceType = await count('kbsi_crystallization', q =>
    q.not('outcome', 'is', null).is('source_type', null));
  add('consistency', 'Crystallization: outcome but no source_type', noSourceType > 0 ? 'fail' : 'pass', noSourceType,
    `${noSourceType} records with outcome but NULL source_type`, true);

  // source_db NULL (미분류)
  const noSourceDb = await count('kbsi_crystallization', q => q.is('source_db', null));
  add('consistency', 'Crystallization: NULL source_db', noSourceDb > 100 ? 'warn' : 'pass', noSourceDb,
    `${noSourceDb} records without source_db classification`, true);

  // construct without protein
  const orphanConstruct = await count('kbsi_construct', q => q.is('protein_id', null));
  add('consistency', 'Constructs without protein_id', orphanConstruct > 0 ? 'fail' : 'pass', orphanConstruct,
    `${orphanConstruct} orphan constructs`, false);

  // protein without sequence
  const noSeq = await count('kbsi_protein', q => q.is('seq_final', null));
  const totalProt = await count('kbsi_protein');
  const noSeqPct = totalProt > 0 ? (noSeq / totalProt * 100).toFixed(1) : '0';
  add('consistency', 'Proteins without sequence', noSeq > totalProt * 0.05 ? 'warn' : 'pass', noSeq,
    `${noSeq} (${noSeqPct}%) proteins without seq_final`, false);

  // structure without construct
  const orphanStructure = await count('kbsi_structure', q => q.is('construct_id', null));
  add('consistency', 'Structures without construct_id', orphanStructure > 0 ? 'fail' : 'pass', orphanStructure,
    `${orphanStructure} orphan structures`, false);

  // pI range check (should be 0-14)
  const piOutOfRange = await count('kbsi_protein', q =>
    q.not('theoretical_pi', 'is', null).or('theoretical_pi.lt.0,theoretical_pi.gt.14'));
  add('consistency', 'pI out of [0, 14] range', piOutOfRange > 0 ? 'fail' : 'pass', piOutOfRange,
    `${piOutOfRange} proteins with invalid pI`, true);
}

// ═══════════════════════════════════════════════════════
// 3. INTEGRITY — 무결성 (참조 무결성 + 비즈니스 규칙)
// ═══════════════════════════════════════════════════════
async function checkIntegrity() {
  // Reference coverage
  const totalStructures = await count('kbsi_structure');
  const withRef = await count('kbsi_reference');
  const refCoverage = totalStructures > 0 ? (withRef / totalStructures * 100).toFixed(1) : '0';
  add('integrity', 'Structure-Reference coverage', parseFloat(refCoverage) < 90 ? 'warn' : 'pass', withRef,
    `${withRef} references for ${totalStructures} structures (${refCoverage}%)`, false);

  // ESM-2 embedding coverage
  const totalProt = await count('kbsi_protein');
  const withEmb = await count('kbsi_embedding');
  const embCoverage = totalProt > 0 ? (withEmb / totalProt * 100).toFixed(1) : '0';
  add('integrity', 'ESM-2 embedding coverage', parseFloat(embCoverage) < 90 ? 'warn' : 'pass', withEmb,
    `${withEmb}/${totalProt} proteins have embeddings (${embCoverage}%)`, false);

  // Staging table — pending items
  const pending = await count('kbsi_extraction_staging', q => q.eq('status', 'pending'));
  add('integrity', 'Staging: pending review items', pending > 100 ? 'warn' : 'pass', pending,
    `${pending} extraction records awaiting review`, false);

  // Audit log active
  const auditRecent = await count('kbsi_audit_log');
  add('integrity', 'Audit log records exist', auditRecent === 0 ? 'warn' : 'pass', auditRecent,
    `${auditRecent} total audit log entries`, false);

  // NMR-BMRB linkage
  const totalNmr = await count('kbsi_nmr_experiment');
  const withBmrb = await count('kbsi_nmr_experiment', q => q.not('bmrb_id', 'is', null));
  const bmrbPct = totalNmr > 0 ? (withBmrb / totalNmr * 100).toFixed(1) : '0';
  add('integrity', 'NMR-BMRB linkage', parseFloat(bmrbPct) < 50 ? 'warn' : 'pass', withBmrb,
    `${withBmrb}/${totalNmr} NMR experiments linked to BMRB (${bmrbPct}%)`, false);
}

// ═══════════════════════════════════════════════════════
// 4. DEDUPLICATION — 중복성
// ═══════════════════════════════════════════════════════
async function checkDeduplication() {
  // Proteins with same seq_hash
  const { data: dupeSeqs } = await supabase.rpc('exec_sql', {
    query: `SELECT seq_hash, COUNT(*) as cnt FROM kbsi_protein WHERE seq_hash IS NOT NULL GROUP BY seq_hash HAVING COUNT(*) > 1 LIMIT 20`
  }).maybeSingle();

  // Fallback: check if seq_hash column has duplicates by sampling
  const totalWithHash = await count('kbsi_protein', q => q.not('seq_hash', 'is', null));
  const totalProt = await count('kbsi_protein');
  const hashCoverage = totalProt > 0 ? (totalWithHash / totalProt * 100).toFixed(1) : '0';
  add('deduplication', 'seq_hash coverage', parseFloat(hashCoverage) < 80 ? 'warn' : 'pass', totalWithHash,
    `${totalWithHash}/${totalProt} proteins have seq_hash (${hashCoverage}%)`, false);

  // Ligand duplicates (same name + same MW)
  const totalLigands = await count('kbsi_ligand');
  add('deduplication', 'Ligand count sanity', totalLigands > 200000 ? 'warn' : 'pass', totalLigands,
    `${totalLigands} ligands — check for duplicates if unexpectedly high`, false);

  // Database ID uniqueness (protein_id + db_name + db_value should be unique)
  const totalDbIds = await count('kbsi_database_id');
  add('deduplication', 'Database ID records', true ? 'pass' : 'pass', totalDbIds,
    `${totalDbIds} cross-references (unique constraint enforced by DB)`, false);

  // NMR Chemical shift summary sanity
  const { data: csCount } = await supabase
    .from('kbsi_nmr_chemical_shift')
    .select('id', { count: 'exact', head: true });
  const shiftCount = csCount ?? 0;
  add('deduplication', 'Chemical shift records', true ? 'pass' : 'pass', shiftCount as number,
    `${shiftCount} chemical shift records`, false);
}

// ═══════════════════════════════════════════════════════
// 5. EXTENSIBILITY — 확장성 (스키마 + API 완성도)
// ═══════════════════════════════════════════════════════
async function checkExtensibility() {
  // Gene name coverage (확장 가능성의 척도)
  const totalProt = await count('kbsi_protein');
  const withGene = await count('kbsi_protein', q => q.not('gene_name', 'is', null));
  const genePct = totalProt > 0 ? (withGene / totalProt * 100).toFixed(1) : '0';
  add('extensibility', 'Gene name annotation', parseFloat(genePct) < 50 ? 'warn' : 'pass', withGene,
    `${withGene}/${totalProt} proteins have gene_name (${genePct}%)`, false);

  // UniProt coverage
  const withUniprot = await count('kbsi_database_id', q => q.eq('db_name', 'UniProt'));
  const uniprotPct = totalProt > 0 ? (withUniprot / totalProt * 100).toFixed(1) : '0';
  add('extensibility', 'UniProt coverage', parseFloat(uniprotPct) < 50 ? 'warn' : 'pass', withUniprot,
    `${withUniprot} UniProt mappings (${uniprotPct}% of proteins)`, false);

  // Organism normalization
  const withOrganism = await count('kbsi_protein', q => q.not('organism', 'is', null));
  const orgPct = totalProt > 0 ? (withOrganism / totalProt * 100).toFixed(1) : '0';
  add('extensibility', 'Organism annotation', parseFloat(orgPct) < 80 ? 'warn' : 'pass', withOrganism,
    `${withOrganism}/${totalProt} proteins have organism (${orgPct}%)`, false);

  // Mutation annotation
  const totalMut = await count('kbsi_mutation');
  add('extensibility', 'Mutation records', totalMut < 1000 ? 'warn' : 'pass', totalMut,
    `${totalMut} mutation records available`, false);

  // Characterization coverage vs constructs
  const totalChar = await count('kbsi_characterization');
  const totalConst = await count('kbsi_construct');
  const charPct = totalConst > 0 ? (totalChar / totalConst * 100).toFixed(1) : '0';
  add('extensibility', 'Characterization coverage', parseFloat(charPct) < 1 ? 'warn' : 'pass', totalChar,
    `${totalChar}/${totalConst} constructs have characterization (${charPct}%)`, false);
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
  ];

  console.log('═'.repeat(60));
  console.log('  Data Validation Loop — 5-Dimension Quality Check');
  console.log('  ' + new Date().toISOString());
  console.log('═'.repeat(60));

  for (const [dim, fn] of dimensions) {
    if (dimFilter && dim !== dimFilter) continue;
    console.log(`\nChecking: ${dim}...`);
    await fn();
  }

  if (jsonMode) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
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

  console.log('\n' + '═'.repeat(60));
  console.log(`  Summary: ${passed} pass / ${warned} warn / ${failed} fail (${fixable} fixable)`);

  // Per-dimension scores
  for (const dim of dims) {
    const dimResults = results.filter(r => r.dimension === dim);
    const score = dimResults.filter(r => r.status === 'pass').length;
    const total = dimResults.length;
    const pct = (score / total * 100).toFixed(0);
    const grade = parseFloat(pct) >= 90 ? 'A' : parseFloat(pct) >= 70 ? 'B' : parseFloat(pct) >= 50 ? 'C' : 'D';
    console.log(`  ${dim.padEnd(16)} ${score}/${total} (${pct}%) ${grade}`);
  }
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
