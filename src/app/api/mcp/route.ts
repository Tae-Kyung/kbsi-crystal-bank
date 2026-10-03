import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { extractFeatures, findKNearest, estimateSuccessProbability } from '@/lib/ml/features';

function createMcpServer() {
  const server = new McpServer({
    name: 'kbsi-protein',
    version: '1.0.0',
  });

  // ─── Tool: search_proteins ───
  server.tool(
    'search_proteins',
    '단백질을 이름, 약어, 유전자명으로 검색합니다',
    { query: z.string().describe('검색어'), limit: z.number().optional().default(10) },
    async ({ query, limit }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('kbsi_protein')
        .select('id, full_name, abbreviation, gene_name, organism, source_type')
        .or(`full_name.ilike.%${query}%,abbreviation.ilike.%${query}%,gene_name.ilike.%${query}%`)
        .limit(limit);
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify({ proteins: data, count: data?.length ?? 0 }, null, 2) }] };
    },
  );

  // ─── Tool: search_constructs ───
  server.tool(
    'search_constructs',
    'Construct를 단백질 ID 또는 이름으로 검색합니다',
    { protein_id: z.number().optional(), query: z.string().optional(), limit: z.number().optional().default(10) },
    async ({ protein_id, query, limit }) => {
      const supabase = createServiceClient();
      let q = supabase
        .from('kbsi_construct')
        .select('id, name, construct_type, expression_system, tag_name, status, protein_id, kbsi_protein(full_name, abbreviation)')
        .limit(limit);
      if (protein_id) q = q.eq('protein_id', protein_id);
      if (query) q = q.ilike('name', `%${query}%`);
      const { data, error } = await q;
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify({ constructs: data, count: data?.length ?? 0 }, null, 2) }] };
    },
  );

  // ─── Tool: get_experiments ───
  server.tool(
    'get_experiments',
    '특정 Construct의 실험 데이터를 조회합니다',
    {
      construct_id: z.number().describe('Construct ID'),
      experiment_type: z.enum(['expression', 'purification', 'crystallization', 'characterization', 'diffraction', 'structure']),
      limit: z.number().optional().default(20),
    },
    async ({ construct_id, experiment_type, limit }) => {
      const supabase = createServiceClient();
      const tableMap: Record<string, string> = {
        expression: 'kbsi_expression', purification: 'kbsi_purification',
        crystallization: 'kbsi_crystallization', characterization: 'kbsi_characterization',
        diffraction: 'kbsi_diffraction', structure: 'kbsi_structure',
      };
      const { data, error, count } = await supabase
        .from(tableMap[experiment_type])
        .select('*', { count: 'exact' })
        .eq('construct_id', construct_id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify({ experiments: data, type: experiment_type, total: count }, null, 2) }] };
    },
  );

  // ─── Tool: get_statistics ───
  server.tool(
    'get_statistics',
    '데이터베이스 통계를 조회합니다 (단백질, construct, 실험 건수)',
    {},
    async () => {
      const supabase = createServiceClient();
      const tables = ['kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification', 'kbsi_crystallization', 'kbsi_structure'];
      const results: Record<string, number> = {};
      for (const table of tables) {
        const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        results[table.replace('kbsi_', '')] = count ?? 0;
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ statistics: results }, null, 2) }] };
    },
  );

  // ─── Tool: recommend_crystallization ───
  server.tool(
    'recommend_crystallization',
    '결정화 조건을 추천합니다 (k-NN 기반). 유사한 과거 성공 실험을 검색합니다.',
    {
      ph: z.number().optional(), temperature: z.number().optional(),
      precipitant_type: z.string().optional(), precipitant_conc: z.number().optional(),
      protein_concentration: z.number().optional(), k: z.number().optional().default(5),
    },
    async ({ ph, temperature, precipitant_type, precipitant_conc, protein_concentration, k }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('kbsi_crystallization')
        .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
        .not('outcome', 'is', null);
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
      const crystData = (data ?? []) as any[];
      if (crystData.length === 0) return { content: [{ type: 'text' as const, text: 'Not enough data for recommendations' }] };

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
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success_rate: Math.round(successRate * 100),
            total_data_points: crystData.length,
            recommendations: successNeighbors.slice(0, 5).map((n) => ({
              ...crystData[n.index], distance: Math.round(n.distance * 100) / 100,
            })),
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: predict_success ───
  server.tool(
    'predict_success',
    '결정화 성공 확률을 예측합니다 (k-NN 기반)',
    {
      ph: z.number().optional(), temperature: z.number().optional(),
      precipitant_type: z.string().optional(), precipitant_conc: z.number().optional(),
      protein_concentration: z.number().optional(),
    },
    async ({ ph, temperature, precipitant_type, precipitant_conc, protein_concentration }) => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('kbsi_crystallization')
        .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
        .not('outcome', 'is', null);
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
      const crystData = (data ?? []) as any[];
      if (crystData.length < 5) return { content: [{ type: 'text' as const, text: 'Insufficient data (need at least 5 records)' }] };

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
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success_probability: Math.round(probability * 100),
            confidence: crystData.length >= 50 ? 'high' : crystData.length >= 20 ? 'medium' : 'low',
            k_used: k, data_points_total: crystData.length, outcome_distribution: outcomeDistribution,
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: search_crystallization_conditions ───
  server.tool(
    'search_crystallization_conditions',
    '결정화 실험 데이터를 조건별로 검색합니다',
    {
      outcome: z.enum(['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality']).optional(),
      precipitant_type: z.string().optional(),
      ph_min: z.number().optional(), ph_max: z.number().optional(),
      temperature_min: z.number().optional(), temperature_max: z.number().optional(),
      limit: z.number().optional().default(20),
    },
    async ({ outcome, precipitant_type, ph_min, ph_max, temperature_min, temperature_max, limit }) => {
      const supabase = createServiceClient();
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
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify({ results: data, count: data?.length ?? 0 }, null, 2) }] };
    },
  );

  return server;
}

async function handleMcpRequest(request: Request) {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}
