/**
 * Dedup constructs via RPC (DB 내부 실행, timeout 회피)
 * dedup_constructs(batch_limit) RPC를 반복 호출하여 전체 중복 제거
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
  const batchLimit = parseInt(process.argv[2] || '1000');

  await client.connect();
  try {
    console.log('═'.repeat(60));
    console.log('  Dedup Constructs via RPC');
    console.log(`  Batch: ${batchLimit}`);
    console.log('═'.repeat(60));

    // 전체 중복 수 확인
    const { rows: countRows } = await client.query(
      `SELECT count_duplicate_constructs() as cnt`
    );
    const totalDups = countRows[0]?.cnt ?? 0;
    console.log(`\n  Total duplicates: ${fmt(totalDups)}`);

    if (totalDups === 0) {
      console.log('  No duplicates found!');
      return;
    }

    const startTime = Date.now();
    let totalConstructs = 0;
    let totalCryst = 0;
    let totalDiff = 0;
    let totalExpr = 0;
    let totalStruct = 0;
    let totalOther = 0;
    let round = 0;

    while (true) {
      round++;
      try {
        const { rows } = await client.query(
          `SELECT * FROM dedup_constructs($1)`,
          [batchLimit]
        );

        const row = rows[0];
        if (!row || row.deleted_constructs === 0) {
          console.log(`\n  Round ${round}: No more duplicates.`);
          break;
        }

        totalConstructs += Number(row.deleted_constructs);
        totalCryst += Number(row.deleted_crystallization);
        totalDiff += Number(row.deleted_diffraction);
        totalExpr += Number(row.deleted_expression);
        totalStruct += Number(row.deleted_structure);
        totalOther += Number(row.deleted_purification) + Number(row.deleted_characterization) +
                      Number(row.deleted_mutation) + Number(row.deleted_embedding);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const pct = ((totalConstructs / totalDups) * 100).toFixed(1);
        console.log(
          `  Round ${round}: -${fmt(Number(row.deleted_constructs))} constructs, ` +
          `-${fmt(Number(row.deleted_crystallization))} cryst, ` +
          `-${fmt(Number(row.deleted_diffraction))} diff, ` +
          `-${fmt(Number(row.deleted_expression))} expr | ` +
          `Total: ${fmt(totalConstructs)}/${fmt(totalDups)} (${pct}%) | ${elapsed}s`
        );
      } catch (err: any) {
        console.error(`  Round ${round}: ERROR — ${err.message}`);
        // Wait and retry
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  Deduplication Complete');
    console.log(`  Constructs:       -${fmt(totalConstructs)}`);
    console.log(`  Crystallization:  -${fmt(totalCryst)}`);
    console.log(`  Diffraction:      -${fmt(totalDiff)}`);
    console.log(`  Expression:       -${fmt(totalExpr)}`);
    console.log(`  Structure:        -${fmt(totalStruct)}`);
    console.log(`  Other:            -${fmt(totalOther)}`);
    console.log(`  Time:             ${elapsed}s`);
    console.log('═'.repeat(60));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
