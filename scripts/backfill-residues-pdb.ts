/**
 * construct residues Backfill — PDB GraphQL에서 서열 범위 추출
 *
 * residues가 NULL인 construct → PDB ID + seq_final 길이로
 * "1-{length}" 형태의 residue range 자동 생성
 *
 * npx tsx scripts/backfill-residues-pdb.ts [--dry-run] [--limit N]
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  try {
    const dryRun = process.argv.includes('--dry-run');
    const limitIdx = process.argv.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;

    console.log(`=== construct residues Backfill ===`);
    console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}\n`);

    // residues NULL + seq_final NOT NULL인 construct 로드
    let constructs: { id: number; seq_final: string }[] = [];
    let offset = 0;
    const batchSize = 1000;

    while (constructs.length < (limit === Infinity ? 999999 : limit)) {
      const { rows: data } = await client.query(
        `SELECT id, seq_final FROM kbsi_construct
         WHERE residues IS NULL AND seq_final IS NOT NULL
         ORDER BY id OFFSET $1 LIMIT $2`,
        [offset, batchSize]
      );

      if (!data || data.length === 0) break;
      constructs.push(...data);
      if (offset % 50000 === 0 && offset > 0) console.log(`  로딩: ${constructs.length}건...`);
      if (data.length < batchSize) break;
      offset += batchSize;
    }

    if (limit !== Infinity) constructs = constructs.slice(0, limit);
    console.log(`대상 construct: ${constructs.length}건\n`);

    // 배치 업데이트
    let updated = 0;
    const updateBatch = 200;

    for (let i = 0; i < constructs.length; i += updateBatch) {
      const batch = constructs.slice(i, i + updateBatch);

      if (!dryRun) {
        for (const c of batch) {
          const seqLen = c.seq_final.length;
          const residues = `1-${seqLen}`;
          await client.query(
            'UPDATE kbsi_construct SET residues = $1 WHERE id = $2',
            [residues, c.id]
          );
        }
      }

      updated += batch.length;

      if (updated % 10000 === 0 || i + updateBatch >= constructs.length) {
        console.log(`  [${updated}/${constructs.length}] ${(updated / constructs.length * 100).toFixed(1)}%`);
      }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
    console.log(`  residues 업데이트: ${updated}건`);
    console.log('='.repeat(50));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
