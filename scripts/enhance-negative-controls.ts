/**
 * Enhanced Negative Control System (Phase D-3)
 *
 * Part A: Family-based resampling
 *   - Derive protein families from full_name_normalized
 *   - Generate NCs proportional to each family's success rate
 *   - Varied strategies: wrong precipitant, concentration shifts, protein conc shifts
 *
 * Part B: null_outcome cleanup
 *   - Classify records with outcome IS NULL based on source_type and diffraction data
 *
 * npx tsx scripts/enhance-negative-controls.ts                        # both parts
 * npx tsx scripts/enhance-negative-controls.ts --part A               # family resampling only
 * npx tsx scripts/enhance-negative-controls.ts --part B               # null cleanup only
 * npx tsx scripts/enhance-negative-controls.ts --dry-run              # preview only
 * npx tsx scripts/enhance-negative-controls.ts --part A --limit 10000 # limit source records
 * npx tsx scripts/enhance-negative-controls.ts --part A --target-per-family 500  # min NCs per family
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function getArg(name: string, fallback: string): string {
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return fallback;
}

const partArg = getArg('part', 'both').toUpperCase();
const runPartA = partArg === 'BOTH' || partArg === 'A';
const runPartB = partArg === 'BOTH' || partArg === 'B';
const sourceLimit = parseInt(getArg('limit', '999999'));
const targetPerFamily = parseInt(getArg('target-per-family', '500'));

const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;

// =========================================================
// Protein Family Classification
// =========================================================

/** Derive protein family from full_name or full_name_normalized */
function classifyProteinFamily(name: string | null): string {
  if (!name) return 'unknown';
  const n = name.toLowerCase();

  // Enzymes
  if (n.includes('kinase')) return 'kinase';
  if (n.includes('protease') || n.includes('peptidase') || n.includes('caspase')) return 'protease';
  if (n.includes('polymerase')) return 'polymerase';
  if (n.includes('transferase') && !n.includes('kinase')) return 'transferase';
  if (n.includes('synthase') || n.includes('synthetase')) return 'synthase';
  if (n.includes('oxidase') || n.includes('oxygenase')) return 'oxidase';
  if (n.includes('reductase')) return 'reductase';
  if (n.includes('dehydrogenase')) return 'dehydrogenase';
  if (n.includes('ligase')) return 'ligase';
  if (n.includes('hydrolase') || n.includes('esterase') || n.includes('lipase')) return 'hydrolase';
  if (n.includes('isomerase') || n.includes('mutase') || n.includes('racemase')) return 'isomerase';
  if (n.includes('phosphatase')) return 'phosphatase';
  if (n.includes('nuclease') || n.includes('dnase') || n.includes('rnase') || n.includes('endonuclease') || n.includes('exonuclease')) return 'nuclease';
  if (n.includes('helicase')) return 'helicase';
  if (n.includes('topoisomerase') || n.includes('gyrase')) return 'topoisomerase';
  if (n.includes('lyase') || n.includes('decarboxylase') || n.includes('aldolase')) return 'lyase';

  // Structural / Binding
  if (n.includes('ribosom')) return 'ribosomal';
  if (n.includes('chaperone') || n.includes('hsp') || n.includes('groel') || n.includes('groes')) return 'chaperone';
  if (n.includes('antibod') || n.includes('immunoglobulin') || n.includes('fab') || n.includes('nanobody')) return 'antibody';
  if (n.includes('receptor')) return 'receptor';
  if (n.includes('channel') || n.includes('transporter') || n.includes('porin')) return 'transporter';
  if (n.includes('transcription factor') || n.includes('repressor') || n.includes('activator')) return 'transcription_factor';
  if (n.includes('globin') || n.includes('hemoglobin') || n.includes('myoglobin')) return 'globin';
  if (n.includes('cytochrome')) return 'cytochrome';
  if (n.includes('toxin') || n.includes('lectin')) return 'toxin_lectin';
  if (n.includes('lysozyme')) return 'lysozyme';

  return 'other';
}

