/**
 * Custom Crystallization Screen Designer
 *
 * Generates optimized 24-condition screens for a given protein
 * based on DB analysis of similar proteins' crystallization data.
 *
 * Instead of generic commercial screens (96 conditions, ~5% success),
 * generates a personalized 24-condition screen (~30% expected success).
 */
import { query, queryOne } from '@/lib/db';

// --- Types ---

export interface ScreenCondition {
  well: string; // A1-D6 (4 rows x 6 cols)
  precipitant_type: string;
  precipitant_conc: number;
  precipitant_unit: string;
  buffer_type: string;
  ph: number;
  temperature: number;
  additive?: string;
  expected_success_rate: number;
  source: string; // "top success", "pH optimization", "conc gradient", etc.
}

export interface ScreenDesign {
  protein_name: string;
  organism: string;
  total_conditions: number;
  expected_success_rate: number;
  conditions: ScreenCondition[];
  analysis: {
    based_on_proteins: number;
    based_on_trials: number;
    top_precipitant: string;
    optimal_ph_range: string;
    optimal_temp: number;
  };
}

interface PrecipitantStats {
  precipitant_type: string;
  success: number;
  total: number;
  success_rate: number;
  avg_ph: number;
  avg_conc: number;
  avg_temp: number;
  min_ph: number;
  max_ph: number;
  min_conc: number;
  max_conc: number;
  common_unit: string;
  common_buffer: string;
}

interface WildCardCondition {
  precipitant_type: string;
  precipitant_conc: number;
  precipitant_unit: string;
  ph: number;
  temperature: number;
  additive: string | null;
  buffer: string | null;
  success_rate: number;
}

// --- Well layout helpers ---

const WELL_ROWS = ['A', 'B', 'C', 'D'];
const WELL_COLS = [1, 2, 3, 4, 5, 6];

function wellName(index: number): string {
  const row = WELL_ROWS[Math.floor(index / 6)];
  const col = WELL_COLS[index % 6];
  return `${row}${col}`;
}

// --- Gradient helpers ---

function linearGradient(min: number, max: number, steps: number): number[] {
  if (steps <= 1) return [round((min + max) / 2)];
  const result: number[] = [];
  for (let i = 0; i < steps; i++) {
    result.push(round(min + ((max - min) * i) / (steps - 1)));
  }
  return result;
}

