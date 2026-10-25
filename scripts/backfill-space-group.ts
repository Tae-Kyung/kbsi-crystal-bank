/**
 * kbsi_diffraction의 space_group NULL을 PDB API에서 backfill
 * 버그: cell.space_group_name_H_M → symmetry.space_group_name_H_M
 *
 * npx tsx scripts/backfill-space-group.ts [--limit N] [--dry-run]
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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const dryRun = args.includes('--dry-run');

  console.log(`=== space_group backfill ===`);
  console.log(`limit: ${limit === Infinity ? '전체' : limit}, dry-run: ${dryRun}\n`);

  await client.connect();
  try {
    // space_group이 NULL인 PDB 소스 diffraction 레코드 조회
    let records: any[] = [];
    let offset = 0;
    while (records.length < limit) {
      const { rows: data } = await client.query(
        "SELECT id, source_id FROM kbsi_diffraction WHERE source_db = 'PDB' AND space_group IS NULL ORDER BY id OFFSET $1 LIMIT 1000",
        [offset]
      );
      if (!data || data.length === 0) break;
      records = records.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    if (limit !== Infinity) records = records.slice(0, limit);
    console.log(`대상: ${records.length}건\n`);

    let updated = 0, skipped = 0, failed = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      try {
        const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${r.source_id}`, {
          headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
        });
        if (!res.ok) { skipped++; await sleep(200); continue; }
        const entry = await res.json();
        const sg = entry.symmetry?.space_group_name_H_M;
        if (!sg) { skipped++; await sleep(200); continue; }

        if (!dryRun) {
          try {
            await client.query('UPDATE kbsi_diffraction SET space_group = $1 WHERE id = $2', [sg, r.id]);
            updated++;
          } catch { failed++; }
        } else {
          updated++;
        }
      } catch { failed++; }

      await sleep(200);

      if ((i + 1) % 100 === 0) {
        console.log(`[${i + 1}/${records.length}] updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
      }
    }

    console.log(`\n=== 완료 ${dryRun ? '(dry-run)' : ''} ===`);
    console.log(`updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
