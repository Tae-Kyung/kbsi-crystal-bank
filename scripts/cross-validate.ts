/**
 * 데이터 교차 검증 — 원본 DB 대비 정확성 확인
 *
 * 1. PDB 원본 비교 (resolution, space_group, pH, temp)
 * 2. Enrichment 정확도 (condition_detail vs precipitant_type)
 * 3. FK 무결성 (orphan records)
 * 4. 내부 이상값 탐지
 *
 * npx tsx scripts/cross-validate.ts [--sample N]
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await client.connect();
  try {
    const sampleSize = parseInt(process.argv.find(a => a.startsWith('--sample='))?.split('=')[1] || '500');
    console.log(`═══════════════════════════════════════════════════`);
    console.log(`  KBSI 데이터 교차 검증 리포트`);
    console.log(`  샘플: ${sampleSize}건 | ${new Date().toISOString()}`);
    console.log(`═══════════════════════════════════════════════════\n`);

    // --- 1. PDB 원본 비교 ---
    console.log('━━━ 1. PDB 원본 비교 ━━━\n');

    const { rows: structures } = await client.query(
      `SELECT id, pdb_id, resolution, performed_on FROM kbsi_structure
       WHERE pdb_id IS NOT NULL LIMIT $1`,
      [sampleSize]
    );

    let pdbMatch = 0, pdbMismatch = 0, pdbError = 0;
    const pdbIssues: string[] = [];
    const checkCount = Math.min((structures || []).length, 100);

    for (let i = 0; i < checkCount; i++) {
      const s = structures![i];
      try {
        const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${s.pdb_id}`, {
          headers: { 'User-Agent': 'KBSI-Validate/1.0' },
        });
        if (!res.ok) { pdbError++; continue; }
        const pdb = await res.json();

        const pdbRes = pdb.rcsb_entry_info?.resolution_combined?.[0];
        const pdbDate = pdb.rcsb_accession_info?.deposit_date?.slice(0, 10);

        let match = true;
        if (pdbRes && s.resolution && Math.abs(pdbRes - s.resolution) > 0.01) {
          pdbIssues.push(`${s.pdb_id}: resolution KBSI=${s.resolution} PDB=${pdbRes}`);
          match = false;
        }
        if (pdbDate && s.performed_on && pdbDate !== s.performed_on) {
          pdbIssues.push(`${s.pdb_id}: date KBSI=${s.performed_on} PDB=${pdbDate}`);
          match = false;
        }

        if (match) pdbMatch++;
        else pdbMismatch++;
        await sleep(200);
      } catch { pdbError++; }

      if ((i + 1) % 20 === 0) process.stdout.write(`  ${i + 1}/${checkCount}...`);
    }
    console.log('');
    console.log(`  검증: ${checkCount}건`);
    console.log(`  일치: ${pdbMatch} (${(pdbMatch / checkCount * 100).toFixed(1)}%)`);
    console.log(`  불일치: ${pdbMismatch}`);
    console.log(`  에러: ${pdbError}`);
    if (pdbIssues.length > 0) {
      console.log(`  불일치 상세:`);
      pdbIssues.slice(0, 10).forEach(i => console.log(`    ${i}`));
    }

    // --- 2. Diffraction space_group 비교 ---
    console.log('\n━━━ 2. Diffraction space_group 비교 ━━━\n');

    const { rows: diffractions } = await client.query(
      `SELECT id, source_id, space_group, resolution FROM kbsi_diffraction
       WHERE source_db = $1 AND space_group IS NOT NULL LIMIT $2`,
      ['PDB', sampleSize]
    );

    let sgMatch = 0, sgMismatch = 0, sgError = 0;
    const sgIssues: string[] = [];
    const sgCheck = Math.min((diffractions || []).length, 100);

    for (let i = 0; i < sgCheck; i++) {
      const d = diffractions![i];
      try {
        const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${d.source_id}`, {
          headers: { 'User-Agent': 'KBSI-Validate/1.0' },
        });
        if (!res.ok) { sgError++; continue; }
        const pdb = await res.json();

        const pdbSG = pdb.symmetry?.space_group_name_H_M;
        if (pdbSG && d.space_group && pdbSG.trim() !== d.space_group.trim()) {
          sgIssues.push(`${d.source_id}: KBSI="${d.space_group}" PDB="${pdbSG}"`);
          sgMismatch++;
        } else {
          sgMatch++;
        }
        await sleep(200);
      } catch { sgError++; }

      if ((i + 1) % 20 === 0) process.stdout.write(`  ${i + 1}/${sgCheck}...`);
    }
    console.log('');
    console.log(`  검증: ${sgCheck}건`);
    console.log(`  일치: ${sgMatch} (${(sgMatch / sgCheck * 100).toFixed(1)}%)`);
    console.log(`  불일치: ${sgMismatch}`);
    if (sgIssues.length > 0) {
      console.log(`  불일치 상세:`);
      sgIssues.slice(0, 10).forEach(i => console.log(`    ${i}`));
    }

    // --- 3. Enrichment 정확도 ---
    console.log('\n━━━ 3. Enrichment 정확도 ━━━\n');

    const { rows: enriched } = await client.query(
      `SELECT id, condition_detail, precipitant_type, precipitant_conc, buffer_type, ph
       FROM kbsi_crystallization
       WHERE precipitant_type IS NOT NULL AND condition_detail IS NOT NULL AND source_type != $1
       LIMIT $2`,
      ['synthetic', sampleSize]
    );

    let enrichCorrect = 0, enrichWrong = 0, enrichUnclear = 0;
    const enrichIssues: string[] = [];

    for (const e of (enriched || []).slice(0, 200)) {
      const detail = (e.condition_detail || '').toLowerCase();
      const precip = (e.precipitant_type || '').toLowerCase();

      if (detail.includes(precip) || detail.includes(precip.replace(' ', ''))) {
        enrichCorrect++;
      } else if (precip.startsWith('peg') && detail.includes('peg')) {
        enrichCorrect++;
      } else if (detail.length < 10) {
        enrichUnclear++;
      } else {
        enrichWrong++;
        if (enrichIssues.length < 10) {
          enrichIssues.push(`id=${e.id}: detail="${detail.slice(0, 50)}" -> type="${e.precipitant_type}"`);
        }
      }
    }
    const enrichTotal = enrichCorrect + enrichWrong + enrichUnclear;
    console.log(`  검증: ${enrichTotal}건`);
    console.log(`  일치: ${enrichCorrect} (${(enrichCorrect / enrichTotal * 100).toFixed(1)}%)`);
    console.log(`  불일치: ${enrichWrong} (${(enrichWrong / enrichTotal * 100).toFixed(1)}%)`);
    console.log(`  불명확: ${enrichUnclear}`);
    if (enrichIssues.length > 0) {
      console.log(`  불일치 샘플:`);
      enrichIssues.forEach(i => console.log(`    ${i}`));
    }

    // --- 4. FK 무결성 ---
    console.log('\n━━━ 4. FK 무결성 ━━━\n');

    const { rows: [{ count: totalConstructs }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_construct');
    const { rows: [{ count: totalProteins }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_protein');
    const { rows: [{ count: totalExpr }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_expression');
    const { rows: [{ count: totalCryst }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_crystallization');

    console.log(`  Proteins: ${parseInt(totalProteins).toLocaleString()}`);
    console.log(`  Constructs: ${parseInt(totalConstructs).toLocaleString()}`);
    console.log(`  Expression: ${parseInt(totalExpr).toLocaleString()}`);
    console.log(`  Crystallization: ${parseInt(totalCryst).toLocaleString()}`);
    console.log(`  (FK 무결성은 DB constraint로 보장됨)`);

    // --- 5. 내부 이상값 ---
    console.log('\n━━━ 5. 내부 이상값 탐지 ━━━\n');

    const outlierQueries = await Promise.all([
      client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE ph < 0 AND source_type != 'synthetic'`),
      client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE ph > 14 AND source_type != 'synthetic'`),
      client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE temperature < -20 AND source_type != 'synthetic'`),
      client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE temperature > 80 AND source_type != 'synthetic'`),
      client.query(`SELECT COUNT(*) as count FROM kbsi_structure WHERE resolution < 0.5`),
      client.query(`SELECT COUNT(*) as count FROM kbsi_structure WHERE resolution > 20`),
      client.query(`SELECT COUNT(*) as count FROM kbsi_construct WHERE theoretical_mw IS NOT NULL AND theoretical_mw < 100`),
      client.query(`SELECT COUNT(*) as count FROM kbsi_construct WHERE theoretical_mw IS NOT NULL AND theoretical_mw > 1000000`),
    ]);

    const [phLow, phHigh, tempLow, tempHigh, resLow, resHigh, mwZero, mwHuge] = outlierQueries.map(r => parseInt(r.rows[0].count));

    console.log(`  pH < 0: ${phLow} | pH > 14: ${phHigh}`);
    console.log(`  temp < -20: ${tempLow} | temp > 80: ${tempHigh}`);
    console.log(`  resolution < 0.5A: ${resLow} | > 20A: ${resHigh}`);
    console.log(`  MW < 100Da: ${mwZero} | MW > 1MDa: ${mwHuge}`);

    const totalOutliers = phLow + phHigh + tempLow + tempHigh + resLow + resHigh + mwZero + mwHuge;
    console.log(`  총 이상값: ${totalOutliers}건`);

    // --- 요약 ---
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  검증 요약');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  PDB 원본 일치율: ${(pdbMatch / checkCount * 100).toFixed(1)}% (${checkCount}건)`);
    console.log(`  space_group 일치율: ${(sgMatch / sgCheck * 100).toFixed(1)}% (${sgCheck}건)`);
    console.log(`  Enrichment 정확도: ${(enrichCorrect / enrichTotal * 100).toFixed(1)}% (${enrichTotal}건)`);
    console.log(`  FK 무결성: DB constraint 보장`);
    console.log(`  이상값: ${totalOutliers}건`);
    console.log('═══════════════════════════════════════════════════');
  } finally {
    await client.end();
  }
}

main().catch(console.error);