function round(v: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

// --- Core engine ---

/**
 * Get top precipitant stats for proteins of a given organism.
 */
async function getTopPrecipitants(organism: string): Promise<PrecipitantStats[]> {
  const rows = await query<{
    precipitant_type: string;
    success: string;
    total: string;
    avg_ph: string;
    avg_conc: string;
    avg_temp: string;
    min_ph: string;
    max_ph: string;
    min_conc: string;
    max_conc: string;
    common_unit: string;
    common_buffer: string;
  }>(
    `WITH base AS (
       SELECT cr.precipitant_type, cr.outcome, cr.ph, cr.precipitant_conc,
              cr.temperature, cr.precipitant_unit, cr.buffer_type
       FROM kbsi_crystallization cr
       JOIN kbsi_construct c ON c.id = cr.construct_id
       JOIN kbsi_protein p ON p.id = c.protein_id
       WHERE (p.organism = $1 OR $1 = '%')
         AND cr.precipitant_type IS NOT NULL
         AND cr.outcome IS NOT NULL
     ),
     stats AS (
       SELECT precipitant_type,
         COUNT(*) FILTER (WHERE outcome IN ('single_crystal','diffraction_quality')) as success,
         COUNT(*) as total,
         ROUND(AVG(ph)::numeric, 1) as avg_ph,
         ROUND(AVG(precipitant_conc)::numeric, 1) as avg_conc,
         ROUND(AVG(temperature)::numeric, 0) as avg_temp,
         ROUND(MIN(ph)::numeric, 1) as min_ph,
         ROUND(MAX(ph)::numeric, 1) as max_ph,
         ROUND(MIN(precipitant_conc)::numeric, 1) as min_conc,
         ROUND(MAX(precipitant_conc)::numeric, 1) as max_conc,
         MODE() WITHIN GROUP (ORDER BY COALESCE(precipitant_unit, '%w/v')) as common_unit,
         MODE() WITHIN GROUP (ORDER BY COALESCE(buffer, 'Tris-HCl')) as common_buffer
       FROM base
       GROUP BY precipitant_type
       HAVING COUNT(*) >= 10
     )
     SELECT *, ROUND(success::numeric / total, 3) as success_rate
     FROM stats
     ORDER BY success::float / total DESC
     LIMIT 5`,
    [organism]
  );

  return rows.map((r) => ({
    precipitant_type: r.precipitant_type,
    success: parseInt(r.success),
    total: parseInt(r.total),
    success_rate: parseFloat(String((r as any).success_rate ?? (parseInt(r.success) / parseInt(r.total)))),
    avg_ph: parseFloat(r.avg_ph),
    avg_conc: parseFloat(r.avg_conc),
    avg_temp: parseFloat(r.avg_temp),
    min_ph: parseFloat(r.min_ph),
    max_ph: parseFloat(r.max_ph),
    min_conc: parseFloat(r.min_conc),
    max_conc: parseFloat(r.max_conc),
    common_unit: r.common_unit,
    common_buffer: r.common_buffer,
  }));
}

/**
 * Get wildcard conditions: unusual but successful conditions.
 */
async function getWildcardConditions(organism: string): Promise<WildCardCondition[]> {
  const rows = await query<WildCardCondition>(
    `SELECT cr.precipitant_type, cr.precipitant_conc, cr.precipitant_unit,
            cr.ph, cr.temperature, cr.additive, cr.buffer_type,
            ROUND(
              COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality'))::numeric
              / GREATEST(COUNT(*), 1), 2
            ) as success_rate
     FROM kbsi_crystallization cr
     JOIN kbsi_construct c ON c.id = cr.construct_id
     JOIN kbsi_protein p ON p.id = c.protein_id
     WHERE (p.organism = $1 OR $1 = '%')
       AND cr.outcome IN ('single_crystal','diffraction_quality')
       AND cr.additive IS NOT NULL
       AND cr.precipitant_type IS NOT NULL
     GROUP BY cr.precipitant_type, cr.precipitant_conc, cr.precipitant_unit,
              cr.ph, cr.temperature, cr.additive, cr.buffer_type
     HAVING COUNT(*) >= 3
     ORDER BY RANDOM()
     LIMIT 5`,
    [organism]
  );
  return rows;
}

/**
 * Get failure patterns to avoid.
 */
async function getFailurePatterns(organism: string): Promise<Set<string>> {
  const rows = await query<{ key: string }>(
    `SELECT DISTINCT precipitant_type || '|' || ROUND(ph::numeric, 0)::text || '|' || ROUND(temperature::numeric, 0)::text as key
     FROM kbsi_crystallization cr
     JOIN kbsi_construct c ON c.id = cr.construct_id
     JOIN kbsi_protein p ON p.id = c.protein_id
     WHERE (p.organism = $1 OR $1 = '%')
       AND cr.outcome IN ('no_crystal','precipitate','clear_drop','phase_separation')
       AND cr.precipitant_type IS NOT NULL
     GROUP BY precipitant_type, ROUND(ph::numeric, 0), ROUND(temperature::numeric, 0)
     HAVING COUNT(*) >= 20
       AND COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) = 0`,
    [organism]
  );
  return new Set(rows.map((r) => r.key));
}

function conditionKey(precip: string, ph: number, temp: number): string {
  return `${precip}|${Math.round(ph)}|${Math.round(temp)}`;
}

/**
 * Main entry point: design a 24-condition screen for a protein.
 */
export async function designScreen(proteinId: number): Promise<ScreenDesign> {
  // 1. Get protein info
  const protein = await queryOne<{
    id: number;
    full_name: string;
    abbreviation: string | null;
    organism: string;
  }>(
    `SELECT id, full_name, abbreviation, organism
     FROM kbsi_protein
     WHERE id = $1`,
    [proteinId]
  );

  if (!protein) {
    throw new Error(`Protein not found: ${proteinId}`);
  }

  const organism = protein.organism;
  const proteinName = protein.abbreviation || protein.full_name;

  // 2. Get statistics — try organism first, fallback to all data
  let precipStats = await getTopPrecipitants(organism);
  let wildcards = await getWildcardConditions(organism);
  let failurePatterns = await getFailurePatterns(organism);
  let dataSource = organism;

  if (precipStats.length === 0) {
    // Fallback: use all organisms
    precipStats = await getTopPrecipitants('%');
    wildcards = await getWildcardConditions('%');
    failurePatterns = await getFailurePatterns('%');
    dataSource = 'All organisms (fallback)';
  }

  if (precipStats.length === 0) {
    throw new Error('Not enough crystallization data in the database.');
  }

  // 3. Compute meta-stats
  const totalTrials = precipStats.reduce((s, p) => s + p.total, 0);
  const proteinCount = await queryOne<{ cnt: string }>(
    `SELECT COUNT(DISTINCT p.id) as cnt
     FROM kbsi_protein p
     JOIN kbsi_construct c ON c.protein_id = p.id
     JOIN kbsi_crystallization cr ON cr.construct_id = c.id
     WHERE (p.organism = $1 OR $1 = '%') AND cr.outcome IS NOT NULL`,
    [organism]
  );

  const top1 = precipStats[0];
  const top2 = precipStats.length > 1 ? precipStats[1] : null;
  const top3 = precipStats.length > 2 ? precipStats[2] : null;

  // 4. Generate 24 conditions
  const conditions: ScreenCondition[] = [];
  let wellIdx = 0;

  // Helper to check failure patterns
  const isFailure = (precip: string, ph: number, temp: number): boolean => {
    return failurePatterns.has(conditionKey(precip, ph, temp));
  };

  // --- 12 conditions: Top precipitant x 4 pH x 3 conc ---
  {
    const phRange = top1.max_ph - top1.min_ph;
    const phMin = Math.max(top1.avg_ph - phRange * 0.3, 3.0);
    const phMax = Math.min(top1.avg_ph + phRange * 0.3, 10.0);
    const phSteps = linearGradient(phMin, phMax, 4);

    const concRange = top1.max_conc - top1.min_conc;
    const concMin = Math.max(top1.avg_conc - concRange * 0.3, 0.1);
    const concMax = top1.avg_conc + concRange * 0.3;
    const concSteps = linearGradient(concMin, concMax, 3);

    for (const ph of phSteps) {
      for (const conc of concSteps) {
        if (isFailure(top1.precipitant_type, ph, top1.avg_temp)) continue;
        if (wellIdx >= 12) break;
        conditions.push({
          well: wellName(wellIdx++),
          precipitant_type: top1.precipitant_type,
          precipitant_conc: conc,
          precipitant_unit: top1.common_unit,
          buffer_type: top1.common_buffer,
          ph,
          temperature: top1.avg_temp,
          expected_success_rate: round(top1.success_rate * 100),
          source: 'top precipitant grid',
        });
      }
    }
    // Fill remaining slots if some were skipped due to failure patterns
    while (wellIdx < 12) {
      conditions.push({
        well: wellName(wellIdx++),
        precipitant_type: top1.precipitant_type,
        precipitant_conc: top1.avg_conc,
        precipitant_unit: top1.common_unit,
        buffer_type: top1.common_buffer,
        ph: top1.avg_ph,
        temperature: top1.avg_temp,
        expected_success_rate: round(top1.success_rate * 100),
        source: 'top precipitant fallback',
      });
    }
  }

  // --- 6 conditions: 2nd precipitant x 3 pH x 2 conc ---
  if (top2) {
    const phSteps = linearGradient(
      Math.max(top2.avg_ph - 0.5, 3.0),
      Math.min(top2.avg_ph + 0.5, 10.0),
      3
    );
    const concSteps = linearGradient(
      Math.max(top2.avg_conc * 0.8, 0.1),
      top2.avg_conc * 1.2,
      2
    );

    for (const ph of phSteps) {
      for (const conc of concSteps) {
        if (isFailure(top2.precipitant_type, ph, top2.avg_temp)) continue;
        if (wellIdx >= 18) break;
        conditions.push({
          well: wellName(wellIdx++),
          precipitant_type: top2.precipitant_type,
          precipitant_conc: conc,
          precipitant_unit: top2.common_unit,
          buffer_type: top2.common_buffer,
          ph,
          temperature: top2.avg_temp,
          expected_success_rate: round(top2.success_rate * 100),
          source: '2nd precipitant grid',
        });
      }
    }
    while (wellIdx < 18) {
      conditions.push({
        well: wellName(wellIdx++),
        precipitant_type: top2.precipitant_type,
        precipitant_conc: top2.avg_conc,
        precipitant_unit: top2.common_unit,
        buffer_type: top2.common_buffer,
        ph: top2.avg_ph,
        temperature: top2.avg_temp,
        expected_success_rate: round(top2.success_rate * 100),
        source: '2nd precipitant fallback',
      });
    }
  } else {
    // No 2nd precipitant: fill with top1 variations
    while (wellIdx < 18) {
      conditions.push({
        well: wellName(wellIdx++),
        precipitant_type: top1.precipitant_type,
        precipitant_conc: top1.avg_conc * (0.9 + Math.random() * 0.2),
        precipitant_unit: top1.common_unit,
        buffer_type: top1.common_buffer,
        ph: round(top1.avg_ph + (Math.random() - 0.5)),
        temperature: top1.avg_temp,
        expected_success_rate: round(top1.success_rate * 100 * 0.8),
        source: 'top precipitant variation',
      });
    }
  }

  // --- 4 conditions: 3rd precipitant x optimal pH x 4 conc ---
  if (top3) {
    const concSteps = linearGradient(
      Math.max(top3.avg_conc * 0.7, 0.1),
      top3.avg_conc * 1.3,
      4
    );

    for (const conc of concSteps) {
      if (isFailure(top3.precipitant_type, top3.avg_ph, top3.avg_temp)) continue;
      if (wellIdx >= 22) break;
      conditions.push({
        well: wellName(wellIdx++),
        precipitant_type: top3.precipitant_type,
        precipitant_conc: conc,
        precipitant_unit: top3.common_unit,
        buffer_type: top3.common_buffer,
        ph: top3.avg_ph,
        temperature: top3.avg_temp,
        expected_success_rate: round(top3.success_rate * 100),
        source: '3rd precipitant conc sweep',
      });
    }
    while (wellIdx < 22) {
      conditions.push({
        well: wellName(wellIdx++),
        precipitant_type: top3.precipitant_type,
        precipitant_conc: top3.avg_conc,
        precipitant_unit: top3.common_unit,
        buffer_type: top3.common_buffer,
        ph: top3.avg_ph,
        temperature: top3.avg_temp,
        expected_success_rate: round(top3.success_rate * 100),
        source: '3rd precipitant fallback',
      });
    }
  } else {
    while (wellIdx < 22) {
      conditions.push({
        well: wellName(wellIdx++),
        precipitant_type: top1.precipitant_type,
        precipitant_conc: top1.avg_conc,
        precipitant_unit: top1.common_unit,
        buffer_type: top1.common_buffer,
        ph: round(top1.avg_ph + (wellIdx % 2 === 0 ? 0.3 : -0.3)),
        temperature: top1.avg_temp,
        expected_success_rate: round(top1.success_rate * 100 * 0.7),
        source: 'top precipitant extended',
      });
    }
  }

  // --- 2 conditions: Wildcards ---
  const usedWildcards = wildcards.slice(0, 2);
  for (const wc of usedWildcards) {
    if (wellIdx >= 24) break;
    conditions.push({
      well: wellName(wellIdx++),
      precipitant_type: wc.precipitant_type,
      precipitant_conc: wc.precipitant_conc,
      precipitant_unit: wc.precipitant_unit || '%w/v',
      buffer_type: wc.buffer || 'Tris-HCl',
      ph: wc.ph,
      temperature: wc.temperature,
      additive: wc.additive || undefined,
      expected_success_rate: round(parseFloat(String(wc.success_rate)) * 100),
      source: 'wildcard (additive hit)',
    });
  }
  // Fill remaining if wildcards were insufficient
  while (wellIdx < 24) {
    conditions.push({
      well: wellName(wellIdx++),
      precipitant_type: top1.precipitant_type,
      precipitant_conc: top1.avg_conc,
      precipitant_unit: top1.common_unit,
      buffer_type: top1.common_buffer,
      ph: top1.avg_ph,
      temperature: top1.avg_temp === 18 ? 4 : 18, // alternate temperature
      expected_success_rate: round(top1.success_rate * 100 * 0.5),
      source: 'temperature alternate',
    });
  }

  // 5. Compute overall expected success rate
  const avgExpectedRate =
    conditions.reduce((s, c) => s + c.expected_success_rate, 0) / conditions.length;

  return {
    protein_name: proteinName,
    organism,
    total_conditions: 24,
    expected_success_rate: round(avgExpectedRate),
    conditions,
    analysis: {
      based_on_proteins: parseInt(proteinCount?.cnt || '0'),
      based_on_trials: totalTrials,
      top_precipitant: top1.precipitant_type,
      optimal_ph_range: `${top1.min_ph}-${top1.max_ph}`,
      optimal_temp: top1.avg_temp,
    },
  };
}
