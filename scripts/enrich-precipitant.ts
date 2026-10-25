/**
 * Precipitant Enrichment — condition_detail에서 precipitant_type 추출 + 정규화
 *
 * npx tsx scripts/enrich-precipitant.ts              # 실행
 * npx tsx scripts/enrich-precipitant.ts --dry-run    # 미리보기
 * npx tsx scripts/enrich-precipitant.ts --normalize  # 정규화만
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const normalizeOnly = args.includes('--normalize');

const PRECIPITANT_PATTERNS: [RegExp, string][] = [
  [/\bPEG[\s-]*(\d{3,5})\b/i, 'PEG $1'], [/\bPEG[\s-]*MME[\s-]*(\d{3,5})\b/i, 'PEG MME $1'],
  [/\bPEG[\s-]*DME[\s-]*(\d{3,5})\b/i, 'PEG DME $1'], [/\bpolyethylene\s*glycol[\s-]*(\d{3,5})\b/i, 'PEG $1'],
  [/\bPEG[\s-]*(\d)K\b/i, 'PEG_K_$1'], [/\bMPD\b/, 'MPD'], [/\b2-methyl-2,4-pentanediol\b/i, 'MPD'],
  [/\b(?:ammonium\s+sulfate|\(NH4\)2SO4|(?:NH4\)2\s*SO4))\b/i, 'Ammonium Sulfate'],
  [/\b(?:ammonium\s+sulphate)\b/i, 'Ammonium Sulfate'],
  [/\b(?:lithium\s+sulfate|Li2\s*SO4|LI2SO4)\b/i, 'Lithium Sulfate'],
  [/\b(?:sodium\s+chloride|NaCl)\b/i, 'Sodium Chloride'], [/\b(?:potassium\s+chloride|KCl)\b/i, 'Potassium Chloride'],
  [/\b(?:magnesium\s+chloride|MgCl2)\b/i, 'Magnesium Chloride'], [/\b(?:calcium\s+chloride|CaCl2)\b/i, 'Calcium Chloride'],
  [/\b(?:zinc\s+acetate)\b/i, 'Zinc Acetate'], [/\b(?:sodium\s+formate)\b/i, 'Sodium Formate'],
  [/\b(?:sodium\s+acetate)\b/i, 'Sodium Acetate'], [/\b(?:sodium\s+citrate)\b/i, 'Sodium Citrate'],
  [/\b(?:sodium\s+malonate)\b/i, 'Sodium Malonate'], [/\b(?:ammonium\s+phosphate)\b/i, 'Ammonium Phosphate'],
  [/\b(?:potassium\s+phosphate)\b/i, 'Potassium Phosphate'], [/\b(?:sodium\s+phosphate)\b/i, 'Sodium Phosphate'],
  [/\b(?:isopropanol|2-propanol|IPA)\b/i, 'Isopropanol'], [/\b(?:ethanol)\b/i, 'Ethanol'],
  [/\b(?:methanol)\b/i, 'Methanol'], [/\b(?:acetone)\b/i, 'Acetone'],
  [/\b(?:DMSO|dimethyl\s*sulfoxide)\b/i, 'DMSO'], [/\b(?:glycerol)\b/i, 'Glycerol'],
  [/\b(?:jeffamine)\b/i, 'Jeffamine'], [/\b(?:dioxane|1,4-dioxane)\b/i, 'Dioxane'],
  [/\b(\d+\.?\d*)\s*M\s+citrate\b/i, 'Sodium Citrate'],
  [/\b(?:sodium\s+tartrate|tartrate)\b/i, 'Sodium Tartrate'],
  [/\b(?:malic\s+acid|malate|DL-malic)\b/i, 'Malic Acid'],
  [/\b(?:succinic\s+acid|succinate)\b/i, 'Succinic Acid'],
];

const NORMALIZE_MAP: Record<string, string> = {
  'PEG3350': 'PEG 3350', 'PEG4000': 'PEG 4000', 'PEG6000': 'PEG 6000',
  'PEG8000': 'PEG 8000', 'PEG400': 'PEG 400', 'PEG1500': 'PEG 1500',
  'PEG1000': 'PEG 1000', 'PEG2000': 'PEG 2000', 'PEG200': 'PEG 200',
  'PEG 4K': 'PEG 4000', 'PEG 8K': 'PEG 8000', 'PEG 6K': 'PEG 6000',
  'peg 3350': 'PEG 3350', 'peg 4000': 'PEG 4000',
  'ammonium sulfate': 'Ammonium Sulfate', 'ammonium sulphate': 'Ammonium Sulfate',
  '(NH4)2SO4': 'Ammonium Sulfate', 'sodium chloride': 'Sodium Chloride', 'NaCl': 'Sodium Chloride',
  'lithium sulfate': 'Lithium Sulfate', 'Li2SO4': 'Lithium Sulfate',
  'mpd': 'MPD', 'Mpd': 'MPD', 'isopropanol': 'Isopropanol', '2-propanol': 'Isopropanol',
  'sodium citrate': 'Sodium Citrate', 'Na citrate': 'Sodium Citrate', 'sodium acetate': 'Sodium Acetate',
};

function extractPrecipitant(detail: string): string | null {
  for (const [pattern, replacement] of PRECIPITANT_PATTERNS) {
    const match = detail.match(pattern);
    if (match) {
      if (replacement.includes('$1') && match[1]) return replacement.replace('$1', match[1]);
      return replacement;
    }
  }
  return null;
}

async function extractFromDetail() {
  console.log('\n=== Precipitant extraction from condition_detail ===');
  const BATCH = 1000;
  let offset = 0, total = 0, extracted = 0, hasMore = true;
  const typeCounts: Record<string, number> = {};

  while (hasMore) {
    const { rows: data } = await client.query(
      `SELECT id, condition_detail FROM kbsi_crystallization
       WHERE condition_detail IS NOT NULL AND precipitant_type IS NULL AND source_type != $1
       ORDER BY id OFFSET $2 LIMIT $3`,
      ['synthetic', offset, BATCH]
    );
    if (!data || data.length === 0) { hasMore = false; break; }
    total += data.length;

    const updates: { id: number; precipitant_type: string }[] = [];
    for (const row of data) {
      const precip = extractPrecipitant(row.condition_detail || '');
      if (precip) { updates.push({ id: row.id, precipitant_type: precip }); typeCounts[precip] = (typeCounts[precip] || 0) + 1; }
    }

    if (!dryRun && updates.length > 0) {
      for (const u of updates) {
        await client.query('UPDATE kbsi_crystallization SET precipitant_type = $1 WHERE id = $2', [u.precipitant_type, u.id]);
      }
    }
    extracted += updates.length;
    if (data.length < BATCH) hasMore = false; else offset += BATCH;
    if (total % 10000 === 0) console.log(`  Progress: ${total.toLocaleString()} scanned, ${extracted.toLocaleString()} extracted...`);
  }

  console.log(`  Total scanned: ${total.toLocaleString()}`);
  console.log(`  ${dryRun ? 'Would extract' : 'Extracted'}: ${extracted.toLocaleString()} (${(extracted/total*100).toFixed(1)}%)`);
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log('\n  Top extracted precipitants:');
  for (const [name, cnt] of sorted) console.log(`    ${name.padEnd(25)} ${cnt.toLocaleString()}`);
}

async function normalizeExisting() {
  console.log('\n=== Precipitant normalization ===');
  let totalNormalized = 0;
  for (const [raw, norm] of Object.entries(NORMALIZE_MAP)) {
    if (raw === norm) continue;
    const { rows: [{ count: c }] } = await client.query(
      'SELECT COUNT(*) as count FROM kbsi_crystallization WHERE precipitant_type = $1', [raw]
    );
    const cnt = parseInt(c);
    if (cnt > 0) {
      if (!dryRun) {
        await client.query('UPDATE kbsi_crystallization SET precipitant_type = $1 WHERE precipitant_type = $2', [norm, raw]);
      }
      console.log(`  ${raw} -> ${norm}: ${cnt} records`);
      totalNormalized += cnt;
    }
  }
  console.log(`  ${dryRun ? 'Would normalize' : 'Normalized'}: ${totalNormalized.toLocaleString()} total`);
}

async function main() {
  await client.connect();
  try {
    console.log('Precipitant Enrichment' + (dryRun ? ' (DRY RUN)' : ''));
    if (!normalizeOnly) await extractFromDetail();
    await normalizeExisting();

    const { rows: [{ count: total }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_crystallization');
    const { rows: [{ count: withPrecip }] } = await client.query('SELECT COUNT(*) as count FROM kbsi_crystallization WHERE precipitant_type IS NOT NULL');
    console.log(`\n  Final coverage: ${parseInt(withPrecip).toLocaleString()}/${parseInt(total).toLocaleString()} (${(parseInt(withPrecip)/parseInt(total)*100).toFixed(1)}%)`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
