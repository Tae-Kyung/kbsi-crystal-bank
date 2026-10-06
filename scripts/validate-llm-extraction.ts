/**
 * LLM 추출 데이터 품질 검증 스크립트
 *
 * npx tsx scripts/validate-llm-extraction.ts [옵션]
 *   --dry-run    보고만 (삭제 안 함, 기본값)
 *   --fix        잘못된 데이터 삭제
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const dryRun = !args.includes('--fix');

if (dryRun) {
  console.log('[mode] dry-run (use --fix to delete invalid entries)\n');
} else {
  console.log('[mode] FIX — will delete invalid entries\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

async function fetchAll<T>(
  table: string,
  select: string,
  filter: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1);
    for (const [k, v] of Object.entries(filter)) {
      q = q.eq(k, v);
    }
    const { data, error } = await q;
    if (error) throw new Error(`${table} query error: ${error.message}`);
    if (!data || data.length === 0) break;
    results.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return results;
}

async function deleteRows(table: string, ids: number[]): Promise<number> {
  if (ids.length === 0 || dryRun) return 0;
  let deleted = 0;
  // batch delete in chunks of 200
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .in('id', chunk);
    if (error) console.error(`  delete error: ${error.message}`);
    deleted += count ?? chunk.length;
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// 1. Expression validation
// ---------------------------------------------------------------------------

interface ExpressionRow {
  id: number;
  host: string | null;
  strain: string | null;
  induction_temp: number | null;
  yield_mg_l: number | null;
  result_level: string | null;
  conditions: string | null;
}

const KNOWN_HOSTS = [
  'e. coli', 'escherichia coli',
  'insect cells', 'insect', 'sf9', 'sf21', 'hi5', 'high five', 'trichoplusia ni',
  'hek293', 'hek-293', 'hek293t', 'hek293f', 'hek293s',
  'cho', 'cho-k1',
  'yeast', 'pichia pastoris', 'saccharomyces cerevisiae', 'komagataella phaffii',
  'mammalian cells', 'mammalian', 'cos-7', 'cos7',
  'baculovirus', 'expi293', 'expi293f',
  'hela', 'jurkat',
  'cell-free', 'wheat germ', 'ivtt',
  'tobacco', 'nicotiana benthamiana', 'plant',
];

const VALID_RESULT_LEVELS = ['no_expression', 'insoluble', 'low', 'moderate', 'high'];

async function validateExpression() {
  console.log('--- Expression Validation ---');
  const rows = await fetchAll<ExpressionRow>(
    'kbsi_expression',
    'id, host, strain, induction_temp, yield_mg_l, result_level, conditions',
    { source_db: 'PubMed' }
  );
  const total = rows.length;
  console.log(`  Total PubMed entries: ${total}`);
  if (total === 0) return { total: 0 };

  // Coverage
  const withHost = rows.filter(r => r.host != null).length;
  const withStrain = rows.filter(r => r.strain != null).length;
  const withTemp = rows.filter(r => r.induction_temp != null).length;
  const withYield = rows.filter(r => r.yield_mg_l != null).length;
  const withConditions = rows.filter(r => r.conditions != null).length;
  const withResult = rows.filter(r => r.result_level != null).length;

  // Invalid hosts
  const invalidHosts: { id: number; host: string }[] = [];
  for (const r of rows) {
    if (r.host == null) continue;
    const lower = r.host.toLowerCase().trim();
    const matched = KNOWN_HOSTS.some(kh => lower.includes(kh));
    if (!matched) invalidHosts.push({ id: r.id, host: r.host });
  }

  // Outlier temps (outside 4-42 C)
  const outlierTemps: { id: number; temp: number }[] = [];
  for (const r of rows) {
    if (r.induction_temp == null) continue;
    if (r.induction_temp < 4 || r.induction_temp > 42) {
      outlierTemps.push({ id: r.id, temp: r.induction_temp });
    }
  }

  // Outlier yields (outside 0.01-500)
  const outlierYields: { id: number; yield: number }[] = [];
  for (const r of rows) {
    if (r.yield_mg_l == null) continue;
    if (r.yield_mg_l < 0.01 || r.yield_mg_l > 500) {
      outlierYields.push({ id: r.id, yield: r.yield_mg_l });
    }
  }

  // Invalid result_level
  const invalidResults: { id: number; level: string }[] = [];
  for (const r of rows) {
    if (r.result_level == null) continue;
    if (!VALID_RESULT_LEVELS.includes(r.result_level)) {
      invalidResults.push({ id: r.id, level: r.result_level });
    }
  }

  console.log(`  host coverage:       ${withHost}/${total} (${pct(withHost, total)})`);
  console.log(`  strain coverage:     ${withStrain}/${total} (${pct(withStrain, total)})`);
  console.log(`  induction_temp:      ${withTemp}/${total} (${pct(withTemp, total)})`);
  console.log(`  yield_mg_l:          ${withYield}/${total} (${pct(withYield, total)})`);
  console.log(`  result_level:        ${withResult}/${total} (${pct(withResult, total)})`);
  console.log(`  conditions:          ${withConditions}/${total} (${pct(withConditions, total)})`);
  console.log(`  invalid hosts:       ${invalidHosts.length}`);
  if (invalidHosts.length > 0 && invalidHosts.length <= 20) {
    for (const h of invalidHosts) console.log(`    id=${h.id} host="${h.host}"`);
  } else if (invalidHosts.length > 20) {
    for (const h of invalidHosts.slice(0, 20)) console.log(`    id=${h.id} host="${h.host}"`);
    console.log(`    ... and ${invalidHosts.length - 20} more`);
  }
  console.log(`  outlier temps:       ${outlierTemps.length}`);
  if (outlierTemps.length > 0) {
    for (const t of outlierTemps.slice(0, 10)) console.log(`    id=${t.id} temp=${t.temp}`);
    if (outlierTemps.length > 10) console.log(`    ... and ${outlierTemps.length - 10} more`);
  }
  console.log(`  outlier yields:      ${outlierYields.length}`);
  if (outlierYields.length > 0) {
    for (const y of outlierYields.slice(0, 10)) console.log(`    id=${y.id} yield=${y.yield}`);
    if (outlierYields.length > 10) console.log(`    ... and ${outlierYields.length - 10} more`);
  }
  console.log(`  invalid results:     ${invalidResults.length}`);
  if (invalidResults.length > 0) {
    for (const r of invalidResults.slice(0, 10)) console.log(`    id=${r.id} level="${r.level}"`);
  }
  console.log();

  return {
    total,
    coverage: { host: withHost, strain: withStrain, temp: withTemp, yield: withYield, conditions: withConditions, result: withResult },
    errors: { invalidHosts: invalidHosts.length, outlierTemps: outlierTemps.length, outlierYields: outlierYields.length, invalidResults: invalidResults.length },
  };
}

// ---------------------------------------------------------------------------
// 2. Characterization validation
// ---------------------------------------------------------------------------

interface CharRow {
  id: number;
  method: string;
  value_num: number | null;
  unit_normalized: string | null;
  unit_raw: string | null;
}

const VALID_METHODS = [
  'DLS', 'SEC', 'SEC-MALS', 'SDS-PAGE', 'Mass Spec',
  'thermal_stability', 'CD', 'Western blot', 'SPR', 'ITC',
];

const METHOD_RANGES: Record<string, { min: number; max: number; unit?: string }> = {
  'DLS':               { min: 0.5,  max: 50,     unit: 'nm' },
  'SEC':               { min: 5,    max: 1000,   unit: 'kDa' },
  'SEC-MALS':          { min: 5,    max: 1000,   unit: 'kDa' },
  'SDS-PAGE':          { min: 50,   max: 100,    unit: '%' },
  'thermal_stability': { min: 20,   max: 100,    unit: '°C' },
  'Mass Spec':         { min: 1000, max: 500000, unit: 'Da' },
};

// Methods that are not really characterization — delete on --fix
const METHODS_TO_DELETE = ['Western blot'];

// Bad unit combos to delete
function isBadUnitCombo(method: string, unit: string | null): boolean {
  if (!unit) return false;
  const u = unit.toLowerCase().trim();
  // SEC with angstrom unit is wrong
  if ((method === 'SEC' || method === 'SEC-MALS') && (u === 'å' || u === 'angstrom' || u === 'a')) return true;
  return false;
}

async function validateCharacterization() {
  console.log('--- Characterization Validation ---');
  const rows = await fetchAll<CharRow>(
    'kbsi_characterization',
    'id, method, value_num, unit_normalized, unit_raw',
    { source_db: 'PubMed' }
  );
  const total = rows.length;
  console.log(`  Total PubMed entries: ${total}`);
  if (total === 0) return { total: 0 };

  // Method distribution
  const methodCounts: Record<string, number> = {};
  for (const r of rows) {
    methodCounts[r.method] = (methodCounts[r.method] || 0) + 1;
  }

  // Invalid methods
  const invalidMethodRows: CharRow[] = [];
  for (const r of rows) {
    if (!VALID_METHODS.includes(r.method)) {
      invalidMethodRows.push(r);
    }
  }
  const validMethodCount = total - invalidMethodRows.length;

  // Out-of-range values
  const outOfRange: { id: number; method: string; value: number }[] = [];
  for (const r of rows) {
    if (r.value_num == null) continue;
    const range = METHOD_RANGES[r.method];
    if (!range) continue;
    if (r.value_num < range.min || r.value_num > range.max) {
      outOfRange.push({ id: r.id, method: r.method, value: r.value_num });
    }
  }

  // Entries to delete: wrong methods + bad unit combos
  const toDeleteIds = new Set<number>();
  const deleteReasons: { id: number; reason: string }[] = [];

  for (const r of rows) {
    if (METHODS_TO_DELETE.includes(r.method)) {
      toDeleteIds.add(r.id);
      deleteReasons.push({ id: r.id, reason: `method=${r.method} (not characterization)` });
    }
    if (isBadUnitCombo(r.method, r.unit_normalized) || isBadUnitCombo(r.method, r.unit_raw)) {
      toDeleteIds.add(r.id);
      deleteReasons.push({ id: r.id, reason: `${r.method} with unit=${r.unit_normalized || r.unit_raw}` });
    }
  }

  console.log(`  valid methods:       ${validMethodCount}/${total} (${pct(validMethodCount, total)})`);
  console.log(`  invalid methods:     ${invalidMethodRows.length}`);
  if (invalidMethodRows.length > 0) {
    const inv: Record<string, number> = {};
    for (const r of invalidMethodRows) inv[r.method] = (inv[r.method] || 0) + 1;
    for (const [m, c] of Object.entries(inv).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`    "${m}": ${c}`);
    }
  }
  console.log(`  out-of-range values: ${outOfRange.length}`);
  if (outOfRange.length > 0) {
    for (const o of outOfRange.slice(0, 10)) {
      const range = METHOD_RANGES[o.method];
      console.log(`    id=${o.id} ${o.method}=${o.value} (expected ${range.min}-${range.max})`);
    }
    if (outOfRange.length > 10) console.log(`    ... and ${outOfRange.length - 10} more`);
  }
  console.log(`  method distribution:`);
  for (const [m, c] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${m}: ${c}`);
  }

  // Deletions
  console.log(`  entries to delete:   ${toDeleteIds.size}`);
  if (deleteReasons.length > 0) {
    for (const d of deleteReasons.slice(0, 10)) console.log(`    id=${d.id} — ${d.reason}`);
    if (deleteReasons.length > 10) console.log(`    ... and ${deleteReasons.length - 10} more`);
  }

  const deletedCount = await deleteRows('kbsi_characterization', [...toDeleteIds]);
  if (!dryRun && deletedCount > 0) {
    console.log(`  ** DELETED ${deletedCount} rows **`);
  }
  console.log();

  return {
    total,
    validMethods: validMethodCount,
    invalidMethods: invalidMethodRows.length,
    outOfRange: outOfRange.length,
    deleted: dryRun ? 0 : deletedCount,
    toDelete: toDeleteIds.size,
  };
}

// ---------------------------------------------------------------------------
// 3. Diffraction validation
// ---------------------------------------------------------------------------

interface DiffRow {
  id: number;
  resolution: number | null;
  space_group: string | null;
  beamline: string | null;
  phasing: string | null;
}

// Common space groups (covers ~95% of PDB)
const KNOWN_SPACE_GROUPS = new Set([
  // Triclinic
  'P 1',
  // Monoclinic
  'P 2', 'P 21', 'C 2', 'C 1 2 1', 'P 1 21 1', 'P 1 2 1',
  // Orthorhombic
  'P 2 2 2', 'P 21 21 21', 'P 21 21 2', 'P 21 2 21', 'P 2 21 21',
  'C 2 2 21', 'C 2 2 2', 'I 2 2 2', 'I 21 21 21',
  'F 2 2 2',
  // Tetragonal
  'P 4', 'P 41', 'P 42', 'P 43',
  'P 4 2 2', 'P 41 2 2', 'P 41 21 2', 'P 42 21 2', 'P 43 21 2', 'P 43 2 2', 'P 42 2 2',
  'I 4', 'I 41', 'I 4 2 2', 'I 41 2 2',
  // Trigonal
  'P 3', 'P 31', 'P 32',
  'P 3 1 2', 'P 3 2 1', 'P 31 1 2', 'P 31 2 1', 'P 32 1 2', 'P 32 2 1',
  'R 3', 'R 32', 'R 3 2', 'H 3', 'H 32', 'H 3 2',
  // Hexagonal
  'P 6', 'P 61', 'P 62', 'P 63', 'P 64', 'P 65',
  'P 6 2 2', 'P 61 2 2', 'P 62 2 2', 'P 63 2 2', 'P 64 2 2', 'P 65 2 2',
  // Cubic
  'P 2 3', 'P 21 3', 'I 2 3', 'I 21 3', 'F 2 3',
  'P 4 3 2', 'P 41 3 2', 'P 42 3 2', 'P 43 3 2',
  'I 4 3 2', 'I 41 3 2', 'F 4 3 2', 'F 41 3 2',
]);

function normalizeSpaceGroup(sg: string): string {
  // Normalize to standard format: uppercase, single spaces
  return sg.replace(/\s+/g, ' ').trim().toUpperCase()
    // Convert common variants: P212121 -> P 21 21 21
    .replace(/^([PCIFHR])(\d)/, '$1 $2');
}

function isKnownSpaceGroup(sg: string): boolean {
  const norm = normalizeSpaceGroup(sg);
  // Direct match
  if (KNOWN_SPACE_GROUPS.has(norm)) return true;
  // Try uppercase match against set
  for (const known of KNOWN_SPACE_GROUPS) {
    if (known.toUpperCase() === norm) return true;
    // Also try without spaces
    if (known.replace(/\s/g, '') === sg.replace(/\s/g, '').toUpperCase()) return true;
  }
  return false;
}

async function validateDiffraction() {
  console.log('--- Diffraction Validation ---');
  const rows = await fetchAll<DiffRow>(
    'kbsi_diffraction',
    'id, resolution, space_group, beamline, phasing',
    { source_db: 'PubMed' }
  );
  const total = rows.length;
  console.log(`  Total PubMed entries: ${total}`);
  if (total === 0) return { total: 0 };

  const withResolution = rows.filter(r => r.resolution != null).length;
  const withSpaceGroup = rows.filter(r => r.space_group != null).length;
  const withBeamline = rows.filter(r => r.beamline != null).length;
  const withPhasing = rows.filter(r => r.phasing != null).length;

  // Resolution outliers (outside 0.5-10 A)
  const outlierRes: { id: number; res: number }[] = [];
  for (const r of rows) {
    if (r.resolution == null) continue;
    if (r.resolution < 0.5 || r.resolution > 10) {
      outlierRes.push({ id: r.id, res: r.resolution });
    }
  }

  // Invalid space groups
  const invalidSG: { id: number; sg: string }[] = [];
  for (const r of rows) {
    if (r.space_group == null) continue;
    if (!isKnownSpaceGroup(r.space_group)) {
      invalidSG.push({ id: r.id, sg: r.space_group });
    }
  }

  console.log(`  resolution coverage: ${withResolution}/${total} (${pct(withResolution, total)})`);
  console.log(`  space_group:         ${withSpaceGroup}/${total} (${pct(withSpaceGroup, total)})`);
  console.log(`  beamline:            ${withBeamline}/${total} (${pct(withBeamline, total)})`);
  console.log(`  phasing:             ${withPhasing}/${total} (${pct(withPhasing, total)})`);
  console.log(`  outlier resolutions: ${outlierRes.length}`);
  if (outlierRes.length > 0) {
    for (const o of outlierRes.slice(0, 10)) console.log(`    id=${o.id} resolution=${o.res} A`);
    if (outlierRes.length > 10) console.log(`    ... and ${outlierRes.length - 10} more`);
  }
  console.log(`  invalid space groups:${invalidSG.length}`);
  if (invalidSG.length > 0) {
    for (const s of invalidSG.slice(0, 10)) console.log(`    id=${s.id} sg="${s.sg}"`);
    if (invalidSG.length > 10) console.log(`    ... and ${invalidSG.length - 10} more`);
  }
  console.log();

  return {
    total,
    coverage: { resolution: withResolution, spaceGroup: withSpaceGroup, beamline: withBeamline, phasing: withPhasing },
    errors: { outlierRes: outlierRes.length, invalidSG: invalidSG.length },
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function pct(n: number, total: number): string {
  if (total === 0) return '0.0%';
  return (n / total * 100).toFixed(1) + '%';
}

async function main() {
  console.log('=== LLM Extraction Quality Report ===\n');

  const expr = await validateExpression();
  const char = await validateCharacterization();
  const diff = await validateDiffraction();

  // Overall accuracy estimate
  const totalEntries = (expr.total || 0) + (char.total || 0) + (diff.total || 0);
  let totalErrors = 0;
  if (expr.total) {
    totalErrors += (expr.errors?.invalidHosts || 0)
      + (expr.errors?.outlierTemps || 0)
      + (expr.errors?.outlierYields || 0)
      + (expr.errors?.invalidResults || 0);
  }
  if (char.total) {
    totalErrors += (char.invalidMethods || 0) + (char.outOfRange || 0) + (char.toDelete || 0);
  }
  if (diff.total) {
    totalErrors += (diff.errors?.outlierRes || 0) + (diff.errors?.invalidSG || 0);
  }

  console.log('=== Summary ===');
  console.log(`  Expression entries:        ${expr.total || 0}`);
  console.log(`  Characterization entries:  ${char.total || 0}`);
  console.log(`  Diffraction entries:       ${diff.total || 0}`);
  console.log(`  Total entries:             ${totalEntries}`);
  console.log(`  Total errors/warnings:     ${totalErrors}`);
  if (totalEntries > 0) {
    const accuracy = ((totalEntries - totalErrors) / totalEntries * 100).toFixed(1);
    console.log(`  Overall accuracy estimate: ${accuracy}%`);
  }
  if (!dryRun) {
    console.log(`  Characterization deleted:  ${char.deleted || 0}`);
  } else {
    console.log(`  Would delete (char):       ${char.toDelete || 0}`);
  }
  console.log(`\nMode: ${dryRun ? 'DRY-RUN (no changes)' : 'FIX (deletions applied)'}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
