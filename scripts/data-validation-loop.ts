/**
 * Data Validation Loop — 10대 품질 차원 통합 검증
 * npm run validate
 */

import pg from 'pg';

const pgClient = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

interface CheckResult { dimension: string; check: string; status: 'pass' | 'warn' | 'fail'; count: number; detail: string; fixable: boolean; }
const results: CheckResult[] = [];
function add(dimension: string, check: string, status: 'pass' | 'warn' | 'fail', count: number, detail: string, fixable = false) { results.push({ dimension, check, status, count, detail, fixable }); }

async function cnt(table: string, where = '', params: any[] = []): Promise<number> {
  const sql = where ? `SELECT COUNT(*) as c FROM ${table} WHERE ${where}` : `SELECT COUNT(*) as c FROM ${table}`;
  const { rows: [{ c }] } = await pgClient.query(sql, params);
  return parseInt(c);
}
function fmt(n: number) { return n.toLocaleString(); }
function pct(n: number, total: number) { return total > 0 ? (n / total * 100).toFixed(1) : '0.0'; }
function grade(n: number, total: number, warnThresh = 0.8, failThresh = 0.5): 'pass' | 'warn' | 'fail' {
  const r = total > 0 ? n / total : 0;
  return r >= warnThresh ? 'pass' : r >= failThresh ? 'warn' : 'fail';
}

async function checkAccuracy() {
  const phLow = await cnt('kbsi_crystallization', `ph < 1 AND ph IS NOT NULL AND source_type != 'synthetic'`);
  add('accuracy', 'pH < 1.0 (non-synthetic)', phLow > 10 ? 'warn' : 'pass', phLow, `${phLow} records`, true);
  const phHigh = await cnt('kbsi_crystallization', `ph > 13 AND ph IS NOT NULL AND source_type != 'synthetic'`);
  add('accuracy', 'pH > 13.0 (non-synthetic)', phHigh > 10 ? 'warn' : 'pass', phHigh, `${phHigh} records`, true);
  const tempLow = await cnt('kbsi_crystallization', `temperature < -20 AND temperature IS NOT NULL AND source_type != 'synthetic'`);
  add('accuracy', 'Temp < -20C (non-synthetic)', tempLow > 10 ? 'warn' : 'pass', tempLow, `${tempLow} records`, true);
  const tempHigh = await cnt('kbsi_crystallization', `temperature > 60 AND temperature IS NOT NULL AND source_type != 'synthetic'`);
  add('accuracy', 'Temp > 60C (non-synthetic)', tempHigh > 0 ? 'warn' : 'pass', tempHigh, `${tempHigh} records`, false);
  const resLow = await cnt('kbsi_diffraction', 'resolution < 0.5 AND resolution IS NOT NULL');
  add('accuracy', 'Resolution < 0.5 A', resLow > 0 ? 'warn' : 'pass', resLow, `${resLow} diffractions`, false);
  const resHigh = await cnt('kbsi_diffraction', 'resolution > 20 AND resolution IS NOT NULL');
  add('accuracy', 'Resolution > 20 A', resHigh > 0 ? 'warn' : 'pass', resHigh, `${resHigh} diffractions`, true);
  const mwLow = await cnt('kbsi_protein', 'theoretical_mw < 100 AND theoretical_mw IS NOT NULL');
  add('accuracy', 'MW < 100 Da', mwLow > 0 ? 'warn' : 'pass', mwLow, `${mwLow} proteins`, false);
  const mwHigh = await cnt('kbsi_protein', 'theoretical_mw > 1000000 AND theoretical_mw IS NOT NULL');
  add('accuracy', 'MW > 1 MDa', mwHigh > 0 ? 'warn' : 'pass', mwHigh, `${mwHigh} proteins`, false);
}

async function checkConsistency() {
  const noST = await cnt('kbsi_crystallization', 'outcome IS NOT NULL AND source_type IS NULL');
  add('consistency', 'outcome but no source_type', noST > 0 ? 'fail' : 'pass', noST, `${noST} records`, true);
  const noSDb = await cnt('kbsi_crystallization', 'source_db IS NULL');
  add('consistency', 'NULL source_db', noSDb > 100 ? 'warn' : 'pass', noSDb, `${noSDb} records`, true);
  const orphanC = await cnt('kbsi_construct', 'protein_id IS NULL');
  add('consistency', 'Orphan constructs', orphanC > 0 ? 'fail' : 'pass', orphanC, `${orphanC} constructs`, false);
  const totalProt = await cnt('kbsi_protein');
  const noSeq = await cnt('kbsi_protein', 'seq_final IS NULL');
  add('consistency', 'Proteins without sequence', noSeq > totalProt * 0.05 ? 'warn' : 'pass', noSeq, `${noSeq} (${pct(noSeq, totalProt)}%)`, false);
  const orphanS = await cnt('kbsi_structure', 'construct_id IS NULL');
  add('consistency', 'Orphan structures', orphanS > 0 ? 'fail' : 'pass', orphanS, `${orphanS} structures`, false);
  const piOOR = await cnt('kbsi_protein', `theoretical_pi IS NOT NULL AND (theoretical_pi < 0 OR theoretical_pi > 14)`);
  add('consistency', 'pI out of [0,14]', piOOR > 0 ? 'fail' : 'pass', piOOR, `${piOOR} proteins`, true);
}

