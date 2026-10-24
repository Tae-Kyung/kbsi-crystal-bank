/**
 * Construct 중복 제거 (Deduplication)
 *
 * 같은 name + 같은 protein_id를 가진 construct 그룹에서
 * 가장 오래된(lowest id) construct만 유지하고 나머지를 삭제합니다.
 *
 * 모든 자식 테이블(13개)이 ON DELETE CASCADE이므로
 * construct 삭제 시 연결된 structure, expression, crystallization 등이 자동 삭제됩니다.
 *
 * Usage:
 *   npx tsx scripts/dedup-constructs.ts --dry-run        # 미리보기 (삭제 안 함)
 *   npx tsx scripts/dedup-constructs.ts                  # 실행
 *   npx tsx scripts/dedup-constructs.ts --batch-size 200 # 배치 크기 조절
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function fmt(n: number) { return n.toLocaleString(); }

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchSize = parseInt(args[args.indexOf('--batch-size') + 1] || '500');

  console.log('═'.repeat(60));
  console.log('  Construct Deduplication');
  console.log(`  Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`  Batch size: ${batchSize}`);
  console.log('═'.repeat(60));

  // ─── Step 1: 전체 construct 로드 ───
  console.log('\n[1/4] Loading all constructs...');
  const constructs: { id: number; name: string; protein_id: number }[] = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, name, protein_id')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    constructs.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
    if (offset % 50000 === 0) process.stdout.write(`  ${fmt(offset)} loaded...\r`);
  }
  console.log(`  Total constructs: ${fmt(constructs.length)}`);

  // ─── Step 2: 중복 그룹 탐지 ───
  console.log('\n[2/4] Finding duplicate groups...');
  const groupMap = new Map<string, number[]>();

  for (const c of constructs) {
    const key = `${c.name}::${c.protein_id}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(c.id);
  }

  const dupGroups = [...groupMap.entries()].filter(([, ids]) => ids.length > 1);
  const totalDupConstructs = dupGroups.reduce((sum, [, ids]) => sum + ids.length - 1, 0);

  console.log(`  Unique groups: ${fmt(groupMap.size)}`);
  console.log(`  Duplicate groups: ${fmt(dupGroups.length)}`);
  console.log(`  Constructs to remove: ${fmt(totalDupConstructs)}`);

  if (dupGroups.length === 0) {
    console.log('\n  No duplicates found!');
    return;
  }

  // ─── Step 3: 삭제 대상 ID 수집 (각 그룹에서 최소 ID만 유지) ───
  console.log('\n[3/4] Collecting IDs to remove (keeping lowest ID per group)...');
  const idsToRemove: number[] = [];

  for (const [, ids] of dupGroups) {
    ids.sort((a, b) => a - b);
    // 첫 번째(가장 오래된)는 유지, 나머지 삭제
    for (let i = 1; i < ids.length; i++) {
      idsToRemove.push(ids[i]);
    }
  }

  console.log(`  IDs to remove: ${fmt(idsToRemove.length)}`);

  // ─── 삭제 전 영향 범위 확인 ───
  console.log('\n  Estimating cascade impact...');
  // 샘플 1000개로 영향 추정
  const sampleIds = idsToRemove.slice(0, Math.min(1000, idsToRemove.length));
  const childTables = [
    'kbsi_structure', 'kbsi_expression', 'kbsi_crystallization',
    'kbsi_diffraction', 'kbsi_purification', 'kbsi_characterization',
    'kbsi_mutation', 'kbsi_embedding',
  ];

  const impactEstimate: Record<string, number> = {};
  for (const table of childTables) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in('construct_id', sampleIds);
    const estimated = Math.round((count || 0) / sampleIds.length * idsToRemove.length);
    impactEstimate[table] = estimated;
    console.log(`  ${table.replace('kbsi_', '').padEnd(22)} ~${fmt(estimated)} records (cascade delete)`);
  }

  // 중복 분포 통계
  const dupCounts = dupGroups.map(([, ids]) => ids.length);
  const maxDups = Math.max(...dupCounts);
  const avgDups = (dupCounts.reduce((a, b) => a + b, 0) / dupCounts.length).toFixed(1);
  console.log(`\n  Duplicate group stats:`);
  console.log(`    Groups with 2 copies: ${fmt(dupCounts.filter(c => c === 2).length)}`);
  console.log(`    Groups with 3+ copies: ${fmt(dupCounts.filter(c => c >= 3).length)}`);
  console.log(`    Max copies: ${maxDups}`);
  console.log(`    Avg copies: ${avgDups}`);

  if (dryRun) {
    console.log('\n═'.repeat(60));
    console.log('  DRY-RUN — No changes made');
    console.log(`  Would delete ${fmt(idsToRemove.length)} duplicate constructs`);
    console.log('  Run without --dry-run to execute');
    console.log('═'.repeat(60));

    // 샘플 출력
    console.log('\n  Sample duplicates (first 10):');
    for (const [key, ids] of dupGroups.slice(0, 10)) {
      const [name] = key.split('::');
      console.log(`    ${name}: keep=${ids[0]}, remove=[${ids.slice(1).join(',')}]`);
    }
    return;
  }

  // ─── Step 4: 자식 테이블 먼저 삭제 → construct 삭제 ───
  // CASCADE가 타임아웃을 유발하므로 자식을 먼저 직접 삭제하여 부하를 분산
  const startTime = Date.now();
  let totalErrors = 0;

  const childTablesOrdered = [
    'kbsi_crystallization',  // 가장 큰 테이블 먼저
    'kbsi_diffraction',
    'kbsi_expression',
    'kbsi_purification',
    'kbsi_characterization',
    'kbsi_mutation',
    'kbsi_structure',
    'kbsi_embedding',
  ];

  for (const table of childTablesOrdered) {
    console.log(`\n  [${table.replace('kbsi_', '')}] Deleting child records...`);
    let childDeleted = 0;
    let childErrors = 0;
    const CHILD_BATCH = 500;

    for (let i = 0; i < idsToRemove.length; i += CHILD_BATCH) {
      const batch = idsToRemove.slice(i, i + CHILD_BATCH);
      const { error } = await supabase
        .from(table)
        .delete()
        .in('construct_id', batch);

      if (error) {
        childErrors++;
        if (childErrors <= 3) console.error(`    batch ${Math.floor(i / CHILD_BATCH) + 1}: ${error.message}`);
      } else {
        childDeleted++;
      }

      if ((i + CHILD_BATCH) % 10000 === 0 || i + CHILD_BATCH >= idsToRemove.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`    ${fmt(Math.min(i + CHILD_BATCH, idsToRemove.length))}/${fmt(idsToRemove.length)} processed | ${elapsed}s`);
      }
    }
    if (childErrors > 0) console.log(`    (${childErrors} batch errors — some may have no rows, OK)`);
  }

  // Now delete constructs (no cascade needed, children already gone)
  console.log(`\n  [construct] Deleting ${fmt(idsToRemove.length)} constructs...`);
  let totalDeleted = 0;

  for (let i = 0; i < idsToRemove.length; i += batchSize) {
    const batch = idsToRemove.slice(i, i + batchSize);
    const { error } = await supabase
      .from('kbsi_construct')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`  Batch ${Math.floor(i / batchSize) + 1}: ERROR — ${error.message}`);
      totalErrors += batch.length;
    } else {
      totalDeleted += batch.length;
    }

    if ((i + batchSize) % 5000 === 0 || i + batchSize >= idsToRemove.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = totalDeleted > 0 ? (totalDeleted / ((Date.now() - startTime) / 1000)).toFixed(0) : '0';
      console.log(`  ${fmt(Math.min(i + batchSize, idsToRemove.length))}/${fmt(idsToRemove.length)} | deleted: ${fmt(totalDeleted)} | errors: ${totalErrors} | ${elapsed}s (${rate}/s)`);
    }
  }

  // ─── Summary ───
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Deduplication Complete`);
  console.log(`  Deleted: ${fmt(totalDeleted)} constructs (+ cascade children)`);
  console.log(`  Errors: ${fmt(totalErrors)}`);
  console.log(`  Time: ${elapsed}s`);
  console.log(`  Remaining constructs: ~${fmt(constructs.length - totalDeleted)}`);
  console.log('═'.repeat(60));
}

main().catch(console.error);
