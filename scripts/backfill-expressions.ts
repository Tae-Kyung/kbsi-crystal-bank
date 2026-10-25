/**
 * Expression 데이터 소급 생성
 * construct.expression_system이 있지만 kbsi_expression 레코드가 없는 것을 채움
 *
 * npx tsx scripts/backfill-expressions.ts [옵션]
 *   --limit 50000
 *   --dry-run
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

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '999999');
  const dryRun = args.includes('--dry-run');

  await client.connect();
  try {
    console.log('Expression 데이터 소급 생성');

    // expression_system이 있는 construct 조회
    const { rows: constructs } = await client.query(
      `SELECT id, expression_system, name FROM kbsi_construct
       WHERE expression_system IS NOT NULL
       LIMIT $1`,
      [limit]
    );
    console.log(`expression_system 있는 construct: ${constructs.length}건`);

    // 이미 expression이 있는 construct_id 조회
    const { rows: existingData } = await client.query(
      `SELECT DISTINCT construct_id FROM kbsi_expression`
    );
    const existingIds = new Set<number>(existingData.map((r: any) => r.construct_id));
    console.log(`이미 expression 있음: ${existingIds.size}건`);

    const needsInsert = constructs.filter((c: any) => !existingIds.has(c.id));
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

      // Build multi-row INSERT
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIdx = 1;
      for (const c of batch) {
        placeholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3})`);
        values.push(c.id, c.expression_system, 'database', 'PDB');
        paramIdx += 4;
      }

      try {
        const { rowCount } = await client.query(
          `INSERT INTO kbsi_expression (construct_id, host, source_type, source_db)
           VALUES ${placeholders.join(', ')}`,
          values
        );
        totalInserted += rowCount || 0;
      } catch (err: any) {
        console.log(`  batch ${i}: WARNING ${err.message}`);
        totalFailed += batch.length;
      }

      if ((i + 500) % 10000 === 0 || i + 500 >= needsInsert.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`  ${Math.min(i + 500, needsInsert.length).toLocaleString()}/${needsInsert.length.toLocaleString()} | 성공: ${totalInserted.toLocaleString()} | ${elapsed}s`);
      }
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`완료: ${totalInserted.toLocaleString()}건 생성, ${totalFailed.toLocaleString()}건 실패`);
    console.log('═'.repeat(50));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