async function checkIntegrity() {
  const totalStruct = await cnt('kbsi_structure');
  const withRef = await cnt('kbsi_reference');
  add('integrity', 'Structure-Reference linkage', grade(withRef, totalStruct, 0.9, 0.5), withRef, `${fmt(withRef)}/${fmt(totalStruct)}`, false);
  const totalProt = await cnt('kbsi_protein');
  const withEmb = await cnt('kbsi_embedding');
  add('integrity', 'ESM-2 embedding coverage', grade(withEmb, totalProt, 0.9, 0.5), withEmb, `${fmt(withEmb)}/${fmt(totalProt)}`, false);
  const pending = await cnt('kbsi_extraction_staging', `status = 'pending'`);
  add('integrity', 'Staging pending items', pending > 100 ? 'warn' : 'pass', pending, `${pending} pending`, false);
  const totalNmr = await cnt('kbsi_nmr_experiment');
  const withBmrb = await cnt('kbsi_nmr_experiment', 'bmrb_id IS NOT NULL');
  add('integrity', 'NMR-BMRB linkage', grade(withBmrb, totalNmr, 0.6, 0.3), withBmrb, `${fmt(withBmrb)}/${fmt(totalNmr)}`, false);
}

async function checkDeduplication() {
  const totalProt = await cnt('kbsi_protein');
  const totalWithHash = await cnt('kbsi_protein', 'seq_hash IS NOT NULL');
  add('deduplication', 'seq_hash coverage', grade(totalWithHash, totalProt), totalWithHash, `${fmt(totalWithHash)}/${fmt(totalProt)} (${pct(totalWithHash, totalProt)}%)`, false);
  const totalLigands = await cnt('kbsi_ligand');
  add('deduplication', 'Ligand count sanity', totalLigands > 200000 ? 'warn' : 'pass', totalLigands, `${fmt(totalLigands)} ligands`, false);
  const csCount = await cnt('kbsi_nmr_chemical_shift');
  add('deduplication', 'Chemical shift records', 'pass', csCount, `${fmt(csCount)} records`, false);
}

async function checkExtensibility() {
  const totalProt = await cnt('kbsi_protein');
  const withGene = await cnt('kbsi_protein', 'gene_name IS NOT NULL');
  add('extensibility', 'Gene name annotation', grade(withGene, totalProt, 0.6, 0.3), withGene, `${fmt(withGene)}/${fmt(totalProt)} (${pct(withGene, totalProt)}%)`, false);
  const withUniprot = await cnt('kbsi_database_id', `db_name = 'UniProt'`);
  add('extensibility', 'UniProt coverage', grade(withUniprot, totalProt, 0.6, 0.3), withUniprot, `${fmt(withUniprot)} mappings`, false);
  const withOrg = await cnt('kbsi_protein', 'organism IS NOT NULL');
  add('extensibility', 'Organism annotation', grade(withOrg, totalProt, 0.8, 0.5), withOrg, `${fmt(withOrg)}/${fmt(totalProt)}`, false);
  const totalMut = await cnt('kbsi_mutation');
  add('extensibility', 'Mutation records', totalMut < 1000 ? 'warn' : 'pass', totalMut, `${fmt(totalMut)} records`, false);
}

