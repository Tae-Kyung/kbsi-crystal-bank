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

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

function fmt(n: number) { return n.toLocaleString(); }

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchSize = parseInt(args[args.indexOf('--batch-size') + 1] || '500');

  await client.connect();
  try {
    console.log('═'.repeat(60));
    console.log('  Construct Deduplication');
    console.log(`  Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
    console.log(`  Batch size: ${batchSize}`);
    console.log('═'.repeat(60));

    // ─── Step 1: 전체 construct 로드 ───
    console.log('\n[1/4] Loading all constructs...');
    const { rows: constructs } = await client.query(
      `SELECT id, name, protein_id FROM kbsi_construct ORDER BY id`
    );
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
      // Build ANY array for pg
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int as cnt FROM ${table} WHERE construct_id = ANY($1)`,
        [sampleIds]
      );
      const count = countRows[0].cnt;
      const estimated = Math.round(count / sampleIds.length * idsToRemove.length);
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
        try {
          await client.query(
            `DELETE FROM ${table} WHERE construct_id = ANY($1)`,
            [batch]
          );
          childDeleted++;
        } catch (err: any) {
          childErrors++;
          if (childErrors <= 3) console.error(`    batch ${Math.floor(i / CHILD_BATCH) + 1}: ${err.message}`);
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
      try {
        const { rowCount } = await client.query(
          `DELETE FROM kbsi_construct WHERE id = ANY($1)`,
          [batch]
        );
        totalDeleted += rowCount || 0;
      } catch (err: any) {
        console.error(`  Batch ${Math.floor(i / batchSize) + 1}: ERROR — ${err.message}`);
        totalErrors += batch.length;
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
  } finally {
    await client.end();
  }
}

main().catch(console.error);
