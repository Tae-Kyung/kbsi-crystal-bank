/**
 * construct residues Backfill — PDB GraphQL에서 서열 범위 추출
 *
 * residues가 NULL인 construct → PDB ID + seq_final 길이로
 * "1-{length}" 형태의 residue range 자동 생성
 *
 * npx tsx scripts/backfill-residues-pdb.ts [--dry-run] [--limit N]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
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
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, seq_final')
      .is('residues', null)
      .not('seq_final', 'is', null)
      .order('id')
      .range(offset, offset + batchSize - 1);

    if (!data || data.length === 0) break;
    constructs.push(...(data as any[]));
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
      // 개별 업데이트 (각 construct의 seq_final 길이가 다르므로)
      for (const c of batch) {
        const seqLen = c.seq_final.length;
        const residues = `1-${seqLen}`;
        await supabase
          .from('kbsi_construct')
          .update({ residues })
          .eq('id', c.id);
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
}

main().catch(console.error);
