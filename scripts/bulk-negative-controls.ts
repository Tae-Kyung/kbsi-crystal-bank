/**
 * Negative Control 대규모 합성
 * 성공 결정화 조건(precipitant_type 있는 것)에서 7가지 전략으로 실패 조건 생성
 *
 * npx tsx scripts/bulk-negative-controls.ts [옵션]
 *   --limit 50000     처리할 성공 레코드 수 (기본: 전량)
 *   --strategies all   전략 선택 (기본: 전체)
 *   --dry-run          미리보기
 *   --ratio 1          성공 1건당 생성할 실패 건수 (기본: 전략 수만큼)
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

function randomBetween(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

function baseFields(r: any) {
  return {
    construct_id: r.construct_id,
    source_type: 'synthetic',
    source_db: 'synthetic',
    precipitant_type: r.precipitant_type,
    precipitant_conc: r.precipitant_conc,
    precipitant_unit: r.precipitant_unit,
    buffer_type: r.buffer_type,
    ph: r.ph,
    temperature: r.temperature,
    salt_type: r.salt_type,
    salt_conc: r.salt_conc,
    protein_concentration: r.protein_concentration,
    additive: r.additive,
  };
}

const STRATEGIES = [
  {
    name: 'extreme_ph_low',
    apply: (r: any) => ({ ...baseFields(r), ph: randomBetween(3.0, 4.0), outcome: 'precipitate', notes: `NC: extreme low pH (src ${r.id})` }),
    requires: (r: any) => r.ph != null && r.ph > 5,
  },
  {
    name: 'extreme_ph_high',
    apply: (r: any) => ({ ...baseFields(r), ph: randomBetween(10.0, 11.0), outcome: 'precipitate', notes: `NC: extreme high pH (src ${r.id})` }),
    requires: (r: any) => r.ph != null && r.ph < 9,
  },
  {
    name: 'no_precipitant',
    apply: (r: any) => ({ ...baseFields(r), precipitant_conc: 0, outcome: 'clear', notes: `NC: no precipitant (src ${r.id})` }),
    requires: (r: any) => r.precipitant_conc != null && r.precipitant_conc > 0,
  },
  {
    name: 'excess_precipitant',
    apply: (r: any) => ({ ...baseFields(r), precipitant_conc: Math.round(r.precipitant_conc * 2.5 * 10) / 10, outcome: 'precipitate', notes: `NC: excess 2.5x (src ${r.id})` }),
    requires: (r: any) => r.precipitant_conc != null && r.precipitant_conc > 0,
  },
  {
    name: 'low_precipitant',
    apply: (r: any) => ({ ...baseFields(r), precipitant_conc: Math.round(r.precipitant_conc * 0.2 * 10) / 10, outcome: 'clear', notes: `NC: low 0.2x (src ${r.id})` }),
    requires: (r: any) => r.precipitant_conc != null && r.precipitant_conc > 0,
  },
  {
    name: 'high_temp',
    apply: (r: any) => ({ ...baseFields(r), temperature: 37, outcome: 'precipitate', notes: `NC: high temp (src ${r.id})` }),
    requires: (r: any) => r.temperature != null && r.temperature < 30,
  },
  {
    name: 'high_salt',
    apply: (r: any) => ({ ...baseFields(r), salt_conc: Math.round(r.salt_conc * 5), outcome: 'precipitate', notes: `NC: excess salt 5x (src ${r.id})` }),
    requires: (r: any) => r.salt_conc != null && r.salt_conc > 0,
  },
];

async function insertBatch(records: any[]) {
  if (records.length === 0) return 0;

  const allCols = ['construct_id', 'source_type', 'source_db', 'precipitant_type', 'precipitant_conc',
    'precipitant_unit', 'buffer_type', 'ph', 'temperature', 'salt_type', 'salt_conc',
    'protein_concentration', 'additive', 'outcome', 'notes'];

  const values: any[] = [];
  const rowPlaceholders: string[] = [];
  let paramIdx = 1;

  for (const rec of records) {
    const cleaned: any = {};
    for (const [k, v] of Object.entries(rec)) {
      if (v != null && v !== 'null') cleaned[k] = v;
    }
    const rowVals: string[] = [];
    for (const col of allCols) {
      rowVals.push(`$${paramIdx}`);
      values.push(cleaned[col] ?? null);
      paramIdx++;
    }
    rowPlaceholders.push(`(${rowVals.join(', ')})`);
  }

  const { rowCount } = await client.query(
    `INSERT INTO kbsi_crystallization (${allCols.join(', ')})
     VALUES ${rowPlaceholders.join(', ')}`,
    values
  );
  return rowCount || 0;
}

async function main() {
  const args = process.argv.slice(2);
  const maxSource = parseInt(args[args.indexOf('--limit') + 1] || '999999');
  const dryRun = args.includes('--dry-run');

  await client.connect();
  try {
    console.log('Negative Control 대규모 합성');
    console.log(`dry-run: ${dryRun}\n`);

    // 기존 synthetic 수
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int as cnt FROM kbsi_crystallization WHERE source_type = $1`,
      ['synthetic']
    );
    console.log(`기존 synthetic: ${countRows[0].cnt}건`);

    // 성공 레코드 (precipitant_type 있는 것)
    console.log('성공 레코드 조회 중...');
    const { rows: successes } = await client.query(
      `SELECT id, construct_id, precipitant_type, precipitant_conc, precipitant_unit,
              buffer_type, ph, temperature, salt_type, salt_conc, protein_concentration, additive
       FROM kbsi_crystallization
       WHERE (outcome = 'diffraction_quality' OR outcome = 'single_crystal')
         AND ph IS NOT NULL
       LIMIT $1`,
      [maxSource]
    );
    console.log(`성공 레코드: ${successes.length}건\n`);

    // 전략별 적용 가능 건수 미리 계산
    const strategyCounts: Record<string, number> = {};
    for (const s of STRATEGIES) {
      strategyCounts[s.name] = successes.filter((r: any) => s.requires(r)).length;
      console.log(`  ${s.name.padEnd(22)} ${strategyCounts[s.name]}건 적용 가능`);
    }
    const totalPossible = Object.values(strategyCounts).reduce((a, b) => a + b, 0);
    console.log(`\n총 생성 예정: ${totalPossible.toLocaleString()}건\n`);

    if (dryRun) {
      console.log('=== DRY-RUN 완료 ===');
      return;
    }

    // 배치 생성 + 삽입
    let totalInserted = 0;
    const BATCH_SIZE = 500;
    const startTime = Date.now();

    for (const strategy of STRATEGIES) {
      const applicable = successes.filter((r: any) => strategy.requires(r));
      if (applicable.length === 0) continue;

      console.log(`[${strategy.name}] ${applicable.length}건 처리 중...`);

      for (let i = 0; i < applicable.length; i += BATCH_SIZE) {
        const batch = applicable.slice(i, i + BATCH_SIZE);
        const inserts = batch.map((r: any) => strategy.apply(r));

        try {
          const inserted = await insertBatch(inserts);
          totalInserted += inserted;
        } catch (err: any) {
          console.log(`  WARNING batch ${i}: ${err.message}`);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= applicable.length) {
          console.log(`  ${strategy.name}: ${Math.min(i + BATCH_SIZE, applicable.length)}/${applicable.length} | 누적: ${totalInserted.toLocaleString()} | ${elapsed}s`);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`완료: ${totalInserted.toLocaleString()}건 Negative Control 생성`);
    console.log(`소요: ${elapsed}s`);
    console.log('═'.repeat(50));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
