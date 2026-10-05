import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import * as queries from '@/lib/tools/crystallization-queries';

function toMcpResult(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function createMcpServer() {
  const server = new McpServer({ name: 'kbsi-protein', version: '1.0.0' });

  server.tool(
    'search_proteins',
    '단백질을 이름, 약어, 유전자명으로 검색합니다',
    { query: z.string().describe('검색어'), limit: z.number().optional().default(10) },
    async ({ query, limit }) => toMcpResult(await queries.searchProteins(createServiceClient(), query, limit)),
  );

  server.tool(
    'search_constructs',
    'Construct를 단백질 ID 또는 이름으로 검색합니다',
    { protein_id: z.number().optional(), query: z.string().optional(), limit: z.number().optional().default(10) },
    async ({ protein_id, query, limit }) => toMcpResult(await queries.searchConstructs(createServiceClient(), protein_id, query, limit)),
  );

  server.tool(
    'get_experiments',
    '특정 Construct의 실험 데이터를 조회합니다',
    {
      construct_id: z.number().describe('Construct ID'),
      experiment_type: z.enum(['expression', 'purification', 'crystallization', 'characterization', 'diffraction', 'structure']),
      limit: z.number().optional().default(20),
    },
    async ({ construct_id, experiment_type, limit }) => toMcpResult(await queries.getExperiments(createServiceClient(), construct_id, experiment_type, limit)),
  );

  server.tool(
    'get_statistics',
    '데이터베이스 통계를 조회합니다 (단백질, construct, 실험 건수)',
    {},
    async () => toMcpResult(await queries.getStatistics(createServiceClient())),
  );

  server.tool(
    'recommend_crystallization',
    '결정화 조건을 추천합니다 (k-NN 기반). 유사한 과거 성공 실험을 검색합니다.',
    {
      ph: z.number().optional(), temperature: z.number().optional(),
      precipitant_type: z.string().optional(), precipitant_conc: z.number().optional(),
      protein_concentration: z.number().optional(), k: z.number().optional().default(5),
    },
    async (params) => toMcpResult(await queries.recommendCrystallization(createServiceClient(), params)),
  );

  server.tool(
    'predict_success',
    '결정화 성공 확률을 예측합니다 (k-NN 기반)',
    {
      ph: z.number().optional(), temperature: z.number().optional(),
      precipitant_type: z.string().optional(), precipitant_conc: z.number().optional(),
      protein_concentration: z.number().optional(),
    },
    async (params) => toMcpResult(await queries.predictSuccess(createServiceClient(), params)),
  );

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
    async (params) => toMcpResult(await queries.searchCrystallizationConditions(createServiceClient(), params)),
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