// =========================================================
// Precipitant Family Profiles (typical ranges per protein family)
// =========================================================

interface FamilyProfile {
  typicalPrecipitants: string[];
  typicalPhRange: [number, number];
  typicalTempRange: [number, number];
  typicalProteinConc: [number, number]; // mg/mL
}

// Wrong precipitant candidates per family
const WRONG_PRECIPITANTS: Record<string, string[]> = {
  'kinase': ['Ammonium sulfate', 'Sodium chloride', 'MPD'],
  'protease': ['PEG 20000', 'Isopropanol', 'Sodium citrate'],
  'polymerase': ['MPD', 'Ethanol', 'Ammonium sulfate'],
  'transferase': ['PEG 20000', 'Sodium chloride', 'Isopropanol'],
  'synthase': ['MPD', 'PEG 20000', 'Ethanol'],
  'oxidase': ['PEG 20000', 'Sodium chloride', 'MPD'],
  'reductase': ['Ammonium sulfate', 'Isopropanol', 'PEG 20000'],
  'dehydrogenase': ['MPD', 'Sodium chloride', 'Ethanol'],
  'hydrolase': ['PEG 20000', 'Isopropanol', 'Ammonium sulfate'],
  'phosphatase': ['Sodium chloride', 'MPD', 'PEG 20000'],
  'nuclease': ['MPD', 'Ammonium sulfate', 'Isopropanol'],
  'receptor': ['Ammonium sulfate', 'Ethanol', 'MPD'],
  'antibody': ['MPD', 'Sodium chloride', 'Ethanol'],
  'chaperone': ['PEG 20000', 'Isopropanol', 'Ethanol'],
  'transporter': ['Ammonium sulfate', 'MPD', 'Sodium chloride'],
  'lysozyme': ['PEG 20000', 'Isopropanol', 'Ethanol'],
};

const DEFAULT_WRONG_PRECIPITANTS = ['PEG 20000', 'MPD', 'Ammonium sulfate', 'Sodium chloride', 'Isopropanol'];

// =========================================================
// Utility
// =========================================================

