/**
 * 현실적 Negative Control 합성
 * 기존 극단 전략(pH 3~4, 10~11)에 더해 경계 영역의 미묘한 변형 추가
 *
 * npx tsx scripts/realistic-negative-controls.ts [옵션]
 *   --limit 50000     성공 레코드 수 제한
 *   --dry-run          미리보기
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

async function main() {
  const args = process.argv.slice(2);
  const maxSource = parseInt(args[args.indexOf('--limit') + 1] || '50000');
  const dryRun = args.includes('--dry-run');

  console.log('현실적 Negative Control 합성 (경계 영역)');

  // 성공 레코드 조회 (pH + temperature 있는 것)
  let successes: any[] = [];
  let offset = 0;
  while (successes.length < maxSource) {
    const { data } = await supabase
      .from('kbsi_crystallization')
      .select('id, construct_id, precipitant_type, precipitant_conc, precipitant_unit, buffer_type, ph, temperature, salt_type, salt_conc, protein_concentration, additive')
      .or('outcome.eq.diffraction_quality,outcome.eq.single_crystal')
      .not('ph', 'is', null)
      .not('temperature', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    successes = successes.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  successes = successes.slice(0, maxSource);
  console.log(`성공 레코드 (pH+temp): ${successes.length}건\n`);

  for (const s of REALISTIC_STRATEGIES) {
    console.log(`  ${s.name.padEnd(22)} ${successes.filter(r => s.requires(r)).length}건 적용 가능`);
  }

  if (dryRun) { console.log('\n=== DRY-RUN ==='); return; }

  let totalInserted = 0;
  const startTime = Date.now();

  for (const strategy of REALISTIC_STRATEGIES) {
    const applicable = successes.filter(r => strategy.requires(r));
    if (applicable.length === 0) continue;
    console.log(`\n[${strategy.name}] ${applicable.length}건...`);

    for (let i = 0; i < applicable.length; i += 500) {
      const batch = applicable.slice(i, i + 500);
      const inserts = batch.map(r => {
        const nc = strategy.apply(r);
        const cleaned: any = {};
        for (const [k, v] of Object.entries(nc)) {
          if (v != null && v !== 'null') cleaned[k] = v;
        }
        return cleaned;
      });

      const { data: inserted } = await supabase.from('kbsi_crystallization').insert(inserts).select('id');
      totalInserted += (inserted || []).length;

      if ((i + 500) % 5000 === 0 || i + 500 >= applicable.length) {
        console.log(`  ${Math.min(i + 500, applicable.length)}/${applicable.length} | 누적: ${totalInserted.toLocaleString()}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료: ${totalInserted.toLocaleString()}건 (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
}

main().catch(console.error);
