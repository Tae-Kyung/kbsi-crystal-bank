/**
 * kbsi_construct.seq_final → MD5 해시 → seq_hash 컬럼에 저장
 *
 * npx tsx scripts/backfill-seq-hash.ts [옵션]
 *   --limit 50000    처리 건수 (기본: 전체)
 *   --dry-run        미리보기
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // 1. seq_hash IS NULL AND seq_final IS NOT NULL 레코드 조회 (paginate)
  let records: { id: number; seq_final: string }[] = [];
  let offset = 0;
  while (records.length < limit) {
    const { data, error } = await supabase
      .from('kbsi_construct')
      .select('id, seq_final')
      .is('seq_hash', null)
      .not('seq_final', 'is', null)
      .order('id')
      .range(offset, offset + 999);
    if (error) { console.error('조회 에러:', error.message); break; }
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
        const { error } = await supabase
          .from('kbsi_construct')
          .update({ seq_hash: hash })
          .eq('id', r.id);
        if (error) {
          console.error(`  UPDATE 에러 (id=${r.id}):`, error.message);
          failed++;
        } else {
          updated++;
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
}

main().catch(console.error);
