/**
 * AlphaFold DB 예측 구조 수집
 * DB의 UniProt ID를 기반으로 AlphaFold 예측 구조 메타데이터 수집
 *
 * npx tsx scripts/harvest-alphafold.ts [옵션]
 *   --limit 5000     처리 건수 (기본: 5000)
 *   --dry-run         미리보기
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const AF_API = 'https://alphafold.ebi.ac.uk/api';

interface AlphaFoldEntry {
  uniprotAccession: string;
  modelUrl: string;
  paeImageUrl: string;
  globalMetricValue: number; // pLDDT
}

async function fetchAlphaFold(uniprotId: string, debug = false): Promise<AlphaFoldEntry | null> {
  try {
    const url = `${AF_API}/prediction/${uniprotId}`;
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'KBSI-CrystalBank/1.0 (https://kbsi-crystal-bank.vercel.app)' },
    });
    if (debug) console.log(`  AF fetch ${uniprotId}: status=${res.status} type=${res.headers.get('content-type')}`);
    if (!res.ok) return null;
    const text = await res.text();
    if (debug) console.log(`  AF body: ${text.slice(0, 100)}`);
    const data = JSON.parse(text);
    if (!Array.isArray(data) || data.length === 0) return null;
    const entry = data[0];
    return {
      uniprotAccession: entry.uniprotAccession,
      modelUrl: entry.pdbUrl || entry.cifUrl || null,
      paeImageUrl: entry.paeImageUrl || null,
      globalMetricValue: entry.globalMetricValue || null,
    };
  } catch (e: any) {
    if (debug) console.log(`  AF error: ${e.message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '5000');
  const dryRun = args.includes('--dry-run');

  await client.connect();
  try {
    console.log('AlphaFold DB 예측 구조 수집');

    // UniProt ID가 있는 단백질 조회
    const { rows: uniprotIds } = await client.query(
      `SELECT protein_id, db_value FROM kbsi_database_id
       WHERE db_name = $1
       ORDER BY protein_id
       LIMIT $2`,
      ['UniProt', limit]
    );

    // 이미 AlphaFold 데이터가 있는 것 제외
    const { rows: existing } = await client.query(
      `SELECT protein_id FROM kbsi_database_id WHERE db_name = $1`,
      ['AlphaFold']
    );
    const hasAF = new Set(existing.map((r: any) => r.protein_id));

    const targets = uniprotIds.filter((u: any) => !hasAF.has(u.protein_id));
    console.log(`UniProt ID: ${uniprotIds.length}건, AlphaFold 미수집: ${targets.length}건\n`);

    let success = 0, notFound = 0;
    const startTime = Date.now();

    for (let i = 0; i < targets.length; i++) {
      const { protein_id, db_value: db_id } = targets[i];

      const af = await fetchAlphaFold(db_id, i < 3);
      if (!af) { notFound++; continue; }

      if (dryRun) {
        if (success < 10) console.log(`  ${db_id}: pLDDT=${af.globalMetricValue}`);
        success++;
        continue;
      }

      // AlphaFold ID 저장
      await client.query(
        `INSERT INTO kbsi_database_id (protein_id, db_name, db_value)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [protein_id, 'AlphaFold', af.uniprotAccession]
      );

      success++;

      if ((i + 1) % 200 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`  ${i + 1}/${targets.length} | AF found: ${success} | not found: ${notFound} | ${elapsed}s`);
      }

      await sleep(100);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
    console.log(`AlphaFold 연결: ${success}건`);
    console.log(`미발견: ${notFound}건`);
    console.log(`소요: ${elapsed}s`);
    console.log('═'.repeat(50));
  } finally {
    await client.end();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
main().catch(console.error);