function rand(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function baseFields(r: any) {
  return {
    construct_id: r.construct_id,
    source_type: 'synthetic' as const,
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

function cleanRecord(rec: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v != null && v !== 'null') cleaned[k] = v;
  }
  return cleaned;
}

// =========================================================
// Family-aware NC strategies
// =========================================================

type NCStrategy = {
  name: string;
  apply: (r: any, family: string) => Record<string, any>;
  requires: (r: any) => boolean;
};

const FAMILY_STRATEGIES: NCStrategy[] = [
  {
    name: 'wrong_precipitant',
    apply: (r, family) => {
      const wrongList = WRONG_PRECIPITANTS[family] || DEFAULT_WRONG_PRECIPITANTS;
      // Pick a precipitant different from the source
      let wrongPrecip = pick(wrongList);
      if (wrongPrecip === r.precipitant_type && wrongList.length > 1) {
        wrongPrecip = wrongList.find(p => p !== r.precipitant_type) || wrongPrecip;
      }
      return {
        ...baseFields(r),
        precipitant_type: wrongPrecip,
        precipitant_conc: r.precipitant_conc ? rand(r.precipitant_conc * 0.5, r.precipitant_conc * 1.5) : null,
        outcome: 'precipitate',
        notes: `NC-D3: wrong precipitant for ${family} (src ${r.id})`,
      };
    },
    requires: (r) => r.precipitant_type != null,
  },
  {
    name: 'conc_outside_range',
    apply: (r, family) => {
      // Very low or very high concentration (outside typical 0.3x-3x)
      const direction = Math.random() > 0.5 ? 'low' : 'high';
      const factor = direction === 'low' ? rand(0.05, 0.15) : rand(3.5, 6.0);
      const outcome = direction === 'low' ? 'clear' : 'precipitate';
      return {
        ...baseFields(r),
        precipitant_conc: r.precipitant_conc ? Math.round(r.precipitant_conc * factor * 10) / 10 : null,
        outcome,
        notes: `NC-D3: ${direction} conc ${factor.toFixed(1)}x for ${family} (src ${r.id})`,
      };
    },
    requires: (r) => r.precipitant_conc != null && r.precipitant_conc > 0,
  },
  {
    name: 'suboptimal_protein_conc',
    apply: (r, family) => {
      // Too dilute or too concentrated protein
      const direction = Math.random() > 0.5 ? 'dilute' : 'concentrated';
      let newConc: number;
      if (direction === 'dilute') {
        newConc = rand(0.1, 1.0); // very dilute mg/mL
      } else {
        newConc = r.protein_concentration ? rand(r.protein_concentration * 5, r.protein_concentration * 10) : rand(80, 150);
      }
      return {
        ...baseFields(r),
        protein_concentration: Math.round(newConc * 10) / 10,
        outcome: direction === 'dilute' ? 'clear' : 'precipitate',
        notes: `NC-D3: ${direction} protein for ${family} (src ${r.id})`,
      };
    },
    requires: (r) => true, // always applicable
  },
  {
    name: 'ph_family_mismatch',
    apply: (r, family) => {
      // Push pH far outside the family's typical range
      const shift = rand(2.5, 4.0) * (Math.random() > 0.5 ? 1 : -1);
      let newPh = Math.round((r.ph + shift) * 10) / 10;
      newPh = Math.max(2.0, Math.min(12.0, newPh));
      return {
        ...baseFields(r),
        ph: newPh,
        outcome: Math.abs(shift) > 3 ? 'precipitate' : 'phase_separation',
        notes: `NC-D3: pH mismatch for ${family} (src ${r.id})`,
      };
    },
    requires: (r) => r.ph != null,
  },
  {
    name: 'combined_suboptimal',
    apply: (r, family) => {
      // Multiple simultaneous suboptimal conditions
      const phShift = rand(1.0, 2.0) * (Math.random() > 0.5 ? 1 : -1);
      const tempShift = rand(5, 12) * (Math.random() > 0.5 ? 1 : -1);
      const concFactor = Math.random() > 0.5 ? rand(0.1, 0.3) : rand(2.5, 4.0);
      return {
        ...baseFields(r),
        ph: r.ph ? Math.max(2.0, Math.min(12.0, Math.round((r.ph + phShift) * 10) / 10)) : r.ph,
        temperature: r.temperature ? Math.max(-5, Math.round(r.temperature + tempShift)) : r.temperature,
        precipitant_conc: r.precipitant_conc ? Math.round(r.precipitant_conc * concFactor * 10) / 10 : r.precipitant_conc,
        outcome: 'precipitate',
        notes: `NC-D3: combined suboptimal for ${family} (src ${r.id})`,
      };
    },
    requires: (r) => r.ph != null || r.temperature != null,
  },
];

// =========================================================
// Part A: Family-based Resampling
// =========================================================

async function partA_familyResampling() {
  console.log('\n' + '='.repeat(60));
  console.log('Part A: Family-based Negative Control Resampling');
  console.log('='.repeat(60));

  // 1. Get current NC distribution stats
  const { count: totalCryst } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true });

  const { count: totalSynthetic } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'synthetic');

  console.log(`\n현재 상태:`);
  console.log(`  전체 결정화: ${(totalCryst || 0).toLocaleString()}`);
  console.log(`  기존 synthetic NC: ${(totalSynthetic || 0).toLocaleString()}`);

  // 2. Fetch successful crystallizations with construct/protein info
  console.log(`\n성공 레코드 조회 중 (limit=${sourceLimit})...`);
  let successes: any[] = [];
  let offset = 0;
  while (successes.length < sourceLimit) {
    const { data } = await supabase
      .from('kbsi_crystallization')
      .select(`
        id, construct_id, precipitant_type, precipitant_conc, precipitant_unit,
        buffer_type, ph, temperature, salt_type, salt_conc,
        protein_concentration, additive
      `)
      .or('outcome.eq.diffraction_quality,outcome.eq.single_crystal')
      .neq('source_type', 'synthetic')
      .range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    successes = successes.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  successes = successes.slice(0, sourceLimit);
  console.log(`  성공 레코드 (non-synthetic): ${successes.length.toLocaleString()}`);

  // 3. Map construct_id -> protein_id -> protein name
  const constructIds = [...new Set(successes.map(r => r.construct_id))].filter(Boolean);
  console.log(`  고유 construct: ${constructIds.length.toLocaleString()}`);

  const constructProteinMap: Record<number, number> = {};
  for (let i = 0; i < constructIds.length; i += BATCH_SIZE) {
    const batch = constructIds.slice(i, i + BATCH_SIZE);
    const { data: constructs } = await supabase
      .from('kbsi_construct')
      .select('id, protein_id')
      .in('id', batch);
    for (const c of constructs || []) {
      constructProteinMap[c.id] = c.protein_id;
    }
  }

  const proteinIds = [...new Set(Object.values(constructProteinMap))].filter(Boolean);
  const proteinNameMap: Record<number, string> = {};
  for (let i = 0; i < proteinIds.length; i += BATCH_SIZE) {
    const batch = proteinIds.slice(i, i + BATCH_SIZE);
    const { data: proteins } = await supabase
      .from('kbsi_protein')
      .select('id, full_name, full_name_normalized')
      .in('id', batch);
    for (const p of proteins || []) {
      proteinNameMap[p.id] = p.full_name_normalized || p.full_name || '';
    }
  }
  console.log(`  고유 protein: ${proteinIds.length.toLocaleString()}`);

  // 4. Classify each success record by family
  const familyRecords: Record<string, any[]> = {};
  for (const r of successes) {
    const proteinId = constructProteinMap[r.construct_id];
    const proteinName = proteinId ? proteinNameMap[proteinId] : null;
    const family = classifyProteinFamily(proteinName);
    if (!familyRecords[family]) familyRecords[family] = [];
    familyRecords[family].push(r);
  }

  // 5. Calculate per-family NC targets
  const families = Object.keys(familyRecords).sort((a, b) => familyRecords[b].length - familyRecords[a].length);
  const totalSuccesses = successes.length;

  console.log(`\n단백질 Family 분포 (성공 결정화 기준):`);
  console.log(`${'Family'.padEnd(24)} ${'Count'.padStart(8)} ${'%'.padStart(7)} ${'NC Target'.padStart(10)}`);
  console.log('-'.repeat(52));

  const familyTargets: Record<string, number> = {};
  let totalTarget = 0;

  for (const family of families) {
    const count = familyRecords[family].length;
    const pct = (count / totalSuccesses * 100).toFixed(1);
    // Proportional target: at least targetPerFamily, scaled by family size
    // Underrepresented families get a boost (minimum guarantee)
    const proportional = Math.round(count * FAMILY_STRATEGIES.length);
    const target = Math.max(targetPerFamily, proportional);
    familyTargets[family] = target;
    totalTarget += target;
    console.log(`  ${family.padEnd(22)} ${count.toLocaleString().padStart(8)} ${(pct + '%').padStart(7)} ${target.toLocaleString().padStart(10)}`);
  }

  console.log('-'.repeat(52));
  console.log(`  ${'TOTAL'.padEnd(22)} ${totalSuccesses.toLocaleString().padStart(8)} ${'100%'.padStart(7)} ${totalTarget.toLocaleString().padStart(10)}`);

  // 6. Strategy applicability preview
  console.log(`\n전략별 적용 가능 건수:`);
  for (const s of FAMILY_STRATEGIES) {
    const applicable = successes.filter(r => s.requires(r)).length;
    console.log(`  ${s.name.padEnd(28)} ${applicable.toLocaleString()} 건`);
  }

  if (dryRun) {
    console.log('\n=== DRY-RUN (Part A) ===');
    return { inserted: 0, families: families.length };
  }

  // 7. Generate and insert NCs family by family
  let totalInserted = 0;
  const startTime = Date.now();

  for (const family of families) {
    const records = familyRecords[family];
    const target = familyTargets[family];
    const perStrategy = Math.ceil(target / FAMILY_STRATEGIES.length);

    console.log(`\n[${family}] ${records.length} source -> ${target} NCs (${perStrategy}/strategy)`);

    for (const strategy of FAMILY_STRATEGIES) {
      const applicable = records.filter(r => strategy.requires(r));
      if (applicable.length === 0) continue;

      // Sample from applicable records to reach perStrategy count
      const sampled: any[] = [];
      for (let i = 0; i < perStrategy; i++) {
        sampled.push(applicable[i % applicable.length]);
      }

      // Insert in batches
      for (let i = 0; i < sampled.length; i += BATCH_SIZE) {
        const batch = sampled.slice(i, i + BATCH_SIZE);
        const inserts = batch.map(r => cleanRecord(strategy.apply(r, family)));

        const { data: inserted, error } = await supabase
          .from('kbsi_crystallization')
          .insert(inserts)
          .select('id');

        if (error) {
          console.log(`  [!] ${strategy.name} batch ${i}: ${error.message}`);
        } else {
          totalInserted += (inserted || []).length;
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`  ${family}: ${totalInserted.toLocaleString()} 누적 | ${elapsed}s`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nPart A 완료: ${totalInserted.toLocaleString()} NCs 생성 (${elapsed}s)`);
  return { inserted: totalInserted, families: families.length };
}

// =========================================================
// Part B: null_outcome Cleanup
// =========================================================

async function partB_nullOutcomeCleanup() {
  console.log('\n' + '='.repeat(60));
  console.log('Part B: null_outcome Cleanup');
  console.log('='.repeat(60));

  // 1. Count null outcome records
  const { count: nullCount } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .is('outcome', null);

  console.log(`\nnull outcome 레코드: ${(nullCount || 0).toLocaleString()}`);

  if (!nullCount || nullCount === 0) {
    console.log('처리할 레코드 없음');
    return { updated: 0 };
  }

  // 2. Fetch all null-outcome records with source_type and construct_id
  let nullRecords: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_crystallization')
      .select('id, construct_id, source_type, source_db, notes')
      .is('outcome', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    nullRecords = nullRecords.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`  조회 완료: ${nullRecords.length.toLocaleString()} 건`);

  // 3. Get construct_ids that have diffraction data
  const constructIds = [...new Set(nullRecords.map(r => r.construct_id))].filter(Boolean);
  const constructsWithDiffraction = new Set<number>();

  for (let i = 0; i < constructIds.length; i += BATCH_SIZE) {
    const batch = constructIds.slice(i, i + BATCH_SIZE);
    const { data: diffractions } = await supabase
      .from('kbsi_diffraction')
      .select('construct_id')
      .in('construct_id', batch);
    for (const d of diffractions || []) {
      constructsWithDiffraction.add(d.construct_id);
    }
  }
  console.log(`  diffraction 보유 construct: ${constructsWithDiffraction.size.toLocaleString()}`);

  // 4. Classify each null-outcome record
  const classifications: Record<string, { ids: number[]; outcome: string }> = {
    synthetic_missing: { ids: [], outcome: 'precipitate' }, // synthetic without outcome is an error; default to precipitate
    database_with_diffraction: { ids: [], outcome: 'diffraction_quality' },
    database_no_crystal: { ids: [], outcome: 'clear' }, // conservative
    literature_with_diffraction: { ids: [], outcome: 'diffraction_quality' },
    literature_no_crystal: { ids: [], outcome: 'clear' },
    experimental_with_diffraction: { ids: [], outcome: 'diffraction_quality' },
    experimental_no_crystal: { ids: [], outcome: 'clear' },
  };

  for (const r of nullRecords) {
    const hasDiffraction = constructsWithDiffraction.has(r.construct_id);
    const st = r.source_type || 'database';

    if (st === 'synthetic') {
      classifications.synthetic_missing.ids.push(r.id);
    } else if (st === 'database') {
      if (hasDiffraction) {
        classifications.database_with_diffraction.ids.push(r.id);
      } else {
        classifications.database_no_crystal.ids.push(r.id);
      }
    } else if (st === 'literature') {
      if (hasDiffraction) {
        classifications.literature_with_diffraction.ids.push(r.id);
      } else {
        classifications.literature_no_crystal.ids.push(r.id);
      }
    } else {
      // experimental
      if (hasDiffraction) {
        classifications.experimental_with_diffraction.ids.push(r.id);
      } else {
        classifications.experimental_no_crystal.ids.push(r.id);
      }
    }
  }

  // 5. Show classification summary
  console.log(`\n분류 결과:`);
  console.log(`${'Category'.padEnd(38)} ${'Count'.padStart(8)} ${'Outcome'.padStart(22)}`);
  console.log('-'.repeat(70));
  let totalToUpdate = 0;
  for (const [cat, info] of Object.entries(classifications)) {
    if (info.ids.length > 0) {
      console.log(`  ${cat.padEnd(36)} ${info.ids.length.toLocaleString().padStart(8)} ${(' -> ' + info.outcome).padStart(22)}`);
      totalToUpdate += info.ids.length;
    }
  }
  console.log('-'.repeat(70));
  console.log(`  ${'TOTAL'.padEnd(36)} ${totalToUpdate.toLocaleString().padStart(8)}`);

  if (dryRun) {
    console.log('\n=== DRY-RUN (Part B) ===');
    return { updated: 0 };
  }

  // 6. Batch update
  let totalUpdated = 0;
  const startTime = Date.now();

  for (const [cat, info] of Object.entries(classifications)) {
    if (info.ids.length === 0) continue;

    console.log(`\n[${cat}] ${info.ids.length.toLocaleString()} -> ${info.outcome}`);

    for (let i = 0; i < info.ids.length; i += BATCH_SIZE) {
      const batch = info.ids.slice(i, i + BATCH_SIZE);
      const { error, count } = await supabase
        .from('kbsi_crystallization')
        .update({ outcome: info.outcome })
        .in('id', batch);

      if (error) {
        console.log(`  [!] batch ${i}: ${error.message}`);
      } else {
        totalUpdated += batch.length;
      }

      if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= info.ids.length) {
        console.log(`  ${Math.min(i + BATCH_SIZE, info.ids.length)}/${info.ids.length} | 누적: ${totalUpdated.toLocaleString()}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nPart B 완료: ${totalUpdated.toLocaleString()} 레코드 업데이트 (${elapsed}s)`);
  return { updated: totalUpdated };
}

// =========================================================
// Main
// =========================================================

async function main() {
  console.log('Enhanced Negative Control System (Phase D-3)');
  console.log(`dry-run: ${dryRun} | part: ${partArg}`);

  const results: Record<string, any> = {};

  if (runPartA) {
    results.partA = await partA_familyResampling();
  }

  if (runPartB) {
    results.partB = await partB_nullOutcomeCleanup();
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));

  if (results.partA) {
    console.log(`  Part A: ${results.partA.inserted.toLocaleString()} family-based NCs across ${results.partA.families} families`);
  }
  if (results.partB) {
    console.log(`  Part B: ${results.partB.updated.toLocaleString()} null outcomes classified`);
  }

  // Post-run stats
  const { count: totalCryst } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true });
  const { count: totalSynthetic } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'synthetic');
  const { count: nullOutcome } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .is('outcome', null);

  // Outcome distribution
  const outcomes = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
  console.log(`\n최종 상태:`);
  console.log(`  전체 결정화: ${(totalCryst || 0).toLocaleString()}`);
  console.log(`  synthetic: ${(totalSynthetic || 0).toLocaleString()}`);
  console.log(`  null outcome: ${(nullOutcome || 0).toLocaleString()}`);

  for (const oc of outcomes) {
    const { count } = await supabase
      .from('kbsi_crystallization')
      .select('id', { count: 'exact', head: true })
      .eq('outcome', oc);
    console.log(`  ${oc.padEnd(22)} ${(count || 0).toLocaleString()}`);
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