async function checkCompleteness() {
  const totalCryst = await cnt('kbsi_crystallization');
  const fields: [string, string, number][] = [['pH', 'ph', 0.90], ['Temperature', 'temperature', 0.85], ['Precipitant type', 'precipitant_type', 0.10], ['Outcome', 'outcome', 0.90]];
  for (const [name, field, warn] of fields) {
    const filled = await cnt('kbsi_crystallization', `${field} IS NOT NULL`);
    const ratio = totalCryst > 0 ? filled / totalCryst : 0;
    add('completeness', `Crystallization: ${name}`, ratio >= warn ? 'pass' : 'warn', filled, `${fmt(filled)}/${fmt(totalCryst)} (${pct(filled, totalCryst)}%)`, false);
  }
  const totalProt = await cnt('kbsi_protein');
  const pFields: [string, string, number][] = [['Sequence', 'seq_final', 0.95], ['Organism', 'organism', 0.80], ['Theoretical MW', 'theoretical_mw', 0.50]];
  for (const [name, field, warn] of pFields) {
    const filled = await cnt('kbsi_protein', `${field} IS NOT NULL`);
    const ratio = totalProt > 0 ? filled / totalProt : 0;
    add('completeness', `Protein: ${name}`, ratio >= warn ? 'pass' : 'warn', filled, `${fmt(filled)}/${fmt(totalProt)} (${pct(filled, totalProt)}%)`, false);
  }
  const totalConst = await cnt('kbsi_construct');
  const pipeline: [string, string, number][] = [['Expression', 'kbsi_expression', 0.05], ['Purification', 'kbsi_purification', 0.02], ['Crystallization', 'kbsi_crystallization', 0.50], ['Diffraction', 'kbsi_diffraction', 0.50], ['Structure', 'kbsi_structure', 0.50]];
  for (const [name, table, warn] of pipeline) {
    const recs = await cnt(table);
    const ratio = totalConst > 0 ? recs / totalConst : 0;
    add('completeness', `Pipeline: ${name}`, ratio >= warn ? 'pass' : 'warn', recs, `${fmt(recs)} records (${pct(recs, totalConst)}%)`, false);
  }
}

async function checkDistribution() {
  const totalCryst = await cnt('kbsi_crystallization');
  const success = await cnt('kbsi_crystallization', `outcome IN ('single_crystal','diffraction_quality')`);
  const failure = totalCryst - success;
  const imbalanceRatio = failure > 0 ? success / failure : 0;
  add('distribution', 'Success/failure balance', imbalanceRatio > 0.05 && imbalanceRatio < 0.95 ? 'pass' : 'warn', success, `Success ${fmt(success)} (${pct(success, totalCryst)}%) ratio ${imbalanceRatio.toFixed(3)}`, false);
  const experimental = await cnt('kbsi_crystallization', `source_type != 'synthetic'`);
  const synthetic = await cnt('kbsi_crystallization', `source_type = 'synthetic'`);
  const synthRatio = totalCryst > 0 ? synthetic / totalCryst : 0;
  add('distribution', 'Experimental vs Synthetic', synthRatio > 0.9 ? 'warn' : 'pass', experimental, `Exp ${fmt(experimental)} / Synth ${fmt(synthetic)}`, false);

  const { rows: phSample } = await pgClient.query(`SELECT ph FROM kbsi_crystallization WHERE ph IS NOT NULL AND source_type != 'synthetic' LIMIT 10000`);
  if (phSample && phSample.length > 100) {
    const vals = phSample.map(r => r.ph as number);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    add('distribution', 'pH spread (experimental)', std < 0.5 ? 'warn' : 'pass', vals.length, `mean=${mean.toFixed(2)}, std=${std.toFixed(2)}`, false);
  }
}

async function checkProvenance() {
  const totalCryst = await cnt('kbsi_crystallization');
  const withST = await cnt('kbsi_crystallization', 'source_type IS NOT NULL');
  add('provenance', 'source_type coverage', grade(withST, totalCryst, 0.99, 0.9), withST, `${fmt(withST)}/${fmt(totalCryst)} (${pct(withST, totalCryst)}%)`, true);
  const withSDb = await cnt('kbsi_crystallization', 'source_db IS NOT NULL');
  add('provenance', 'source_db coverage', grade(withSDb, totalCryst, 0.99, 0.9), withSDb, `${fmt(withSDb)}/${fmt(totalCryst)} (${pct(withSDb, totalCryst)}%)`, true);
  const withSId = await cnt('kbsi_crystallization', 'source_id IS NOT NULL');
  add('provenance', 'source_id coverage', grade(withSId, totalCryst, 0.90, 0.5), withSId, `${fmt(withSId)}/${fmt(totalCryst)} (${pct(withSId, totalCryst)}%)`, false);
  const totalRef = await cnt('kbsi_reference');
  const refDoi = await cnt('kbsi_reference', 'doi IS NOT NULL');
  add('provenance', 'Reference DOI coverage', grade(refDoi, totalRef, 0.8, 0.5), refDoi, `${fmt(refDoi)}/${fmt(totalRef)} (${pct(refDoi, totalRef)}%)`, false);
}

