/**
 * kbsi_construct.seq_final → MD5 해시 → seq_hash 컬럼에 저장
 *
 * npx tsx scripts/backfill-seq-hash.ts [옵션]
 *   --limit 50000    처리 건수 (기본: 전체)
 *   --dry-run        미리보기
 */

import pg from 'pg';
import { createHash } from 'crypto';

const client = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

function seqHash(seq: string): string {
  const cleaned = seq.toUpperCase().replace(/[^A-Z]/g, '');
  return createHash('md5').update(cleaned).digest('hex');
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const dryRun = args.includes('--dry-run');

  console.log(`=== seq_hash backfill ===`);
  console.log(`limit: ${limit === Infinity ? '전체' : limit}, dry-run: ${dryRun}\n`);

  await client.connect();
  try {
    // 1. seq_hash IS NULL AND seq_final IS NOT NULL 레코드 조회 (paginate)
    let records: { id: number; seq_final: string }[] = [];
    let offset = 0;
    while (records.length < limit) {
      const { rows: data } = await client.query(
        'SELECT id, seq_final FROM kbsi_construct WHERE seq_hash IS NULL AND seq_final IS NOT NULL ORDER BY id OFFSET $1 LIMIT 1000',
        [offset]
      );
      if (!data || data.length === 0) break;
      records = records.concat(data as any);
      if (data.length < 1000) break;
      offset += 1000;
    }
    if (limit !== Infinity) records = records.slice(0, limit);
    console.log(`대상: ${records.length}건\n`);

    let updated = 0, failed = 0;
    const BATCH = 100;

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);

      if (dryRun) {
        for (const r of batch) {
          const hash = seqHash(r.seq_final);
          if ((updated + 1) <= 5) {
            console.log(`  [DRY] id=${r.id} hash=${hash} seq=${r.seq_final.substring(0, 30)}...`);
          }
          updated++;
        }
      } else {
        // 배치 업데이트: 각 레코드별 해시가 다르므로 개별 UPDATE
        const promises = batch.map(async (r) => {
          const hash = seqHash(r.seq_final);
          try {
            await client.query(
              'UPDATE kbsi_construct SET seq_hash = $1 WHERE id = $2',
              [hash, r.id]
            );
            updated++;
          } catch (e: any) {
            console.error(`  UPDATE 에러 (id=${r.id}):`, e.message);
            failed++;
          }
        });
        await Promise.all(promises);
      }

      const processed = Math.min(i + BATCH, records.length);
      if (processed % 1000 === 0 || processed === records.length) {
        console.log(`[${processed}/${records.length}] updated: ${updated}, failed: ${failed}`);
      }
    }

    console.log(`\n=== 완료 ===`);
    console.log(`updated: ${updated}, failed: ${failed}`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
