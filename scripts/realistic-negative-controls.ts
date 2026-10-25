/**
 * 현실적 Negative Control 합성
 * 기존 극단 전략(pH 3~4, 10~11)에 더해 경계 영역의 미묘한 변형 추가
 *
 * npx tsx scripts/realistic-negative-controls.ts [옵션]
 *   --limit 50000     성공 레코드 수 제한
 *   --dry-run          미리보기
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

function rand(min: number, max: number) {
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

// 미묘한 변형 전략 (경계 영역)
const REALISTIC_STRATEGIES = [
  {
    name: 'ph_shift_down_1',
    apply: (r: any) => ({ ...baseFields(r), ph: Math.round((r.ph - rand(1.0, 2.0)) * 10) / 10, outcome: 'precipitate', notes: `RC: pH-1~2 (src ${r.id})` }),
    requires: (r: any) => r.ph != null && r.ph > 5,
  },
  {
    name: 'ph_shift_up_1',
    apply: (r: any) => ({ ...baseFields(r), ph: Math.round((r.ph + rand(1.0, 2.0)) * 10) / 10, outcome: 'clear', notes: `RC: pH+1~2 (src ${r.id})` }),
    requires: (r: any) => r.ph != null && r.ph < 9,
  },
  {
    name: 'temp_shift_high',
    apply: (r: any) => ({ ...baseFields(r), temperature: Math.round(r.temperature + rand(8, 15)), outcome: 'precipitate', notes: `RC: temp+8~15 (src ${r.id})` }),
    requires: (r: any) => r.temperature != null && r.temperature < 30,
  },
  {
    name: 'temp_shift_low',
    apply: (r: any) => ({ ...baseFields(r), temperature: Math.round(r.temperature - rand(10, 15)), outcome: 'clear', notes: `RC: temp-10~15 (src ${r.id})` }),
    requires: (r: any) => r.temperature != null && r.temperature > 10,
  },
  {
    name: 'ph_and_temp_shift',
    apply: (r: any) => ({
      ...baseFields(r),
      ph: Math.round((r.ph + (Math.random() > 0.5 ? 1 : -1) * rand(1.5, 2.5)) * 10) / 10,
      temperature: Math.round(r.temperature + (Math.random() > 0.5 ? 1 : -1) * rand(8, 12)),
      outcome: 'precipitate',
      notes: `RC: pH+temp shift (src ${r.id})`,
    }),
    requires: (r: any) => r.ph != null && r.temperature != null && r.ph > 4 && r.ph < 10,
  },
  {
    name: 'microcrystal_zone',
    apply: (r: any) => ({
      ...baseFields(r),
      ph: Math.round((r.ph + (Math.random() > 0.5 ? 0.3 : -0.3)) * 10) / 10,
      temperature: Math.round(r.temperature + (Math.random() > 0.5 ? 2 : -2)),
      outcome: 'microcrystal',
      notes: `RC: near-success microcrystal (src ${r.id})`,
    }),
    requires: (r: any) => r.ph != null && r.temperature != null,
  },
  {
    name: 'phase_separation',
    apply: (r: any) => ({
      ...baseFields(r),
      ph: Math.round((r.ph + rand(0.5, 1.5)) * 10) / 10,
      outcome: 'phase_separation',
      notes: `RC: phase separation (src ${r.id})`,
    }),
    requires: (r: any) => r.ph != null && r.ph < 8.5,
  },
];

async function insertBatch(records: any[]) {
  if (records.length === 0) return 0;

  // Build dynamic multi-row insert
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
  const maxSource = parseInt(args[args.indexOf('--limit') + 1] || '50000');
  const dryRun = args.includes('--dry-run');

  await client.connect();
  try {
    console.log('현실적 Negative Control 합성 (경계 영역)');

    // 성공 레코드 조회 (pH + temperature 있는 것)
    const { rows: successes } = await client.query(
      `SELECT id, construct_id, precipitant_type, precipitant_conc, precipitant_unit,
              buffer_type, ph, temperature, salt_type, salt_conc, protein_concentration, additive
       FROM kbsi_crystallization
       WHERE (outcome = 'diffraction_quality' OR outcome = 'single_crystal')
         AND ph IS NOT NULL AND temperature IS NOT NULL
       LIMIT $1`,
      [maxSource]
    );
    console.log(`성공 레코드 (pH+temp): ${successes.length}건\n`);

    for (const s of REALISTIC_STRATEGIES) {
      console.log(`  ${s.name.padEnd(22)} ${successes.filter((r: any) => s.requires(r)).length}건 적용 가능`);
    }

    if (dryRun) { console.log('\n=== DRY-RUN ==='); return; }

    let totalInserted = 0;
    const startTime = Date.now();

    for (const strategy of REALISTIC_STRATEGIES) {
      const applicable = successes.filter((r: any) => strategy.requires(r));
      if (applicable.length === 0) continue;
      console.log(`\n[${strategy.name}] ${applicable.length}건...`);

      for (let i = 0; i < applicable.length; i += 500) {
        const batch = applicable.slice(i, i + 500);
        const inserts = batch.map((r: any) => strategy.apply(r));

        const inserted = await insertBatch(inserts);
        totalInserted += inserted;

        if ((i + 500) % 5000 === 0 || i + 500 >= applicable.length) {
          console.log(`  ${Math.min(i + 500, applicable.length)}/${applicable.length} | 누적: ${totalInserted.toLocaleString()}`);
        }
      }
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`완료: ${totalInserted.toLocaleString()}건 (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
