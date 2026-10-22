/**
 * Precipitant Enrichment v2 — 50% 커버리지 달성 (4-Phase Pipeline)
 *
 * Phase 1: Enhanced Regex (150+ patterns) — condition_detail에서 추출
 * Phase 2: PDB Re-fetch — condition_detail 없는 레코드에 pdbx_details 가져오기
 * Phase 3: LLM Batch — regex 실패 레코드에 gpt-4o-mini 일괄 처리
 * Phase 4: Construct Propagation — 성공 실험 precipitant → 같은 construct 전파
 *
 * npx tsx scripts/enrich-precipitant-v2.ts                    # 전체 실행
 * npx tsx scripts/enrich-precipitant-v2.ts --phase 1          # 특정 Phase만
 * npx tsx scripts/enrich-precipitant-v2.ts --phase 1,2        # 복수 Phase
 * npx tsx scripts/enrich-precipitant-v2.ts --dry-run           # 미리보기
 * npx tsx scripts/enrich-precipitant-v2.ts --llm-limit 5000   # LLM 처리 건수
 * npx tsx scripts/enrich-precipitant-v2.ts --pdb-concurrency 5 # PDB API 동시 요청
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

const phaseArg = getArg('phase', '');
const phases = phaseArg ? phaseArg.split(',').map(Number) : [1, 2, 3, 4];
const llmLimit = parseInt(getArg('llm-limit', '5000'));
const pdbConcurrency = parseInt(getArg('pdb-concurrency', '5'));

// ═══════════════════════════════════════════════════════
// Precipitant Pattern Registry (150+ patterns)
// ═══════════════════════════════════════════════════════

// Concentration + precipitant or precipitant alone
const PRECIPITANT_PATTERNS: [RegExp, string][] = [
  // ─── PEG variants (most common crystallization precipitant) ───
  [/\bPEG[\s-]*MME[\s-]*(\d{3,5})\b/i, 'PEG MME $1'],
  [/\bPEG[\s-]*DME[\s-]*(\d{3,5})\b/i, 'PEG DME $1'],
  [/\bPEG[\s-]*smear\b/i, 'PEG Smear'],
  [/\bPEG[\s-]*(\d{3,5})\b/i, 'PEG $1'],
  [/\bpolyethylene\s*glycol[\s-]*monomethyl[\s-]*ether[\s-]*(\d{3,5})\b/i, 'PEG MME $1'],
  [/\bpolyethylene\s*glycol[\s-]*(\d{3,5})\b/i, 'PEG $1'],
  [/\bPEG[\s-]*(\d)[Kk]\b/, 'PEG_K'],  // post-process
  [/\bP\.?E\.?G\.?\s*(\d{3,5})\b/, 'PEG $1'],
  [/\bpoly\s*\(ethylene\s*glycol\)[\s-]*(\d{3,5})\b/i, 'PEG $1'],
  [/\bJeffamine[\s-]*M[\s-]*600\b/i, 'Jeffamine M-600'],
  [/\bJeffamine[\s-]*ED[\s-]*2003\b/i, 'Jeffamine ED-2003'],
  [/\bJeffamine\b/i, 'Jeffamine'],

  // ─── MPD ───
  [/\bMPD\b/, 'MPD'],
  [/\b2-methyl-2,4-pentanediol\b/i, 'MPD'],
  [/\b2-methylpentane-2,4-diol\b/i, 'MPD'],

  // ─── Ammonium salts ───
  [/\b(?:ammonium\s+sulfate|\(NH4\)2SO4|(?:NH4\)2\s*SO4))\b/i, 'Ammonium Sulfate'],
  [/\b(?:ammonium\s+sulphate)\b/i, 'Ammonium Sulfate'],
  [/\b(?:ammonium\s+chloride|NH4Cl)\b/i, 'Ammonium Chloride'],
  [/\b(?:ammonium\s+acetate|NH4OAc)\b/i, 'Ammonium Acetate'],
  [/\b(?:ammonium\s+citrate)\b/i, 'Ammonium Citrate'],
  [/\b(?:ammonium\s+formate)\b/i, 'Ammonium Formate'],
  [/\b(?:ammonium\s+nitrate)\b/i, 'Ammonium Nitrate'],
  [/\b(?:ammonium\s+phosphate)\b/i, 'Ammonium Phosphate'],
  [/\b(?:ammonium\s+tartrate)\b/i, 'Ammonium Tartrate'],
  [/\b(?:diammonium\s+phosphate)\b/i, 'Diammonium Phosphate'],
  [/\b(?:di-?ammonium\s+hydrogen\s+phosphate)\b/i, 'Diammonium Phosphate'],

  // ─── Lithium salts ───
  [/\b(?:lithium\s+sulfate|Li2\s*SO4|LI2SO4)\b/i, 'Lithium Sulfate'],
  [/\b(?:lithium\s+chloride|LiCl)\b/i, 'Lithium Chloride'],
  [/\b(?:lithium\s+acetate)\b/i, 'Lithium Acetate'],
  [/\b(?:lithium\s+citrate)\b/i, 'Lithium Citrate'],
  [/\b(?:lithium\s+nitrate)\b/i, 'Lithium Nitrate'],

  // ─── Sodium salts ───
  [/\b(?:sodium\s+chloride|NaCl)\b/i, 'Sodium Chloride'],
  [/\b(?:sodium\s+formate|HCOONa)\b/i, 'Sodium Formate'],
  [/\b(?:sodium\s+acetate|NaOAc|CH3COONa)\b/i, 'Sodium Acetate'],
  [/\b(?:sodium\s+citrate|Na3?\s*citrate)\b/i, 'Sodium Citrate'],
  [/\b(?:sodium\s+malonate)\b/i, 'Sodium Malonate'],
  [/\b(?:sodium\s+tartrate)\b/i, 'Sodium Tartrate'],
  [/\b(?:sodium\s+phosphate|Na[23]?\s*PO4)\b/i, 'Sodium Phosphate'],
  [/\b(?:sodium\s+sulfate|Na2SO4)\b/i, 'Sodium Sulfate'],
  [/\b(?:sodium\s+thiocyanate|NaSCN)\b/i, 'Sodium Thiocyanate'],
  [/\b(?:sodium\s+nitrate|NaNO3)\b/i, 'Sodium Nitrate'],
  [/\b(?:sodium\s+cacodylate)\b/i, 'Sodium Cacodylate'],
  [/\b(?:sodium\s+succinate)\b/i, 'Sodium Succinate'],

  // ─── Potassium salts ───
  [/\b(?:potassium\s+chloride|KCl)\b/i, 'Potassium Chloride'],
  [/\b(?:potassium\s+phosphate|K[23]?\s*PO4|KH2PO4|K2HPO4)\b/i, 'Potassium Phosphate'],
  [/\b(?:potassium\s+sodium\s+tartrate|Rochelle\s+salt)\b/i, 'Potassium Sodium Tartrate'],
  [/\b(?:potassium\s+sulfate|K2SO4)\b/i, 'Potassium Sulfate'],
  [/\b(?:potassium\s+thiocyanate|KSCN)\b/i, 'Potassium Thiocyanate'],
  [/\b(?:potassium\s+nitrate|KNO3)\b/i, 'Potassium Nitrate'],
  [/\b(?:potassium\s+acetate)\b/i, 'Potassium Acetate'],
  [/\b(?:potassium\s+formate)\b/i, 'Potassium Formate'],
  [/\b(?:potassium\s+citrate)\b/i, 'Potassium Citrate'],
  [/\b(?:potassium\s+bromide|KBr)\b/i, 'Potassium Bromide'],

  // ─── Magnesium/Calcium/Zinc salts ───
  [/\b(?:magnesium\s+chloride|MgCl2)\b/i, 'Magnesium Chloride'],
  [/\b(?:magnesium\s+sulfate|MgSO4)\b/i, 'Magnesium Sulfate'],
  [/\b(?:magnesium\s+acetate)\b/i, 'Magnesium Acetate'],
  [/\b(?:magnesium\s+formate)\b/i, 'Magnesium Formate'],
  [/\b(?:magnesium\s+nitrate)\b/i, 'Magnesium Nitrate'],
  [/\b(?:calcium\s+chloride|CaCl2)\b/i, 'Calcium Chloride'],
  [/\b(?:calcium\s+acetate)\b/i, 'Calcium Acetate'],
  [/\b(?:zinc\s+acetate|Zn\s*\(OAc\)2)\b/i, 'Zinc Acetate'],
  [/\b(?:zinc\s+sulfate|ZnSO4)\b/i, 'Zinc Sulfate'],
  [/\b(?:zinc\s+chloride|ZnCl2)\b/i, 'Zinc Chloride'],
  [/\b(?:cobalt\s+chloride|CoCl2)\b/i, 'Cobalt Chloride'],
  [/\b(?:cadmium\s+chloride|CdCl2)\b/i, 'Cadmium Chloride'],
  [/\b(?:manganese\s+chloride|MnCl2)\b/i, 'Manganese Chloride'],
  [/\b(?:nickel\s+chloride|NiCl2)\b/i, 'Nickel Chloride'],
  [/\b(?:barium\s+chloride|BaCl2)\b/i, 'Barium Chloride'],
  [/\b(?:strontium\s+chloride|SrCl2)\b/i, 'Strontium Chloride'],
  [/\b(?:cesium\s+chloride|CsCl)\b/i, 'Cesium Chloride'],
  [/\b(?:ferric\s+chloride|FeCl3)\b/i, 'Ferric Chloride'],

  // ─── Organic solvents ───
  [/\b(?:isopropanol|2-propanol|IPA|isopropyl\s+alcohol)\b/i, 'Isopropanol'],
  [/\b(?:ethanol)\b/i, 'Ethanol'],
  [/\b(?:methanol|MeOH)\b/i, 'Methanol'],
  [/\b(?:acetone)\b/i, 'Acetone'],
  [/\b(?:DMSO|dimethyl\s*sulfoxide)\b/i, 'DMSO'],
  [/\b(?:glycerol)\b/i, 'Glycerol'],
  [/\b(?:ethylene\s*glycol)\b/i, 'Ethylene Glycol'],
  [/\b(?:1,4-dioxane|dioxane)\b/i, 'Dioxane'],
  [/\b(?:1,6-hexanediol|hexanediol)\b/i, '1,6-Hexanediol'],
  [/\b(?:2,5-hexanediol)\b/i, '2,5-Hexanediol'],
  [/\b(?:1,3-propanediol|propanediol)\b/i, '1,3-Propanediol'],
  [/\b(?:1,3-butanediol|butanediol)\b/i, '1,3-Butanediol'],
  [/\b(?:tert-butanol|t-butanol)\b/i, 'tert-Butanol'],
  [/\b(?:1-propanol|n-propanol)\b/i, '1-Propanol'],
  [/\b(?:2-butanol)\b/i, '2-Butanol'],
  [/\b(?:pentaerythritol\s*propoxylate|PEPO)\b/i, 'Pentaerythritol Propoxylate'],
  [/\b(?:pentaerythritol\s*ethoxylate|PEEO)\b/i, 'Pentaerythritol Ethoxylate'],
  [/\b(?:trimethylamine\s+N-oxide|TMAO)\b/i, 'TMAO'],

  // ─── Organic acids / buffers ───
  [/\b(?:citric\s+acid|citrate)\b/i, 'Citric Acid'],
  [/\b(?:succinic\s+acid|succinate)\b/i, 'Succinic Acid'],
  [/\b(?:malic\s+acid|(?:DL-)?malate|DL-malic)\b/i, 'Malic Acid'],
  [/\b(?:tartaric\s+acid|tartrate)\b/i, 'Tartaric Acid'],
  [/\b(?:formic\s+acid|formate)\b/i, 'Formic Acid'],
  [/\b(?:acetic\s+acid)\b/i, 'Acetic Acid'],
  [/\b(?:malonic\s+acid|malonate)\b/i, 'Malonic Acid'],
  [/\b(?:fumaric\s+acid|fumarate)\b/i, 'Fumaric Acid'],
  [/\b(?:oxalic\s+acid|oxalate)\b/i, 'Oxalic Acid'],
  [/\b(?:propionic\s+acid|propionate)\b/i, 'Propionic Acid'],
  [/\b(?:butyric\s+acid|butyrate)\b/i, 'Butyric Acid'],

  // ─── Tacsimate / specialized ───
  [/\b(?:tacsimate)\b/i, 'Tacsimate'],
  [/\b(?:sodium\s+diethyl\s+dithiocarbamate)\b/i, 'Sodium Diethyldithiocarbamate'],

  // ─── Concentration-first patterns (e.g. "0.1 M NaCl", "20% PEG 3350") ───
  [/(\d+\.?\d*)\s*%\s*(?:w\/v\s+)?PEG[\s-]*(\d{3,5})\b/i, 'PEG $2'],
  [/(\d+\.?\d*)\s*%\s*(?:w\/v\s+)?(?:ammonium\s+sulfate)/i, 'Ammonium Sulfate'],
  [/(\d+\.?\d*)\s*%\s*(?:w\/v\s+)?MPD\b/i, 'MPD'],
  [/(\d+\.?\d*)\s*%\s*(?:w\/v\s+)?(?:isopropanol|2-propanol)/i, 'Isopropanol'],
  [/(\d+\.?\d*)\s*%\s*(?:w\/v\s+)?(?:ethanol)/i, 'Ethanol'],
  [/(\d+\.?\d*)\s*%\s*(?:v\/v\s+)?(?:glycerol)/i, 'Glycerol'],
  [/(\d+\.?\d*)\s*%\s*(?:v\/v\s+)?(?:ethylene\s*glycol)/i, 'Ethylene Glycol'],
  [/(\d+\.?\d*)\s*%\s*(?:w\/v\s+)?(?:1,6-hexanediol)/i, '1,6-Hexanediol'],
  [/(\d+\.?\d*)\s*M\s+(?:sodium\s+chloride|NaCl)/i, 'Sodium Chloride'],
  [/(\d+\.?\d*)\s*M\s+(?:ammonium\s+sulfate)/i, 'Ammonium Sulfate'],
  [/(\d+\.?\d*)\s*M\s+(?:lithium\s+sulfate)/i, 'Lithium Sulfate'],
  [/(\d+\.?\d*)\s*M\s+(?:sodium\s+malonate)/i, 'Sodium Malonate'],
  [/(\d+\.?\d*)\s*M\s+(?:sodium\s+formate)/i, 'Sodium Formate'],
  [/(\d+\.?\d*)\s*M\s+(?:sodium\s+citrate)/i, 'Sodium Citrate'],
  [/(\d+\.?\d*)\s*M\s+(?:sodium\s+acetate)/i, 'Sodium Acetate'],
  [/(\d+\.?\d*)\s*M\s+(?:potassium\s+phosphate)/i, 'Potassium Phosphate'],
  [/(\d+\.?\d*)\s*M\s+(?:magnesium\s+chloride)/i, 'Magnesium Chloride'],
  [/(\d+\.?\d*)\s*M\s+(?:calcium\s+chloride)/i, 'Calcium Chloride'],
  [/(\d+\.?\d*)\s*M\s+(?:zinc\s+acetate)/i, 'Zinc Acetate'],
  [/(\d+\.?\d*)\s*M\s+(?:citric\s+acid|citrate)/i, 'Citric Acid'],
  [/(\d+\.?\d*)\s*M\s+(?:succinic\s+acid|succinate)/i, 'Succinic Acid'],
  [/(\d+\.?\d*)\s*M\s+(?:malic\s+acid|malate)/i, 'Malic Acid'],
  [/(\d+\.?\d*)\s*M\s+(?:tartaric\s+acid|tartrate)/i, 'Tartaric Acid'],
  [/(\d+\.?\d*)\s*M\s+(?:malonic\s+acid|malonate)/i, 'Malonic Acid'],
  [/(\d+\.?\d*)\s*M\s+(?:sodium\s+phosphate)/i, 'Sodium Phosphate'],
  [/(\d+\.?\d*)\s*M\s+(?:tacsimate)/i, 'Tacsimate'],

  // ─── Screening kit names (map to dominant precipitant) ───
  [/\bJCSG[\s+\-]*(?:Core|Plus)?\b/i, 'JCSG Screen'],
  [/\bCrystal\s+Screen\s*(?:I{1,2}|1|2|Cryo|Lite|HT)?\b/i, 'Crystal Screen'],
  [/\bIndex\s+(?:Screen|HT)\b/i, 'Index Screen'],
  [/\bPACT\s+(?:premier|screen)?\b/i, 'PACT Screen'],
  [/\bMorpheus\b/i, 'Morpheus Screen'],
  [/\bWizard\s*(?:I{1,2}|1|2|3|4|Classic)?\b/i, 'Wizard Screen'],
  [/\bSaltRx\b/i, 'SaltRx Screen'],
  [/\bNatrix\b/i, 'Natrix Screen'],
  [/\bMemGold\b/i, 'MemGold Screen'],
  [/\bPEGRx\b/i, 'PEGRx Screen'],
  [/\bPEG\/Ion\b/i, 'PEG/Ion Screen'],
];

// Concentration extraction (separate from precipitant type)
const CONC_PATTERNS: [RegExp, (m: RegExpMatchArray) => { conc: number; unit: string }][] = [
  [/(\d+\.?\d*)\s*%\s*(?:w\/v|v\/v)?/i, m => ({ conc: parseFloat(m[1]), unit: '% w/v' })],
  [/(\d+\.?\d*)\s*M\b/i, m => ({ conc: parseFloat(m[1]), unit: 'M' })],
  [/(\d+\.?\d*)\s*mM\b/i, m => ({ conc: parseFloat(m[1]), unit: 'mM' })],
];

// Normalization map (extended)
const NORMALIZE_MAP: Record<string, string> = {
  'PEG3350': 'PEG 3350', 'PEG4000': 'PEG 4000', 'PEG6000': 'PEG 6000',
  'PEG8000': 'PEG 8000', 'PEG400': 'PEG 400', 'PEG1500': 'PEG 1500',
  'PEG1000': 'PEG 1000', 'PEG2000': 'PEG 2000', 'PEG200': 'PEG 200',
  'PEG10000': 'PEG 10000', 'PEG20000': 'PEG 20000', 'PEG300': 'PEG 300',
  'PEG500': 'PEG 500', 'PEG550': 'PEG 550', 'PEG600': 'PEG 600',
  'PEG750': 'PEG 750', 'PEG900': 'PEG 900', 'PEG1450': 'PEG 1450',
  'PEG2050': 'PEG 2050', 'PEG3000': 'PEG 3000', 'PEG3400': 'PEG 3400',
  'PEG5000': 'PEG 5000',
  'PEG 4K': 'PEG 4000', 'PEG 8K': 'PEG 8000', 'PEG 6K': 'PEG 6000',
  'PEG 3K': 'PEG 3000', 'PEG 10K': 'PEG 10000', 'PEG 20K': 'PEG 20000',
  'PEG_K': 'PEG',  // fallback, handled in extractPrecipitant
  'peg 3350': 'PEG 3350', 'peg 4000': 'PEG 4000', 'peg 8000': 'PEG 8000',
  'ammonium sulfate': 'Ammonium Sulfate', 'ammonium sulphate': 'Ammonium Sulfate',
  '(NH4)2SO4': 'Ammonium Sulfate', 'AS': 'Ammonium Sulfate',
  'sodium chloride': 'Sodium Chloride', 'NaCl': 'Sodium Chloride',
  'lithium sulfate': 'Lithium Sulfate', 'Li2SO4': 'Lithium Sulfate',
  'mpd': 'MPD', 'Mpd': 'MPD', '2-Methyl-2,4-pentanediol': 'MPD',
  'isopropanol': 'Isopropanol', '2-propanol': 'Isopropanol',
  'sodium citrate': 'Sodium Citrate', 'Na citrate': 'Sodium Citrate',
  'sodium acetate': 'Sodium Acetate', 'sodium formate': 'Sodium Formate',
  'sodium malonate': 'Sodium Malonate',
  'magnesium chloride': 'Magnesium Chloride', 'MgCl2': 'Magnesium Chloride',
  'calcium chloride': 'Calcium Chloride', 'CaCl2': 'Calcium Chloride',
  'zinc acetate': 'Zinc Acetate',
  'potassium phosphate': 'Potassium Phosphate',
  'ethylene glycol': 'Ethylene Glycol',
  // LLM output normalization (discovered in dry-run Phase 3)
  'Natrium Citrate': 'Sodium Citrate', 'trisodium citrate': 'Sodium Citrate',
  'Sodium citrate': 'Sodium Citrate', 'Na3Citrate': 'Sodium Citrate',
  'Sodium formate': 'Sodium Formate', 'sodium formate': 'Sodium Formate',
  'Sodium acetate': 'Sodium Acetate', 'Na acetate': 'Sodium Acetate',
  'Lithium sulfate': 'Lithium Sulfate', 'lithium sulfate': 'Lithium Sulfate',
  'Sodium Maleate': 'Sodium Maleate',
  'potassium-sodium tartrate': 'Potassium Sodium Tartrate',
  'K2HPO4': 'Potassium Phosphate', 'KH2PO4': 'Potassium Phosphate',
  'Na2HPO4': 'Sodium Phosphate', 'NaH2PO4': 'Sodium Phosphate',
  // Buffer misidentification guard — these are buffers, not precipitants
  'imidazole': '__BUFFER__', 'Imidazole': '__BUFFER__',
  'HEPES': '__BUFFER__', 'hepes': '__BUFFER__',
  'Tris': '__BUFFER__', 'tris': '__BUFFER__', 'TRIS': '__BUFFER__',
  'Bis-Tris': '__BUFFER__', 'bis-tris': '__BUFFER__',
  'MES': '__BUFFER__', 'mes': '__BUFFER__',
  'MOPS': '__BUFFER__', 'PIPES': '__BUFFER__',
  'phosphate': '__BUFFER__', // too ambiguous
};

// ─── Util ───
function fmt(n: number) { return n.toLocaleString(); }
function pct(n: number, total: number) { return total > 0 ? (n / total * 100).toFixed(1) + '%' : '0%'; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function extractPrecipitant(detail: string): { type: string; conc?: number; unit?: string } | null {
  for (const [pattern, replacement] of PRECIPITANT_PATTERNS) {
    const match = detail.match(pattern);
    if (match) {
      let type = replacement;
      // Handle captured groups ($1, $2)
      if (type.includes('$1') && match[1]) type = type.replace('$1', match[1]);
      if (type.includes('$2') && match[2]) type = type.replace('$2', match[2]);

      // PEG_K special case: "PEG 4K" → "PEG 4000"
      if (type === 'PEG_K' && match[1]) {
        type = `PEG ${parseInt(match[1]) * 1000}`;
      }

      type = NORMALIZE_MAP[type] || type;

      // Try extracting concentration near the match
      const concResult = extractConcentration(detail, match.index || 0);
      return { type, ...concResult };
    }
  }
  return null;
}

function extractConcentration(text: string, nearIdx: number): { conc?: number; unit?: string } {
  // Look within 50 chars around the match
  const start = Math.max(0, nearIdx - 50);
  const end = Math.min(text.length, nearIdx + 80);
  const region = text.slice(start, end);

  for (const [pattern, extractor] of CONC_PATTERNS) {
    const m = region.match(pattern);
    if (m) {
      const result = extractor(m);
      if (result.conc > 0 && result.conc < 100) return result;
    }
  }
  return {};
}

function normalizePrecipitant(type: string): string {
  return NORMALIZE_MAP[type] || type;
}

// ─── Stats tracker ───
interface PhaseStats {
  scanned: number;
  extracted: number;
  typeCounts: Record<string, number>;
}

function newStats(): PhaseStats {
  return { scanned: 0, extracted: 0, typeCounts: {} };
}

function printTopTypes(stats: PhaseStats, n = 20) {
  const sorted = Object.entries(stats.typeCounts).sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log('\n  Top precipitants:');
  for (const [name, cnt] of sorted) {
    console.log(`    ${name.padEnd(30)} ${fmt(cnt)}`);
  }
}

// ═══════════════════════════════════════════════════════
// Phase 1: Enhanced Regex Extraction
// ═══════════════════════════════════════════════════════
async function phase1_regex(): Promise<PhaseStats> {
  console.log('\n' + '═'.repeat(60));
  console.log('Phase 1: Enhanced Regex Extraction (150+ patterns)');
  console.log('═'.repeat(60));

  const stats = newStats();
  const BATCH = 1000;
  let offset = 0;
  let hasMore = true;
  const updateBatch: { id: number; precipitant_type: string; precipitant_conc?: number; precipitant_unit?: string }[] = [];

  while (hasMore) {
    const { data, error } = await supabase
      .from('kbsi_crystallization')
      .select('id, condition_detail')
      .not('condition_detail', 'is', null)
      .is('precipitant_type', null)
      .order('id')
      .range(offset, offset + BATCH - 1);

    if (error) { console.error('  DB Error:', error.message); break; }
    if (!data || data.length === 0) { hasMore = false; break; }

    stats.scanned += data.length;

    for (const row of data) {
      const result = extractPrecipitant(row.condition_detail || '');
      if (result) {
        const update: any = { id: row.id, precipitant_type: result.type };
        if (result.conc) update.precipitant_conc = result.conc;
        if (result.unit) update.precipitant_unit = result.unit;
        updateBatch.push(update);
        stats.typeCounts[result.type] = (stats.typeCounts[result.type] || 0) + 1;
      }
    }

    // Flush batch updates (every 500 records)
    if (updateBatch.length >= 500) {
      const toFlush = updateBatch.splice(0, 500);
      if (!dryRun) {
        await flushUpdates(toFlush);
      }
      stats.extracted += toFlush.length;
    }

    if (data.length < BATCH) hasMore = false;
    else offset += BATCH;

    if (stats.scanned % 50000 === 0) {
      console.log(`  Progress: ${fmt(stats.scanned)} scanned, ${fmt(updateBatch.length + stats.extracted)} extracted...`);
    }
  }

  // Flush remaining
  if (updateBatch.length > 0) {
    if (!dryRun) {
      await flushUpdates(updateBatch);
    }
    stats.extracted += updateBatch.length;
  }

  console.log(`  Scanned: ${fmt(stats.scanned)}`);
  console.log(`  ${dryRun ? 'Would extract' : 'Extracted'}: ${fmt(stats.extracted)} (${pct(stats.extracted, stats.scanned)})`);
  printTopTypes(stats);
  return stats;
}

async function flushUpdates(batch: { id: number; precipitant_type: string; precipitant_conc?: number; precipitant_unit?: string }[]) {
  // Parallel upsert in chunks of 200 for speed
  const CHUNK = 200;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK);
    await Promise.all(chunk.map(u => {
      const update: any = { precipitant_type: u.precipitant_type };
      if (u.precipitant_conc) update.precipitant_conc = u.precipitant_conc;
      if (u.precipitant_unit) update.precipitant_unit = u.precipitant_unit;
      return supabase.from('kbsi_crystallization').update(update).eq('id', u.id);
    }));
  }
}

// ═══════════════════════════════════════════════════════
// Phase 2: PDB Re-fetch (condition_detail 없는 레코드)
// ═══════════════════════════════════════════════════════
async function phase2_pdbRefetch(): Promise<PhaseStats> {
  console.log('\n' + '═'.repeat(60));
  console.log('Phase 2: PDB Re-fetch (pdbx_details for missing condition_detail)');
  console.log('═'.repeat(60));

  const stats = newStats();

  // Find structures with PDB ID but no precipitant and no condition_detail
  // Join: crystallization → construct → structure (pdb_id)
  const { data: targets, error } = await supabase
    .rpc('get_pdb_ids_missing_precipitant', {});

  // If RPC doesn't exist, fall back to direct query
  if (error || !targets) {
    console.log('  RPC unavailable, using direct query...');
    return await phase2_directQuery(stats);
  }

  console.log(`  Targets: ${fmt(targets.length)} PDB IDs to re-fetch`);

  let fetched = 0;
  let updated = 0;

  // Process in batches with concurrency control
  for (let i = 0; i < targets.length; i += pdbConcurrency) {
    const batch = targets.slice(i, i + pdbConcurrency);

    const results = await Promise.allSettled(
      batch.map(async (t: { pdb_id: string; crystallization_ids: number[] }) => {
        const pdbId = t.pdb_id.toLowerCase();
        const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId}`);
        if (!res.ok) return null;
        const entry = await res.json();
        const details = entry.exptl_crystal_grow?.[0]?.pdbx_details;
        if (!details) return null;

        const extracted = extractPrecipitant(details);
        if (!extracted) return { pdbId, details, ids: t.crystallization_ids, extracted: null };

        return { pdbId, details, ids: t.crystallization_ids, extracted };
      })
    );

    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      fetched++;
      const { ids, extracted, details } = r.value;

      if (extracted) {
        if (!dryRun) {
          for (const id of ids) {
            const update: any = {
              precipitant_type: extracted.type,
              condition_detail: details,
            };
            if (extracted.conc) update.precipitant_conc = extracted.conc;
            if (extracted.unit) update.precipitant_unit = extracted.unit;
            await supabase.from('kbsi_crystallization').update(update).eq('id', id);
          }
        }
        updated += ids.length;
        stats.typeCounts[extracted.type] = (stats.typeCounts[extracted.type] || 0) + ids.length;
      }
    }

    stats.scanned += batch.length;
    if (stats.scanned % 500 === 0) {
      console.log(`  Progress: ${fmt(stats.scanned)}/${fmt(targets.length)} PDB IDs, ${fmt(updated)} records updated...`);
    }

    await sleep(200); // Rate limit PDB API
  }

  stats.extracted = updated;
  console.log(`  Fetched: ${fmt(fetched)} PDB entries with details`);
  console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${fmt(updated)} crystallization records`);
  printTopTypes(stats);
  return stats;
}

async function phase2_directQuery(stats: PhaseStats): Promise<PhaseStats> {
  // Step 1: Get crystallization records missing both precipitant_type and condition_detail
  // Step 2: For each, look up construct_id → structure pdb_id (separate lightweight queries)
  const BATCH = 1000;
  let offset = 0;
  let hasMore = true;
  const seenPdb = new Set<string>();
  const pdbToIds: Record<string, number[]> = {};

  console.log('  Step 1: Collecting crystallization IDs missing precipitant + condition_detail...');

  while (hasMore) {
    const { data, error } = await supabase
      .from('kbsi_crystallization')
      .select('id, construct_id')
      .is('precipitant_type', null)
      .is('condition_detail', null)
      .order('id')
      .range(offset, offset + BATCH - 1);

    if (error) { console.error('  Query error:', error.message); break; }
    if (!data || data.length === 0) { hasMore = false; break; }

    // Collect unique construct_ids to look up pdb_ids
    const constructIds = [...new Set(data.map(r => r.construct_id))];

    // Lookup pdb_id via structure table (lightweight, no deep join)
    const { data: structures } = await supabase
      .from('kbsi_structure')
      .select('construct_id, pdb_id')
      .in('construct_id', constructIds)
      .not('pdb_id', 'is', null);

    if (structures) {
      const constructToPdb: Record<number, string> = {};
      for (const s of structures) {
        if (s.pdb_id) constructToPdb[s.construct_id] = s.pdb_id;
      }

      for (const row of data) {
        const pdbId = constructToPdb[row.construct_id];
        if (pdbId && !seenPdb.has(pdbId)) {
          if (!pdbToIds[pdbId]) pdbToIds[pdbId] = [];
          pdbToIds[pdbId].push(row.id);
        }
      }
    }

    if (data.length < BATCH) hasMore = false;
    else offset += BATCH;

    if (offset % 50000 === 0) {
      console.log(`  Scanned ${fmt(offset)} records, ${Object.keys(pdbToIds).length} unique PDB IDs...`);
    }
  }

  const pdbIds = Object.keys(pdbToIds);
  console.log(`  Step 2: Fetching ${fmt(pdbIds.length)} PDB entries from RCSB API...`);

  // Fetch from PDB API with concurrency control
  for (let i = 0; i < pdbIds.length; i += pdbConcurrency) {
    const batch = pdbIds.slice(i, i + pdbConcurrency);
    await Promise.allSettled(batch.map(async pdbId => {
      seenPdb.add(pdbId);
      const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId.toLowerCase()}`);
      if (!res.ok) return;
      const entry = await res.json();
      const details = entry.exptl_crystal_grow?.[0]?.pdbx_details;
      if (!details) return;

      const extracted = extractPrecipitant(details);
      if (!extracted) return;

      stats.scanned++;
      const ids = pdbToIds[pdbId];
      if (!dryRun) {
        for (const id of ids) {
          await supabase.from('kbsi_crystallization').update({
            precipitant_type: extracted.type,
            condition_detail: details,
            ...(extracted.conc ? { precipitant_conc: extracted.conc } : {}),
            ...(extracted.unit ? { precipitant_unit: extracted.unit } : {}),
          }).eq('id', id);
        }
      }
      stats.extracted += ids.length;
      stats.typeCounts[extracted.type] = (stats.typeCounts[extracted.type] || 0) + ids.length;
    }));
    await sleep(200);

    if ((i / pdbConcurrency) % 100 === 0 && i > 0) {
      console.log(`  PDB fetch: ${fmt(i)}/${fmt(pdbIds.length)}, ${fmt(stats.extracted)} records updated...`);
    }
  }

  console.log(`  PDB IDs queried: ${fmt(seenPdb.size)}`);
  console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${fmt(stats.extracted)} records`);
  printTopTypes(stats);
  return stats;
}

// ═══════════════════════════════════════════════════════
// Phase 3: LLM Batch Extraction (gpt-4o-mini)
// ═══════════════════════════════════════════════════════
async function phase3_llmBatch(): Promise<PhaseStats> {
  console.log('\n' + '═'.repeat(60));
  console.log(`Phase 3: LLM Batch Extraction (limit: ${fmt(llmLimit)})`);
  console.log('═'.repeat(60));

  const stats = newStats();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('  OPENAI_API_KEY not set — skipping Phase 3');
    return stats;
  }

  // Collect records with condition_detail but no precipitant_type (regex failed)
  let records: { id: number; condition_detail: string }[] = [];
  let offset = 0;
  const PAGE = 1000;

  while (records.length < llmLimit) {
    const { data, error } = await supabase
      .from('kbsi_crystallization')
      .select('id, condition_detail')
      .not('condition_detail', 'is', null)
      .is('precipitant_type', null)
      .order('id')
      .range(offset, offset + PAGE - 1);

    if (error || !data || data.length === 0) break;
    records = records.concat(data as any[]);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  records = records.slice(0, llmLimit);
  console.log(`  Target records: ${fmt(records.length)}`);

  if (records.length === 0) {
    console.log('  No records to process.');
    return stats;
  }

  // Process in mini-batches of 20 (parallel LLM calls)
  const LLM_BATCH = 20;
  const PROMPT = `Extract the main precipitant from this crystallization condition text.
Return JSON: {"precipitant_type":"string or null","precipitant_conc":number_or_null,"precipitant_unit":"% or M or mM or null","buffer_type":"string or null","salt_type":"string or null","salt_conc":number_or_null,"additive":"string or null"}
Only extract what is explicitly stated. Use standard chemical names.`;

  for (let i = 0; i < records.length; i += LLM_BATCH) {
    const batch = records.slice(i, i + LLM_BATCH);

    const results = await Promise.allSettled(
      batch.map(async rec => {
        const detail = rec.condition_detail.slice(0, 1000);
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: PROMPT },
              { role: 'user', content: detail },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
            max_tokens: 200,
          }),
        });

        if (!res.ok) return { id: rec.id, parsed: null };
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return { id: rec.id, parsed: null };

        try {
          return { id: rec.id, parsed: JSON.parse(content.trim()) };
        } catch {
          return { id: rec.id, parsed: null };
        }
      })
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { id, parsed } = r.value;
      stats.scanned++;

      if (!parsed?.precipitant_type) continue;

      const precipType = normalizePrecipitant(parsed.precipitant_type);
      if (precipType === '__BUFFER__') continue; // Buffer misidentified as precipitant
      const update: any = { precipitant_type: precipType };
      if (typeof parsed.precipitant_conc === 'number' && !isNaN(parsed.precipitant_conc)) {
        update.precipitant_conc = parsed.precipitant_conc;
      }
      if (parsed.precipitant_unit) update.precipitant_unit = parsed.precipitant_unit;
      if (parsed.buffer_type) update.buffer_type = parsed.buffer_type;
      if (parsed.salt_type) update.salt_type = parsed.salt_type;
      if (typeof parsed.salt_conc === 'number') update.salt_conc = parsed.salt_conc;
      if (parsed.additive) update.additive = parsed.additive;

      if (!dryRun) {
        await supabase.from('kbsi_crystallization').update(update).eq('id', id);
      }
      stats.extracted++;
      stats.typeCounts[precipType] = (stats.typeCounts[precipType] || 0) + 1;
    }

    if ((i / LLM_BATCH) % 10 === 0 && i > 0) {
      console.log(`  Progress: ${fmt(stats.scanned)}/${fmt(records.length)}, extracted: ${fmt(stats.extracted)}...`);
    }

    await sleep(100); // Rate limiting
  }

  console.log(`  Scanned: ${fmt(stats.scanned)}`);
  console.log(`  ${dryRun ? 'Would extract' : 'Extracted'}: ${fmt(stats.extracted)} (${pct(stats.extracted, stats.scanned)})`);
  printTopTypes(stats);
  return stats;
}

// ═══════════════════════════════════════════════════════
// Phase 4: Construct Propagation
// ═══════════════════════════════════════════════════════
async function phase4_propagation(): Promise<PhaseStats> {
  console.log('\n' + '═'.repeat(60));
  console.log('Phase 4: Construct Propagation (success → same construct)');
  console.log('═'.repeat(60));

  const stats = newStats();

  // SQL: For each construct, find the most common precipitant_type among successful
  // crystallization records, then apply it to records of the same construct
  // that are missing precipitant_type.
  // This propagates known conditions within the same construct.

  const BATCH = 1000;
  let offset = 0;
  let hasMore = true;

  // Step 1: Find constructs that have both:
  //   - at least one crystallization WITH precipitant_type
  //   - at least one crystallization WITHOUT precipitant_type
  while (hasMore) {
    const { data, error } = await supabase
      .rpc('propagate_precipitant_batch', { batch_offset: offset, batch_size: BATCH });

    if (error) {
      // RPC may not exist — fall back to manual approach
      if (offset === 0) {
        console.log('  RPC unavailable, using manual propagation...');
        return await phase4_manual(stats);
      }
      break;
    }
    if (!data || data.length === 0) { hasMore = false; break; }

    for (const row of data) {
      if (!dryRun) {
        await supabase
          .from('kbsi_crystallization')
          .update({
            precipitant_type: row.precipitant_type,
            ...(row.precipitant_conc ? { precipitant_conc: row.precipitant_conc } : {}),
            ...(row.precipitant_unit ? { precipitant_unit: row.precipitant_unit } : {}),
          })
          .eq('id', row.target_id);
      }
      stats.extracted++;
      stats.typeCounts[row.precipitant_type] = (stats.typeCounts[row.precipitant_type] || 0) + 1;
    }

    stats.scanned += data.length;
    offset += BATCH;

    if (offset % 10000 === 0) {
      console.log(`  Progress: ${fmt(offset)} processed, ${fmt(stats.extracted)} propagated...`);
    }
  }

  console.log(`  ${dryRun ? 'Would propagate' : 'Propagated'}: ${fmt(stats.extracted)} records`);
  printTopTypes(stats);
  return stats;
}

async function phase4_manual(stats: PhaseStats): Promise<PhaseStats> {
  // Get constructs with mixed precipitant coverage
  const BATCH = 500;
  let offset = 0;
  let hasMore = true;
  const propagated = new Set<number>();

  while (hasMore) {
    // Find crystallization records without precipitant_type
    const { data, error } = await supabase
      .from('kbsi_crystallization')
      .select('id, construct_id')
      .is('precipitant_type', null)
      .order('construct_id')
      .range(offset, offset + BATCH - 1);

    if (error || !data || data.length === 0) { hasMore = false; break; }

    // Group by construct_id
    const byConstruct: Record<number, number[]> = {};
    for (const row of data) {
      if (!byConstruct[row.construct_id]) byConstruct[row.construct_id] = [];
      byConstruct[row.construct_id].push(row.id);
    }

    // For each construct, find the dominant precipitant_type
    for (const [constructIdStr, ids] of Object.entries(byConstruct)) {
      const constructId = parseInt(constructIdStr);
      if (propagated.has(constructId)) {
        stats.extracted += ids.length; // Already know precipitant
        continue;
      }

      const { data: donor } = await supabase
        .from('kbsi_crystallization')
        .select('precipitant_type, precipitant_conc, precipitant_unit')
        .eq('construct_id', constructId)
        .not('precipitant_type', 'is', null)
        .limit(1);

      if (!donor || donor.length === 0) continue;

      const d = donor[0];
      propagated.add(constructId);

      if (!dryRun) {
        // Bulk update all IDs for this construct
        for (const id of ids) {
          const update: any = { precipitant_type: d.precipitant_type };
          if (d.precipitant_conc) update.precipitant_conc = d.precipitant_conc;
          if (d.precipitant_unit) update.precipitant_unit = d.precipitant_unit;
          await supabase.from('kbsi_crystallization').update(update).eq('id', id);
        }
      }

      stats.extracted += ids.length;
      stats.typeCounts[d.precipitant_type] = (stats.typeCounts[d.precipitant_type] || 0) + ids.length;
    }

    stats.scanned += data.length;
    if (data.length < BATCH) hasMore = false;
    else offset += BATCH;

    if (offset % 10000 === 0) {
      console.log(`  Progress: ${fmt(offset)} scanned, ${fmt(stats.extracted)} propagated (${propagated.size} constructs)...`);
    }
  }

  console.log(`  Constructs with donors: ${fmt(propagated.size)}`);
  console.log(`  ${dryRun ? 'Would propagate' : 'Propagated'}: ${fmt(stats.extracted)} records`);
  printTopTypes(stats);
  return stats;
}

// ═══════════════════════════════════════════════════════
// Normalize existing (cleanup pass)
// ═══════════════════════════════════════════════════════
async function normalizeAll() {
  console.log('\n--- Normalization pass ---');
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
      if ((c ?? 0) > 10) console.log(`  ${raw} → ${norm}: ${c} records`);
      totalNormalized += c ?? 0;
    }
  }
  console.log(`  ${dryRun ? 'Would normalize' : 'Normalized'}: ${fmt(totalNormalized)} records`);
}

// ═══════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════
async function main() {
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║  Precipitant Enrichment v2 — Target: 50% Coverage        ║');
  console.log('║  Phases: ' + phases.join(', ').padEnd(48) + '║');
  console.log('║  Mode: ' + (dryRun ? 'DRY RUN' : 'LIVE').padEnd(50) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  // Initial coverage
  const { count: totalBefore } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true });
  const { count: withPrecipBefore } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .not('precipitant_type', 'is', null);

  console.log(`\nBefore: ${fmt(withPrecipBefore ?? 0)}/${fmt(totalBefore ?? 0)} (${pct(withPrecipBefore ?? 0, totalBefore ?? 1)})`);
  const target50 = Math.ceil((totalBefore ?? 0) * 0.5);
  console.log(`Target 50%: ${fmt(target50)} records need precipitant`);
  console.log(`Gap: ${fmt(target50 - (withPrecipBefore ?? 0))} records to fill`);

  const allStats: Record<string, PhaseStats> = {};

  // Phase 1 (Regex) + Phase 2 (PDB) are independent → run in parallel
  const parallelPhases: Promise<void>[] = [];
  if (phases.includes(1)) {
    parallelPhases.push(phase1_regex().then(s => { allStats['Phase 1 (Regex)'] = s; }));
  }
  if (phases.includes(2)) {
    parallelPhases.push(phase2_pdbRefetch().then(s => { allStats['Phase 2 (PDB)'] = s; }));
  }
  if (parallelPhases.length > 0) {
    console.log(`\n  >> Running Phase ${[phases.includes(1) && '1', phases.includes(2) && '2'].filter(Boolean).join(' + ')} in parallel...`);
    await Promise.all(parallelPhases);
  }

  // Phase 3 (LLM) depends on 1+2 results (processes remaining nulls)
  if (phases.includes(3)) allStats['Phase 3 (LLM)'] = await phase3_llmBatch();
  // Phase 4 (Propagation) depends on all prior phases
  if (phases.includes(4)) allStats['Phase 4 (Propagation)'] = await phase4_propagation();

  // Normalize all
  await normalizeAll();

  // Final coverage
  const { count: totalAfter } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true });
  const { count: withPrecipAfter } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .not('precipitant_type', 'is', null);

  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  for (const [name, s] of Object.entries(allStats)) {
    console.log(`  ${name}: +${fmt(s.extracted)} records`);
  }

  const totalAdded = Object.values(allStats).reduce((sum, s) => sum + s.extracted, 0);
  console.log(`\n  Total added: +${fmt(totalAdded)}`);
  console.log(`  Before: ${fmt(withPrecipBefore ?? 0)} (${pct(withPrecipBefore ?? 0, totalBefore ?? 1)})`);

  if (dryRun) {
    const projected = (withPrecipBefore ?? 0) + totalAdded;
    console.log(`  Projected: ${fmt(projected)} (${pct(projected, totalAfter ?? 1)})`);
    if (projected >= target50) {
      console.log(`  >>> 50% TARGET ACHIEVABLE <<<`);
    } else {
      console.log(`  Remaining gap: ${fmt(target50 - projected)} records`);
    }
  } else {
    console.log(`  After: ${fmt(withPrecipAfter ?? 0)} (${pct(withPrecipAfter ?? 0, totalAfter ?? 1)})`);
    if ((withPrecipAfter ?? 0) >= target50) {
      console.log(`  >>> 50% TARGET ACHIEVED <<<`);
    } else {
      console.log(`  Remaining gap: ${fmt(target50 - (withPrecipAfter ?? 0))} records`);
    }
  }
}

main().catch(console.error);
