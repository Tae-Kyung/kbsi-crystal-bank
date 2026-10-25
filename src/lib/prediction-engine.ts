/**
 * Crystallization Success Prediction Engine
 *
 * Two modes:
 *   1. DB Statistics-based: query similar conditions for same organism
 *   2. ESM-2 embedding similarity: find structurally similar proteins' outcomes
 *
 * Usage:
 *   import { predict } from '@/lib/prediction-engine';
 */
import { query, queryOne } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PredictionInput {
  protein_id?: number;
  construct_id?: number;
  sequence?: string;
  ph: number;
  temperature: number;
  precipitant_type?: string;
  precipitant_conc?: number;
  protein_concentration?: number;
}

export interface SimilarCondition {
  precipitant: string;
  ph: number;
  temp: number;
  outcome: string;
  count: number;
}

export interface PredictionResult {
  success_probability: number;
  confidence: 'high' | 'medium' | 'low';
  similar_conditions: SimilarCondition[];
  recommendation: string;
  method: ('db_statistics' | 'esm2_similarity')[];
  stats: {
    db_success_rate: number | null;
    db_total_trials: number;
    esm2_success_rate: number | null;
    esm2_similar_count: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceLevel(n: number): 'high' | 'medium' | 'low' {
  if (n >= 100) return 'high';
  if (n >= 20) return 'medium';
  return 'low';
}

function generateRecommendation(result: {
  probability: number;
  topConditions: SimilarCondition[];
  confidence: 'high' | 'medium' | 'low';
}): string {
  const { probability, topConditions, confidence } = result;

  const parts: string[] = [];

  if (probability >= 0.7) {
    parts.push('Conditions look promising with a high predicted success rate.');
  } else if (probability >= 0.4) {
    parts.push('Moderate success probability. Consider optimizing conditions.');
  } else {
    parts.push('Low predicted success rate. Significant condition changes recommended.');
  }

  if (confidence === 'low') {
    parts.push('Confidence is low due to limited similar data; interpret with caution.');
  }

  const bestSuccess = topConditions.find((c) => c.outcome === 'diffraction_quality' || c.outcome === 'single_crystal');
  if (bestSuccess) {
    parts.push(
      `Best similar success: ${bestSuccess.precipitant} at pH ${bestSuccess.ph}, ${bestSuccess.temp} C (${bestSuccess.count} trials).`
    );
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Mode 1: DB Statistics
// ---------------------------------------------------------------------------

interface DbStatsRow {
  success_rate: number | null;
  total_trials: number;
}

async function dbStatsPrediction(
  proteinId: number,
  ph: number,
  temperature: number,
  precipitantType?: string,
  precipitantConc?: number
): Promise<{ successRate: number | null; totalTrials: number }> {
  // Build dynamic WHERE clauses for optional precipitant filters
  const params: unknown[] = [proteinId, ph, temperature];
  let extraWhere = '';

  if (precipitantType) {
    params.push(precipitantType);
    extraWhere += ` AND cr.precipitant_type = $${params.length}`;
  }

  if (precipitantConc != null) {
    params.push(precipitantConc * 0.8, precipitantConc * 1.2);
    extraWhere += ` AND cr.precipitant_conc BETWEEN $${params.length - 1} AND $${params.length}`;
  }

  const sql = `
    WITH target AS (
      SELECT organism FROM kbsi_protein WHERE id = $1
    ),
    similar_trials AS (
      SELECT cr.outcome
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      JOIN kbsi_protein p ON p.id = c.protein_id
      WHERE p.organism = (SELECT organism FROM target)
        AND cr.outcome IS NOT NULL
        AND cr.ph BETWEEN $2 - 1.0 AND $2 + 1.0
        AND cr.temperature BETWEEN $3 - 5.0 AND $3 + 5.0
        ${extraWhere}
    )
    SELECT
      COUNT(*) FILTER (WHERE outcome IN ('single_crystal','diffraction_quality'))::float
        / NULLIF(COUNT(*), 0) AS success_rate,
      COUNT(*)::int AS total_trials
    FROM similar_trials;
  `;

  const row = await queryOne<DbStatsRow>(sql, params);
  return {
    successRate: row?.success_rate ?? null,
    totalTrials: row?.total_trials ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Top similar conditions (for response payload)
// ---------------------------------------------------------------------------

async function fetchSimilarConditions(
  proteinId: number,
  ph: number,
  temperature: number
): Promise<SimilarCondition[]> {
  const sql = `
    WITH target AS (
      SELECT organism FROM kbsi_protein WHERE id = $1
    )
    SELECT
      cr.precipitant_type AS precipitant,
      ROUND(cr.ph::numeric, 1)::float AS ph,
      cr.temperature::float AS temp,
      cr.outcome,
      COUNT(*)::int AS count
    FROM kbsi_crystallization cr
    JOIN kbsi_construct c ON c.id = cr.construct_id
    JOIN kbsi_protein p ON p.id = c.protein_id
    WHERE p.organism = (SELECT organism FROM target)
      AND cr.outcome IS NOT NULL
      AND cr.ph BETWEEN $2 - 1.5 AND $2 + 1.5
      AND cr.temperature BETWEEN $3 - 10.0 AND $3 + 10.0
    GROUP BY cr.precipitant_type, ROUND(cr.ph::numeric, 1), cr.temperature, cr.outcome
    ORDER BY count DESC
    LIMIT 10;
  `;

  const rows = await query<SimilarCondition>(sql, [proteinId, ph, temperature]);
  return rows;
}

// ---------------------------------------------------------------------------
// Mode 2: ESM-2 embedding similarity
// ---------------------------------------------------------------------------

interface EsmSimilarRow {
  similar_construct_id: number;
  similarity: number;
  best_outcome: string | null;
}

async function esm2Prediction(
  constructId: number,
  ph: number,
  temperature: number
): Promise<{ successRate: number | null; similarCount: number }> {
  // Step 1: find structurally similar constructs via the DB function
  const similarRows = await query<EsmSimilarRow>(
    `SELECT similar_construct_id, similarity, best_outcome
     FROM find_similar_with_conditions($1, 0.7, 20)`,
    [constructId]
  );

  if (similarRows.length === 0) {
    return { successRate: null, similarCount: 0 };
  }

  // Step 2: check crystallization outcomes of those similar constructs
  // under conditions close to the requested ones
  const ids = similarRows.map((r) => r.similar_construct_id);

  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE outcome IN ('single_crystal','diffraction_quality'))::float
        / NULLIF(COUNT(*), 0) AS success_rate,
      COUNT(*)::int AS total
    FROM kbsi_crystallization
    WHERE construct_id = ANY($1)
      AND outcome IS NOT NULL
      AND ph BETWEEN $2 - 1.0 AND $2 + 1.0
      AND temperature BETWEEN $3 - 5.0 AND $3 + 5.0;
  `;

  const row = await queryOne<{ success_rate: number | null; total: number }>(sql, [ids, ph, temperature]);

  return {
    successRate: row?.success_rate ?? null,
    similarCount: row?.total ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Resolve protein_id from construct_id if needed
// ---------------------------------------------------------------------------

async function resolveProteinId(input: PredictionInput): Promise<number | null> {
  if (input.protein_id) return input.protein_id;
  if (input.construct_id) {
    const row = await queryOne<{ protein_id: number }>(
      'SELECT protein_id FROM kbsi_construct WHERE id = $1',
      [input.construct_id]
    );
    return row?.protein_id ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main prediction function
// ---------------------------------------------------------------------------

export async function predict(input: PredictionInput): Promise<PredictionResult> {
  const proteinId = await resolveProteinId(input);
  const methods: ('db_statistics' | 'esm2_similarity')[] = [];

  let dbSuccessRate: number | null = null;
  let dbTotalTrials = 0;
  let esm2SuccessRate: number | null = null;
  let esm2SimilarCount = 0;
  let similarConditions: SimilarCondition[] = [];

  // Mode 1: DB statistics (requires protein_id)
  if (proteinId) {
    const dbResult = await dbStatsPrediction(
      proteinId,
      input.ph,
      input.temperature,
      input.precipitant_type,
      input.precipitant_conc
    );
    dbSuccessRate = dbResult.successRate;
    dbTotalTrials = dbResult.totalTrials;
    if (dbTotalTrials > 0) methods.push('db_statistics');

    similarConditions = await fetchSimilarConditions(proteinId, input.ph, input.temperature);
  }

  // Mode 2: ESM-2 similarity (requires construct_id)
  if (input.construct_id) {
    try {
      const esmResult = await esm2Prediction(input.construct_id, input.ph, input.temperature);
      esm2SuccessRate = esmResult.successRate;
      esm2SimilarCount = esmResult.similarCount;
      if (esm2SimilarCount > 0) methods.push('esm2_similarity');
    } catch {
      // find_similar_with_conditions may not be installed; skip silently
    }
  }

  // Combine probabilities
  let probability = 0;
  const totalWeight = (dbTotalTrials > 0 ? dbTotalTrials : 0) + (esm2SimilarCount > 0 ? esm2SimilarCount : 0);

  if (totalWeight > 0) {
    // Weighted average by sample size
    const dbContrib = dbSuccessRate != null && dbTotalTrials > 0 ? dbSuccessRate * dbTotalTrials : 0;
    const esmContrib = esm2SuccessRate != null && esm2SimilarCount > 0 ? esm2SuccessRate * esm2SimilarCount : 0;
    probability = (dbContrib + esmContrib) / totalWeight;
  }

  const confidence = confidenceLevel(totalWeight);

  // Take top 5 conditions
  const topConditions = similarConditions.slice(0, 5);

  const recommendation = generateRecommendation({ probability, topConditions, confidence });

  return {
    success_probability: Math.round(probability * 1000) / 10, // one decimal %
    confidence,
    similar_conditions: topConditions,
    recommendation,
    method: methods.length > 0 ? methods : ['db_statistics'],
    stats: {
      db_success_rate: dbSuccessRate != null ? Math.round(dbSuccessRate * 1000) / 10 : null,
      db_total_trials: dbTotalTrials,
      esm2_success_rate: esm2SuccessRate != null ? Math.round(esm2SuccessRate * 1000) / 10 : null,
      esm2_similar_count: esm2SimilarCount,
    },
  };
}
