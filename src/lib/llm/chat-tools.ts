import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extractFeatures, findKNearest, estimateSuccessProbability } from '@/lib/ml/features';

/**
 * AI 챗봇이 사용할 function calling tools
 * 기존 API 로직을 LLM tool로 래핑
 */

export const chatTools = {
  search_proteins: tool({
    description: '단백질을 이름, 약어, 유전자명으로 검색합니다. Search proteins by name, abbreviation, or gene name.',
    parameters: z.object({
      query: z.string().describe('검색어 (단백질 이름, 약어, 유전자명)'),
      limit: z.number().optional().default(10).describe('결과 수 제한'),
    }),
    execute: async ({ query, limit }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('kbsi_protein')
        .select('id, full_name, abbreviation, gene_name, organism, source_type')
        .or(`full_name.ilike.%${query}%,abbreviation.ilike.%${query}%,gene_name.ilike.%${query}%`)
        .limit(limit);
      if (error) return { error: error.message };
      return { proteins: data, count: data?.length ?? 0 };
    },
  }),

  search_constructs: tool({
    description: 'Construct를 단백질 ID 또는 이름으로 검색합니다. Search constructs by protein ID or name.',
    parameters: z.object({
      protein_id: z.number().optional().describe('단백질 ID'),
      query: z.string().optional().describe('Construct 이름 검색어'),
      limit: z.number().optional().default(10),
    }),
    execute: async ({ protein_id, query, limit }) => {
      const supabase = await createClient();
      let q = supabase
        .from('kbsi_construct')
        .select('id, name, construct_type, expression_system, tag_name, status, protein_id, kbsi_protein(full_name, abbreviation)')
        .limit(limit);
      if (protein_id) q = q.eq('protein_id', protein_id);
      if (query) q = q.ilike('name', `%${query}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { constructs: data, count: data?.length ?? 0 };
    },
  }),

  get_experiments: tool({
    description: '특정 Construct의 실험 데이터를 조회합니다. Get experiments for a construct by type.',
    parameters: z.object({
      construct_id: z.number().describe('Construct ID'),
      experiment_type: z.enum([
        'expression', 'purification', 'crystallization',
        'characterization', 'diffraction', 'structure',
      ]).describe('실험 유형'),
      limit: z.number().optional().default(20),
    }),
    execute: async ({ construct_id, experiment_type, limit }) => {
      const supabase = await createClient();
      const tableMap: Record<string, string> = {
        expression: 'kbsi_expression',
        purification: 'kbsi_purification',
        crystallization: 'kbsi_crystallization',
        characterization: 'kbsi_characterization',
        diffraction: 'kbsi_diffraction',
        structure: 'kbsi_structure',
      };
      const table = tableMap[experiment_type];
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' })
        .eq('construct_id', construct_id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      return { experiments: data, type: experiment_type, total: count };
    },
  }),

  get_statistics: tool({
    description: '데이터베이스 통계를 조회합니다. Get database statistics (counts of proteins, constructs, experiments).',
    parameters: z.object({}),
    execute: async () => {
      const supabase = await createClient();
      const tables = [
        'kbsi_protein', 'kbsi_construct', 'kbsi_expression',
        'kbsi_purification', 'kbsi_crystallization', 'kbsi_structure',
      ];
      const results: Record<string, number> = {};
      for (const table of tables) {
        const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        results[table.replace('kbsi_', '')] = count ?? 0;
      }
      return { statistics: results };
    },
  }),

  recommend_crystallization: tool({
    description: '결정화 조건을 추천합니다 (k-NN 기반). Recommend crystallization conditions based on similar experiments.',
    parameters: z.object({
      ph: z.number().optional().describe('pH 값'),
      temperature: z.number().optional().describe('온도 (°C)'),
      precipitant_type: z.string().optional().describe('침전제 종류'),
      precipitant_conc: z.number().optional().describe('침전제 농도'),
      protein_concentration: z.number().optional().describe('단백질 농도 (mg/mL)'),
      k: z.number().optional().default(5).describe('추천 개수'),
    }),
    execute: async ({ ph, temperature, precipitant_type, precipitant_conc, protein_concentration, k }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('kbsi_crystallization')
        .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
        .not('outcome', 'is', null);
      if (error) return { error: error.message };
      const crystData = (data ?? []) as any[];
      if (crystData.length === 0) return { message: 'Not enough data', recommendations: [] };

      const queryCondition = {
        protein_concentration: protein_concentration ?? null,
        precipitant_type: precipitant_type ?? null,
        precipitant_conc: precipitant_conc ?? null,
        ph: ph ?? null,
        temperature: temperature ?? null,
        additive: null,
        outcome: null,
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
          ...crystData[n.index],
          distance: Math.round(n.distance * 100) / 100,
        })),
      };
    },
  }),

  predict_success: tool({
    description: '결정화 성공 확률을 예측합니다 (k-NN 기반). Predict crystallization success probability.',
    parameters: z.object({
      ph: z.number().optional(),
      temperature: z.number().optional(),
      precipitant_type: z.string().optional(),
      precipitant_conc: z.number().optional(),
      protein_concentration: z.number().optional(),
    }),
    execute: async ({ ph, temperature, precipitant_type, precipitant_conc, protein_concentration }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('kbsi_crystallization')
        .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
        .not('outcome', 'is', null);
      if (error) return { error: error.message };
      const crystData = (data ?? []) as any[];
      if (crystData.length < 5) return { prediction: null, message: 'Insufficient data' };

      const queryCondition = {
        protein_concentration: protein_concentration ?? null,
        precipitant_type: precipitant_type ?? null,
        precipitant_conc: precipitant_conc ?? null,
        ph: ph ?? null,
        temperature: temperature ?? null,
        additive: null,
        outcome: null,
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
        k_used: k,
        data_points_total: crystData.length,
        outcome_distribution: outcomeDistribution,
      };
    },
  }),

  search_crystallization_conditions: tool({
    description: '결정화 실험 데이터를 조건별로 검색합니다. Search crystallization data by conditions.',
    parameters: z.object({
      outcome: z.enum(['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality']).optional(),
      precipitant_type: z.string().optional(),
      ph_min: z.number().optional(),
      ph_max: z.number().optional(),
      temperature_min: z.number().optional(),
      temperature_max: z.number().optional(),
      limit: z.number().optional().default(20),
    }),
    execute: async ({ outcome, precipitant_type, ph_min, ph_max, temperature_min, temperature_max, limit }) => {
      const supabase = await createClient();
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
    },
  }),
};

export const SYSTEM_PROMPT = `You are an AI assistant for the KBSI Protein Crystallization Bank (단백질 결정화은행).
You help researchers manage and analyze protein crystallization experiment data.

Your capabilities:
- Search proteins, constructs, and experiments
- Recommend crystallization conditions using k-NN similarity
- Predict crystallization success probability
- Provide database statistics
- Search crystallization conditions by parameters

When answering:
- Be concise and scientific
- Use both Korean and English terms where appropriate
- Format data clearly using tables or bullet points
- Suggest next steps when relevant (e.g., "Try adjusting pH" or "You might want to check similar conditions")
- If the user asks about a specific protein, search for it first
- When recommending conditions, explain why based on the data

You have access to the KBSI protein crystallization database containing protein information,
construct designs, and experimental data (expression, purification, crystallization, etc.).`;
