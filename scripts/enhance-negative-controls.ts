/**
 * Enhanced Negative Control System (Phase D-3)
 *
 * Part A: Family-based resampling
 * Part B: null_outcome cleanup
 *
 * npx tsx scripts/enhance-negative-controls.ts                        # both parts
 * npx tsx scripts/enhance-negative-controls.ts --part A               # family resampling only
 * npx tsx scripts/enhance-negative-controls.ts --part B               # null cleanup only
 * npx tsx scripts/enhance-negative-controls.ts --dry-run              # preview only
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function getArg(name: string, fallback: string): string {
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return fallback;
}

const partArg = getArg('part', 'both').toUpperCase();
const runPartA = partArg === 'BOTH' || partArg === 'A';
const runPartB = partArg === 'BOTH' || partArg === 'B';
const sourceLimit = parseInt(getArg('limit', '999999'));
const targetPerFamily = parseInt(getArg('target-per-family', '500'));
const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;

function classifyProteinFamily(name: string | null): string {
  if (!name) return 'unknown';
  const n = name.toLowerCase();
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

const WRONG_PRECIPITANTS: Record<string, string[]> = {
  'kinase': ['Ammonium sulfate', 'Sodium chloride', 'MPD'],
  'protease': ['PEG 20000', 'Isopropanol', 'Sodium citrate'],
  'polymerase': ['MPD', 'Ethanol', 'Ammonium sulfate'],
  'lysozyme': ['PEG 20000', 'Isopropanol', 'Ethanol'],
};
const DEFAULT_WRONG_PRECIPITANTS = ['PEG 20000', 'MPD', 'Ammonium sulfate', 'Sodium chloride', 'Isopropanol'];

function rand(min: number, max: number): number { return Math.round((min + Math.random() * (max - min)) * 10) / 10; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function baseFields(r: any) {
  return {
    construct_id: r.construct_id, source_type: 'synthetic' as const, source_db: 'synthetic',
    precipitant_type: r.precipitant_type, precipitant_conc: r.precipitant_conc, precipitant_unit: r.precipitant_unit,
    buffer_type: r.buffer_type, ph: r.ph, temperature: r.temperature,
    salt_type: r.salt_type, salt_conc: r.salt_conc, protein_concentration: r.protein_concentration, additive: r.additive,
  };
}

function cleanRecord(rec: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(rec)) { if (v != null && v !== 'null') cleaned[k] = v; }
  return cleaned;
}

type NCStrategy = { name: string; apply: (r: any, family: string) => Record<string, any>; requires: (r: any) => boolean; };

const FAMILY_STRATEGIES: NCStrategy[] = [
  { name: 'wrong_precipitant', apply: (r, family) => {
    const wrongList = WRONG_PRECIPITANTS[family] || DEFAULT_WRONG_PRECIPITANTS;
    let wrongPrecip = pick(wrongList);
    if (wrongPrecip === r.precipitant_type && wrongList.length > 1) wrongPrecip = wrongList.find(p => p !== r.precipitant_type) || wrongPrecip;
    return { ...baseFields(r), precipitant_type: wrongPrecip, precipitant_conc: r.precipitant_conc ? rand(r.precipitant_conc * 0.5, r.precipitant_conc * 1.5) : null, outcome: 'precipitate', notes: `NC-D3: wrong precipitant for ${family} (src ${r.id})` };
  }, requires: (r) => r.precipitant_type != null },
  { name: 'conc_outside_range', apply: (r, family) => {
    const direction = Math.random() > 0.5 ? 'low' : 'high';
    const factor = direction === 'low' ? rand(0.05, 0.15) : rand(3.5, 6.0);
    return { ...baseFields(r), precipitant_conc: r.precipitant_conc ? Math.round(r.precipitant_conc * factor * 10) / 10 : null, outcome: direction === 'low' ? 'clear' : 'precipitate', notes: `NC-D3: ${direction} conc ${factor.toFixed(1)}x for ${family} (src ${r.id})` };
  }, requires: (r) => r.precipitant_conc != null && r.precipitant_conc > 0 },
  { name: 'suboptimal_protein_conc', apply: (r, family) => {
    const direction = Math.random() > 0.5 ? 'dilute' : 'concentrated';
    const newConc = direction === 'dilute' ? rand(0.1, 1.0) : (r.protein_concentration ? rand(r.protein_concentration * 5, r.protein_concentration * 10) : rand(80, 150));
    return { ...baseFields(r), protein_concentration: Math.round(newConc * 10) / 10, outcome: direction === 'dilute' ? 'clear' : 'precipitate', notes: `NC-D3: ${direction} protein for ${family} (src ${r.id})` };
  }, requires: () => true },
  { name: 'ph_family_mismatch', apply: (r, family) => {
    const shift = rand(2.5, 4.0) * (Math.random() > 0.5 ? 1 : -1);
    let newPh = Math.round((r.ph + shift) * 10) / 10;
    newPh = Math.max(2.0, Math.min(12.0, newPh));
    return { ...baseFields(r), ph: newPh, outcome: Math.abs(shift) > 3 ? 'precipitate' : 'phase_separation', notes: `NC-D3: pH mismatch for ${family} (src ${r.id})` };
  }, requires: (r) => r.ph != null },
  { name: 'combined_suboptimal', apply: (r, family) => {
    const phShift = rand(1.0, 2.0) * (Math.random() > 0.5 ? 1 : -1);
    const tempShift = rand(5, 12) * (Math.random() > 0.5 ? 1 : -1);
    const concFactor = Math.random() > 0.5 ? rand(0.1, 0.3) : rand(2.5, 4.0);
    return { ...baseFields(r), ph: r.ph ? Math.max(2.0, Math.min(12.0, Math.round((r.ph + phShift) * 10) / 10)) : r.ph, temperature: r.temperature ? Math.max(-5, Math.round(r.temperature + tempShift)) : r.temperature, precipitant_conc: r.precipitant_conc ? Math.round(r.precipitant_conc * concFactor * 10) / 10 : r.precipitant_conc, outcome: 'precipitate', notes: `NC-D3: combined suboptimal for ${family} (src ${r.id})` };
  }, requires: (r) => r.ph != null || r.temperature != null },
];

async function insertCrystallizationRow(row: Record<string, any>): Promise<number | null> {
  const keys = Object.keys(row);
  const vals = Object.values(row);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const { rows } = await client.query(
      `INSERT INTO kbsi_crystallization (${keys.join(', ')}) VALUES (${placeholders}) RETURNING id`, vals
    );
    return rows[0]?.id ?? null;
  } catch { return null; }
}

async function partA_familyResampling() {
  console.log('\n' + '='.repeat(60));
  console.log('Part A: Family-based Negative Control Resampling');
  console.log('='.repeat(60));

  const { rows: [{ count: totalCrystStr }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_crystallization');
  const { rows: [{ count: totalSyntheticStr }] } = await client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE source_type = 'synthetic'`);
  console.log(`\n현재 상태:\n  전체 결정화: ${parseInt(totalCrystStr).toLocaleString()}\n  기존 synthetic NC: ${parseInt(totalSyntheticStr).toLocaleString()}`);

  console.log(`\n성공 레코드 조회 중 (limit=${sourceLimit})...`);
  let successes: any[] = [];
  let offset = 0;
  while (successes.length < sourceLimit) {
    const { rows: data } = await client.query(
      `SELECT id, construct_id, precipitant_type, precipitant_conc, precipitant_unit, buffer_type, ph, temperature, salt_type, salt_conc, protein_concentration, additive
       FROM kbsi_crystallization
       WHERE (outcome = 'diffraction_quality' OR outcome = 'single_crystal') AND source_type != 'synthetic'
       OFFSET $1 LIMIT $2`, [offset, PAGE_SIZE]
    );
    if (!data || data.length === 0) break;
    successes = successes.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  successes = successes.slice(0, sourceLimit);
  console.log(`  성공 레코드 (non-synthetic): ${successes.length.toLocaleString()}`);

  const constructIds = [...new Set(successes.map(r => r.construct_id))].filter(Boolean);
  const constructProteinMap: Record<number, number> = {};
  for (let i = 0; i < constructIds.length; i += BATCH_SIZE) {
    const batch = constructIds.slice(i, i + BATCH_SIZE);
    const { rows: constructs } = await client.query('SELECT id, protein_id FROM kbsi_construct WHERE id = ANY($1)', [batch]);
    for (const c of constructs || []) constructProteinMap[c.id] = c.protein_id;
  }

  const proteinIds = [...new Set(Object.values(constructProteinMap))].filter(Boolean);
  const proteinNameMap: Record<number, string> = {};
  for (let i = 0; i < proteinIds.length; i += BATCH_SIZE) {
    const batch = proteinIds.slice(i, i + BATCH_SIZE);
    const { rows: proteins } = await client.query('SELECT id, full_name, full_name_normalized FROM kbsi_protein WHERE id = ANY($1)', [batch]);
    for (const p of proteins || []) proteinNameMap[p.id] = p.full_name_normalized || p.full_name || '';
  }

  const familyRecords: Record<string, any[]> = {};
  for (const r of successes) {
    const proteinId = constructProteinMap[r.construct_id];
    const proteinName = proteinId ? proteinNameMap[proteinId] : null;
    const family = classifyProteinFamily(proteinName);
    if (!familyRecords[family]) familyRecords[family] = [];
    familyRecords[family].push(r);
  }

  const families = Object.keys(familyRecords).sort((a, b) => familyRecords[b].length - familyRecords[a].length);
  const familyTargets: Record<string, number> = {};
  let totalTarget = 0;
  for (const family of families) {
    const count = familyRecords[family].length;
    const target = Math.max(targetPerFamily, Math.round(count * FAMILY_STRATEGIES.length));
    familyTargets[family] = target;
    totalTarget += target;
  }

  if (dryRun) { console.log('\n=== DRY-RUN (Part A) ==='); return { inserted: 0, families: families.length }; }

  let totalInserted = 0;
  const startTime = Date.now();
  for (const family of families) {
    const records = familyRecords[family];
    const target = familyTargets[family];
    const perStrategy = Math.ceil(target / FAMILY_STRATEGIES.length);

    for (const strategy of FAMILY_STRATEGIES) {
      const applicable = records.filter(r => strategy.requires(r));
      if (applicable.length === 0) continue;
      const sampled: any[] = [];
      for (let i = 0; i < perStrategy; i++) sampled.push(applicable[i % applicable.length]);

      for (let i = 0; i < sampled.length; i += BATCH_SIZE) {
        const batch = sampled.slice(i, i + BATCH_SIZE);
        for (const r of batch) {
          const row = cleanRecord(strategy.apply(r, family));
          const id = await insertCrystallizationRow(row);
          if (id) totalInserted++;
        }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`  ${family}: ${totalInserted.toLocaleString()} 누적 | ${elapsed}s`);
  }

  console.log(`\nPart A 완료: ${totalInserted.toLocaleString()} NCs 생성`);
  return { inserted: totalInserted, families: families.length };
}

async function partB_nullOutcomeCleanup() {
  console.log('\n' + '='.repeat(60));
  console.log('Part B: null_outcome Cleanup');
  console.log('='.repeat(60));

  const { rows: [{ count: nullCountStr }] } = await client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE outcome IS NULL`);
  const nullCount = parseInt(nullCountStr);
  console.log(`\nnull outcome 레코드: ${nullCount.toLocaleString()}`);
  if (nullCount === 0) { console.log('처리할 레코드 없음'); return { updated: 0 }; }

  let nullRecords: any[] = [];
  let offset = 0;
  while (true) {
    const { rows: data } = await client.query(
      `SELECT id, construct_id, source_type, source_db, notes FROM kbsi_crystallization WHERE outcome IS NULL OFFSET $1 LIMIT $2`,
      [offset, PAGE_SIZE]
    );
    if (!data || data.length === 0) break;
    nullRecords = nullRecords.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const constructIds = [...new Set(nullRecords.map(r => r.construct_id))].filter(Boolean);
  const constructsWithDiffraction = new Set<number>();
  for (let i = 0; i < constructIds.length; i += BATCH_SIZE) {
    const batch = constructIds.slice(i, i + BATCH_SIZE);
    const { rows: diffractions } = await client.query('SELECT DISTINCT construct_id FROM kbsi_diffraction WHERE construct_id = ANY($1)', [batch]);
    for (const d of diffractions || []) constructsWithDiffraction.add(d.construct_id);
  }

  const classifications: Record<string, { ids: number[]; outcome: string }> = {
    synthetic_missing: { ids: [], outcome: 'precipitate' },
    database_with_diffraction: { ids: [], outcome: 'diffraction_quality' },
    database_no_crystal: { ids: [], outcome: 'clear' },
    literature_with_diffraction: { ids: [], outcome: 'diffraction_quality' },
    literature_no_crystal: { ids: [], outcome: 'clear' },
    experimental_with_diffraction: { ids: [], outcome: 'diffraction_quality' },
    experimental_no_crystal: { ids: [], outcome: 'clear' },
  };

  for (const r of nullRecords) {
    const hasDiffraction = constructsWithDiffraction.has(r.construct_id);
    const st = r.source_type || 'database';
    if (st === 'synthetic') { classifications.synthetic_missing.ids.push(r.id); }
    else if (st === 'database') { if (hasDiffraction) classifications.database_with_diffraction.ids.push(r.id); else classifications.database_no_crystal.ids.push(r.id); }
    else if (st === 'literature') { if (hasDiffraction) classifications.literature_with_diffraction.ids.push(r.id); else classifications.literature_no_crystal.ids.push(r.id); }
    else { if (hasDiffraction) classifications.experimental_with_diffraction.ids.push(r.id); else classifications.experimental_no_crystal.ids.push(r.id); }
  }

  if (dryRun) { console.log('\n=== DRY-RUN (Part B) ==='); return { updated: 0 }; }

  let totalUpdated = 0;
  for (const [cat, info] of Object.entries(classifications)) {
    if (info.ids.length === 0) continue;
    console.log(`\n[${cat}] ${info.ids.length.toLocaleString()} -> ${info.outcome}`);
    for (let i = 0; i < info.ids.length; i += BATCH_SIZE) {
      const batch = info.ids.slice(i, i + BATCH_SIZE);
      await client.query('UPDATE kbsi_crystallization SET outcome = $1 WHERE id = ANY($2)', [info.outcome, batch]);
      totalUpdated += batch.length;
    }
  }

  console.log(`\nPart B 완료: ${totalUpdated.toLocaleString()} 레코드 업데이트`);
  return { updated: totalUpdated };
}

async function main() {
  await client.connect();
  try {
    console.log('Enhanced Negative Control System (Phase D-3)');
    console.log(`dry-run: ${dryRun} | part: ${partArg}`);
    const results: Record<string, any> = {};
    if (runPartA) results.partA = await partA_familyResampling();
    if (runPartB) results.partB = await partB_nullOutcomeCleanup();

    console.log('\n' + '='.repeat(60) + '\nSummary\n' + '='.repeat(60));
    if (results.partA) console.log(`  Part A: ${results.partA.inserted.toLocaleString()} family-based NCs across ${results.partA.families} families`);
    if (results.partB) console.log(`  Part B: ${results.partB.updated.toLocaleString()} null outcomes classified`);

    const { rows: [{ count: tc }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_crystallization');
    const { rows: [{ count: ts }] } = await client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE source_type = 'synthetic'`);
    const { rows: [{ count: tn }] } = await client.query(`SELECT COUNT(*) as count FROM kbsi_crystallization WHERE outcome IS NULL`);
    console.log(`\n최종 상태:\n  전체 결정화: ${parseInt(tc).toLocaleString()}\n  synthetic: ${parseInt(ts).toLocaleString()}\n  null outcome: ${parseInt(tn).toLocaleString()}`);

    const outcomes = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
    for (const oc of outcomes) {
      const { rows: [{ count }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_crystallization WHERE outcome = $1', [oc]);
      console.log(`  ${oc.padEnd(22)} ${parseInt(count).toLocaleString()}`);
    }
    console.log('\n' + '='.repeat(60));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