async function checkTimeliness() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentProt = await cnt('kbsi_protein', 'updated_at >= $1', [thirtyDaysAgo]);
  add('timeliness', 'Proteins updated (30d)', recentProt > 0 ? 'pass' : 'warn', recentProt, `${fmt(recentProt)} updated`, false);
  const recentStruct = await cnt('kbsi_structure', `deposition_date IS NOT NULL AND deposition_date >= '2024-01-01'`);
  add('timeliness', 'Structures from 2024+', recentStruct > 0 ? 'pass' : 'warn', recentStruct, `${fmt(recentStruct)} structures`, false);
}

async function checkConformity() {
  const validOutcomes = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
  const totalWithOutcome = await cnt('kbsi_crystallization', 'outcome IS NOT NULL');
  let validOC = 0;
  for (const o of validOutcomes) validOC += await cnt('kbsi_crystallization', 'outcome = $1', [o]);
  add('conformity', 'Outcome enum compliance', validOC === totalWithOutcome ? 'pass' : 'fail', totalWithOutcome - validOC, `${totalWithOutcome - validOC} non-standard`, true);

  const { rows: pdbSample } = await pgClient.query('SELECT pdb_id FROM kbsi_structure WHERE pdb_id IS NOT NULL LIMIT 1000');
  if (pdbSample) {
    const invalid = pdbSample.filter(r => !/^[0-9A-Za-z]{4,8}$/.test(r.pdb_id));
    add('conformity', 'PDB ID format', invalid.length === 0 ? 'pass' : 'warn', invalid.length, `${invalid.length}/${pdbSample.length} non-standard`, true);
  }
}

async function main() {
  await pgClient.connect();
  try {
    const args = process.argv.slice(2);
    const jsonMode = args.includes('--json');
    const dimFilter = args.find(a => a.startsWith('--dim='))?.split('=')[1];
    const dimensions: [string, () => Promise<void>][] = [
      ['accuracy', checkAccuracy], ['consistency', checkConsistency], ['integrity', checkIntegrity],
      ['deduplication', checkDeduplication], ['extensibility', checkExtensibility], ['completeness', checkCompleteness],
      ['distribution', checkDistribution], ['provenance', checkProvenance], ['timeliness', checkTimeliness], ['conformity', checkConformity],
    ];

    console.log('='.repeat(60) + '\n  Data Validation Loop - 10-Dimension Quality Framework\n  ' + new Date().toISOString() + '\n' + '='.repeat(60));
    for (const [dim, fn] of dimensions) { if (dimFilter && dim !== dimFilter) continue; console.log(`\nChecking: ${dim}...`); await fn(); }

    if (jsonMode) { console.log(JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)); return; }

    const dims = [...new Set(results.map(r => r.dimension))];
    for (const dim of dims) {
      const dr = results.filter(r => r.dimension === dim);
      const icon = dr.every(r => r.status === 'pass') ? 'V' : dr.some(r => r.status === 'fail') ? 'X' : '!';
      console.log(`\n${icon} ${dim.toUpperCase()}`);
      for (const r of dr) { const si = r.status === 'pass' ? '  V' : r.status === 'warn' ? '  !' : '  X'; console.log(`${si} ${r.check}: ${r.detail}${r.fixable && r.status !== 'pass' ? ' [fixable]' : ''}`); }
    }

    const passed = results.filter(r => r.status === 'pass').length;
    const warned = results.filter(r => r.status === 'warn').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const total = results.length;
    console.log('\n' + '='.repeat(60) + `\n  Summary: ${passed} pass / ${warned} warn / ${failed} fail (${total} total)\n` + '='.repeat(60));

    for (const dim of dims) {
      const dr = results.filter(r => r.dimension === dim);
      const score = dr.filter(r => r.status === 'pass').length;
      const p = (score / dr.length * 100).toFixed(0);
      const g = parseFloat(p) >= 90 ? 'A' : parseFloat(p) >= 70 ? 'B' : parseFloat(p) >= 50 ? 'C' : 'D';
      console.log(`  ${dim.padEnd(16)} ${String(score).padStart(2)}/${dr.length} (${p.padStart(3)}%) ${g}`);
    }

    const overallPct = (passed / total * 100).toFixed(0);
    const overallGrade = parseFloat(overallPct) >= 90 ? 'A' : parseFloat(overallPct) >= 70 ? 'B' : parseFloat(overallPct) >= 50 ? 'C' : 'D';
    console.log(`  ${'OVERALL'.padEnd(16)} ${String(passed).padStart(2)}/${total} (${overallPct.padStart(3)}%) ${overallGrade}\n` + '='.repeat(60));
    process.exit(failed > 0 ? 1 : 0);
  } finally {
    await pgClient.end();
  }
}

main().catch(console.error);
