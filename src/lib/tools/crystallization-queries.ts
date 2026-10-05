/**
 * 결정화 DB 쿼리 — AI 챗봇 + MCP에서 공통 사용
 * DB 클라이언트를 주입받아 동일 로직 재사용
 */

import { extractFeatures, findKNearest, estimateSuccessProbability } from '@/lib/ml/features';

type SupabaseClient = any;

export async function searchProteins(supabase: SupabaseClient, query: string, limit: number) {
  const { data, error } = await supabase
    .from('kbsi_protein')
    .select('id, full_name, abbreviation, gene_name, organism')
    .or(`full_name.ilike.%${query}%,abbreviation.ilike.%${query}%,gene_name.ilike.%${query}%`)
    .limit(limit);
  if (error) return { error: error.message };
  return { proteins: data, count: data?.length ?? 0 };
}

export async function searchConstructs(supabase: SupabaseClient, protein_id?: number, query?: string, limit: number = 10) {
  let q = supabase
    .from('kbsi_construct')
    .select('id, name, construct_type, expression_system, tag_name, status, protein_id, kbsi_protein(full_name, abbreviation)')
    .limit(limit);
  if (protein_id) q = q.eq('protein_id', protein_id);
  if (query) q = q.ilike('name', `%${query}%`);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { constructs: data, count: data?.length ?? 0 };
}

export async function getExperiments(supabase: SupabaseClient, construct_id: number, experiment_type: string, limit: number = 20) {
  const tableMap: Record<string, string> = {
    expression: 'kbsi_expression', purification: 'kbsi_purification',
    crystallization: 'kbsi_crystallization', characterization: 'kbsi_characterization',
    diffraction: 'kbsi_diffraction', structure: 'kbsi_structure',
  };
  const table = tableMap[experiment_type];
  if (!table) return { error: `Unknown type: ${experiment_type}` };
  const { data, error, count } = await supabase
    .from(table).select('*', { count: 'exact' })
    .eq('construct_id', construct_id).order('created_at', { ascending: false }).limit(limit);
  if (error) return { error: error.message };
  return { experiments: data, type: experiment_type, total: count };
}

export async function getStatistics(supabase: SupabaseClient) {
  const tables = ['kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification', 'kbsi_crystallization', 'kbsi_structure'];
  const results: Record<string, number> = {};
  for (const table of tables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    results[table.replace('kbsi_', '')] = count ?? 0;
  }
  return { statistics: results };
}

export async function recommendCrystallization(
  supabase: SupabaseClient,
  params: { ph?: number; temperature?: number; precipitant_type?: string; precipitant_conc?: number; protein_concentration?: number; k?: number }
) {
  const { ph, temperature, precipitant_type, precipitant_conc, protein_concentration, k = 5 } = params;
  const { data, error } = await supabase
    .from('kbsi_crystallization')
    .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
    .not('outcome', 'is', null);
  if (error) return { error: error.message };
  const crystData = (data ?? []) as any[];
  if (crystData.length === 0) return { message: 'Not enough data', recommendations: [] };

  const queryCondition = {
    protein_concentration: protein_concentration ?? null, precipitant_type: precipitant_type ?? null,
    precipitant_conc: precipitant_conc ?? null, ph: ph ?? null,
    temperature: temperature ?? null, additive: null, outcome: null,
  };
  const queryFeatures = extractFeatures(queryCondition);
  const datasetFeatures = crystData.map((r) => extractFeatures(r));
  const neighbors = findKNearest(queryFeatures, datasetFeatures, k);
  const successNeighbors = neighbors.filter((n) => n.features.outcome_rank >= 4);
  const successRate = neighbors.length > 0 ? successNeighbors.length / neighbors.length : 0;

  return {
    success_rate: Math.round(successRate * 100),
    total_data_points: crystData.length,
    recommendations: successNeighbors.slice(0, 5).map((n) => ({
      ...crystData[n.index], distance: Math.round(n.distance * 100) / 100,
    })),
  };
}

export async function predictSuccess(
  supabase: SupabaseClient,
  params: { ph?: number; temperature?: number; precipitant_type?: string; precipitant_conc?: number; protein_concentration?: number }
) {
  const { ph, temperature, precipitant_type, precipitant_conc, protein_concentration } = params;
  const { data, error } = await supabase
    .from('kbsi_crystallization')
    .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
    .not('outcome', 'is', null);
  if (error) return { error: error.message };
  const crystData = (data ?? []) as any[];
  if (crystData.length < 5) return { prediction: null, message: 'Insufficient data' };

  const queryCondition = {
    protein_concentration: protein_concentration ?? null, precipitant_type: precipitant_type ?? null,
    precipitant_conc: precipitant_conc ?? null, ph: ph ?? null,
    temperature: temperature ?? null, additive: null, outcome: null,
  };
  const queryFeatures = extractFeatures(queryCondition);
  const datasetFeatures = crystData.map((r) => extractFeatures(r));
  const k = Math.max(3, Math.min(20, Math.round(Math.sqrt(crystData.length))));
  const neighbors = findKNearest(queryFeatures, datasetFeatures, k);
  const probability = estimateSuccessProbability(neighbors);

  const outcomeDistribution: Record<string, number> = {};
  for (const n of neighbors) {
    const outcome = crystData[n.index]?.outcome || 'unknown';
    outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
  }

  return {
    success_probability: Math.round(probability * 100),
    confidence: crystData.length >= 50 ? 'high' : crystData.length >= 20 ? 'medium' : 'low',
    k_used: k, data_points_total: crystData.length, outcome_distribution: outcomeDistribution,
  };
}

export async function searchCrystallizationConditions(
  supabase: SupabaseClient,
  params: { outcome?: string; precipitant_type?: string; ph_min?: number; ph_max?: number; temperature_min?: number; temperature_max?: number; limit?: number }
) {
  const { outcome, precipitant_type, ph_min, ph_max, temperature_min, temperature_max, limit = 20 } = params;
  let q = supabase
    .from('kbsi_crystallization')
    .select('*, kbsi_construct(name, kbsi_protein(full_name))')
    .limit(limit);
  if (outcome) q = q.eq('outcome', outcome);
  if (precipitant_type) q = q.ilike('precipitant_type', `%${precipitant_type}%`);
  if (ph_min !== undefined) q = q.gte('ph', ph_min);
  if (ph_max !== undefined) q = q.lte('ph', ph_max);
  if (temperature_min !== undefined) q = q.gte('temperature', temperature_min);
  if (temperature_max !== undefined) q = q.lte('temperature', temperature_max);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return { error: error.message };
  return { results: data, count: data?.length ?? 0 };
}
