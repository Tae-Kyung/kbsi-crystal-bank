/**
 * Expression 데이터 소급 생성
 * construct.expression_system이 있지만 kbsi_expression 레코드가 없는 것을 채움
 *
 * npx tsx scripts/backfill-expressions.ts [옵션]
 *   --limit 50000
 *   --dry-run
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '999999');
  const dryRun = args.includes('--dry-run');

  console.log('Expression 데이터 소급 생성');
  console.log(`Service Role Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '있음' : '없음'}`);

  // expression_system이 있는 construct 조회 (pagination)
  let constructs: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (constructs.length < limit) {
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, expression_system, name')
      .not('expression_system', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    constructs = constructs.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  constructs = constructs.slice(0, limit);
  console.log(`expression_system 있는 construct: ${constructs.length}건`);

  // 이미 expression이 있는 construct_id 조회
  let existingIds = new Set<number>();
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_expression')
      .select('construct_id')
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) existingIds.add(r.construct_id);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`이미 expression 있음: ${existingIds.size}건`);

  const needsInsert = constructs.filter(c => !existingIds.has(c.id));
  console.log(`소급 생성 대상: ${needsInsert.length}건\n`);

  if (dryRun) {
    console.log('=== DRY-RUN ===');
    for (const c of needsInsert.slice(0, 5)) {
      console.log(`  ${c.name}: ${c.expression_system}`);
    }
    return;
  }

  // 배치 insert (500건씩)
  let totalInserted = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  for (let i = 0; i < needsInsert.length; i += 500) {
    const batch = needsInsert.slice(i, i + 500);
    const inserts = batch.map(c => ({
      construct_id: c.id,
      host: c.expression_system,
      source_type: 'database',
      source_db: 'PDB',
    }));

    const { data: inserted, error } = await supabase
      .from('kbsi_expression')
      .insert(inserts)
      .select('id');

    if (error) {
      console.log(`  batch ${i}: ⚠ ${error.message}`);
      totalFailed += batch.length;
    } else {
      totalInserted += (inserted || []).length;
    }

    if ((i + 500) % 10000 === 0 || i + 500 >= needsInsert.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ${Math.min(i + 500, needsInsert.length).toLocaleString()}/${needsInsert.length.toLocaleString()} | 성공: ${totalInserted.toLocaleString()} | ${elapsed}s`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료: ${totalInserted.toLocaleString()}건 생성, ${totalFailed.toLocaleString()}건 실패`);
  console.log('═'.repeat(50));
}

main().catch(console.error);
