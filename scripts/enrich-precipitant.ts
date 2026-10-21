/**
 * Precipitant Enrichment — condition_detail에서 precipitant_type 추출 + 정규화
 *
 * 1. condition_detail 텍스트에서 알려진 precipitant 패턴 매칭
 * 2. 기존 precipitant_type 정규화 (PEG3350 → PEG 3350 등)
 *
 * npx tsx scripts/enrich-precipitant.ts              # 실행
 * npx tsx scripts/enrich-precipitant.ts --dry-run    # 미리보기
 * npx tsx scripts/enrich-precipitant.ts --normalize  # 정규화만
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
const normalizeOnly = args.includes('--normalize');

// ─── Known precipitant patterns (ordered by specificity) ───
const PRECIPITANT_PATTERNS: [RegExp, string][] = [
  // PEG variants (most common)
  [/\bPEG[\s-]*(\d{3,5})\b/i, 'PEG $1'],
  [/\bPEG[\s-]*MME[\s-]*(\d{3,5})\b/i, 'PEG MME $1'],
  [/\bPEG[\s-]*DME[\s-]*(\d{3,5})\b/i, 'PEG DME $1'],
  [/\bpolyethylene\s*glycol[\s-]*(\d{3,5})\b/i, 'PEG $1'],
  [/\bPEG[\s-]*(\d)K\b/i, (m: string) => `PEG ${parseInt(m) * 1000}`],
  [/\bMPD\b/, 'MPD'],
  [/\b2-methyl-2,4-pentanediol\b/i, 'MPD'],

  // Salts
  [/\b(?:ammonium\s+sulfate|\(NH4\)2SO4|(?:NH4\)2\s*SO4))\b/i, 'Ammonium Sulfate'],
  [/\b(?:ammonium\s+sulphate)\b/i, 'Ammonium Sulfate'],
  [/\b(?:lithium\s+sulfate|Li2\s*SO4|LI2SO4)\b/i, 'Lithium Sulfate'],
  [/\b(?:sodium\s+chloride|NaCl)\b/i, 'Sodium Chloride'],
  [/\b(?:potassium\s+chloride|KCl)\b/i, 'Potassium Chloride'],
  [/\b(?:magnesium\s+chloride|MgCl2)\b/i, 'Magnesium Chloride'],
  [/\b(?:calcium\s+chloride|CaCl2)\b/i, 'Calcium Chloride'],
  [/\b(?:zinc\s+acetate)\b/i, 'Zinc Acetate'],
  [/\b(?:sodium\s+formate)\b/i, 'Sodium Formate'],
  [/\b(?:sodium\s+acetate)\b/i, 'Sodium Acetate'],
  [/\b(?:sodium\s+citrate)\b/i, 'Sodium Citrate'],
  [/\b(?:sodium\s+malonate)\b/i, 'Sodium Malonate'],
  [/\b(?:ammonium\s+phosphate)\b/i, 'Ammonium Phosphate'],
  [/\b(?:potassium\s+phosphate)\b/i, 'Potassium Phosphate'],
  [/\b(?:sodium\s+phosphate)\b/i, 'Sodium Phosphate'],

  // Organic
  [/\b(?:isopropanol|2-propanol|IPA)\b/i, 'Isopropanol'],
  [/\b(?:ethanol)\b/i, 'Ethanol'],
  [/\b(?:methanol)\b/i, 'Methanol'],
  [/\b(?:acetone)\b/i, 'Acetone'],
  [/\b(?:DMSO|dimethyl\s*sulfoxide)\b/i, 'DMSO'],
  [/\b(?:glycerol)\b/i, 'Glycerol'],
  [/\b(?:jeffamine)\b/i, 'Jeffamine'],
  [/\b(?:dioxane|1,4-dioxane)\b/i, 'Dioxane'],

  // Citrate / tartrate / malate
  [/\b(\d+\.?\d*)\s*M\s+citrate\b/i, 'Sodium Citrate'],
  [/\b(?:sodium\s+tartrate|tartrate)\b/i, 'Sodium Tartrate'],
  [/\b(?:malic\s+acid|malate|DL-malic)\b/i, 'Malic Acid'],
  [/\b(?:succinic\s+acid|succinate)\b/i, 'Succinic Acid'],
];

// ─── Normalization map ───
const NORMALIZE_MAP: Record<string, string> = {
  'PEG3350': 'PEG 3350', 'PEG4000': 'PEG 4000', 'PEG6000': 'PEG 6000',
  'PEG8000': 'PEG 8000', 'PEG400': 'PEG 400', 'PEG1500': 'PEG 1500',
  'PEG1000': 'PEG 1000', 'PEG2000': 'PEG 2000', 'PEG200': 'PEG 200',
  'PEG 4K': 'PEG 4000', 'PEG 8K': 'PEG 8000', 'PEG 6K': 'PEG 6000',
  'peg 3350': 'PEG 3350', 'peg 4000': 'PEG 4000',
  'ammonium sulfate': 'Ammonium Sulfate', 'ammonium sulphate': 'Ammonium Sulfate',
  '(NH4)2SO4': 'Ammonium Sulfate',
  'sodium chloride': 'Sodium Chloride', 'NaCl': 'Sodium Chloride',
  'lithium sulfate': 'Lithium Sulfate', 'Li2SO4': 'Lithium Sulfate',
  'mpd': 'MPD', 'Mpd': 'MPD',
  'isopropanol': 'Isopropanol', '2-propanol': 'Isopropanol',
  'sodium citrate': 'Sodium Citrate', 'Na citrate': 'Sodium Citrate',
  'sodium acetate': 'Sodium Acetate',
};

function extractPrecipitant(detail: string): string | null {
  for (const [pattern, replacement] of PRECIPITANT_PATTERNS) {
    const match = detail.match(pattern);
    if (match) {
      if (typeof replacement === 'function') {
        return (replacement as (m: string) => string)(match[1]);
      }
      // Handle PEG with captured number
      if (replacement.includes('$1') && match[1]) {
        return replacement.replace('$1', match[1]);
      }
      return replacement;
    }
  }
  return null;
}

function normalizePrecipitant(type: string): string {
  return NORMALIZE_MAP[type] || type;
}

// ═══════════════════════════════════════════════════════
// 1. Extract from condition_detail
// ═══════════════════════════════════════════════════════
async function extractFromDetail() {
  console.log('\n=== Precipitant extraction from condition_detail ===');

  const BATCH = 1000;
  let offset = 0;
  let total = 0;
  let extracted = 0;
  let hasMore = true;
  const typeCounts: Record<string, number> = {};

  while (hasMore) {
    const { data, error } = await supabase
      .from('kbsi_crystallization')
      .select('id, condition_detail')
      .not('condition_detail', 'is', null)
      .is('precipitant_type', null)
      .neq('source_type', 'synthetic')
      .range(offset, offset + BATCH - 1);

    if (error) { console.error('Error:', error.message); break; }
    if (!data || data.length === 0) { hasMore = false; break; }

    total += data.length;

    const updates: { id: number; precipitant_type: string }[] = [];
    for (const row of data) {
      const precip = extractPrecipitant(row.condition_detail || '');
      if (precip) {
        updates.push({ id: row.id, precipitant_type: precip });
        typeCounts[precip] = (typeCounts[precip] || 0) + 1;
      }
    }

    if (!dryRun && updates.length > 0) {
      for (const u of updates) {
        await supabase
          .from('kbsi_crystallization')
          .update({ precipitant_type: u.precipitant_type })
          .eq('id', u.id);
      }
    }

    extracted += updates.length;

    if (data.length < BATCH) hasMore = false;
    else offset += BATCH;

    if (total % 10000 === 0) {
      console.log(`  Progress: ${total.toLocaleString()} scanned, ${extracted.toLocaleString()} extracted...`);
    }
  }

  console.log(`  Total scanned: ${total.toLocaleString()}`);
  console.log(`  ${dryRun ? 'Would extract' : 'Extracted'}: ${extracted.toLocaleString()} (${(extracted/total*100).toFixed(1)}%)`);

  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log('\n  Top extracted precipitants:');
  for (const [name, cnt] of sorted) {
    console.log(`    ${name.padEnd(25)} ${cnt.toLocaleString()}`);
  }
}

// ═══════════════════════════════════════════════════════
// 2. Normalize existing precipitant_type
// ═══════════════════════════════════════════════════════
async function normalizeExisting() {
  console.log('\n=== Precipitant normalization ===');

  let totalNormalized = 0;
  for (const [raw, norm] of Object.entries(NORMALIZE_MAP)) {
    if (raw === norm) continue;

    const { count: c } = await supabase
      .from('kbsi_crystallization')
      .select('id', { count: 'exact', head: true })
      .eq('precipitant_type', raw);

    if ((c ?? 0) > 0) {
      if (!dryRun) {
        await supabase
          .from('kbsi_crystallization')
          .update({ precipitant_type: norm })
          .eq('precipitant_type', raw);
      }
      console.log(`  ${raw} → ${norm}: ${c} records`);
      totalNormalized += c ?? 0;
    }
  }
  console.log(`  ${dryRun ? 'Would normalize' : 'Normalized'}: ${totalNormalized.toLocaleString()} total`);
}

// ═══════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════
async function main() {
  console.log('Precipitant Enrichment' + (dryRun ? ' (DRY RUN)' : ''));

  if (!normalizeOnly) await extractFromDetail();
  await normalizeExisting();

  // Final count
  const { count: total } = await supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true });
  const { count: withPrecip } = await supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).not('precipitant_type', 'is', null);
  console.log(`\n  Final coverage: ${withPrecip?.toLocaleString()}/${total?.toLocaleString()} (${((withPrecip??0)/(total??1)*100).toFixed(1)}%)`);
}

main().catch(console.error);
