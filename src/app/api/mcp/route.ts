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

  server.tool(
    'sequence_search',
    '서열 유사도 기반으로 단백질을 검색합니다',
    { sequence: z.string().describe('아미노산 서열 (최소 10잔기)'), limit: z.number().optional().default(10) },
    async ({ sequence, limit }) => toMcpResult(await queries.sequenceSearch(createServiceClient(), sequence, limit)),
  );

  server.tool(
    'search_ligands',
    '리간드(약물 후보)를 이름 또는 SMILES로 검색합니다',
    { query: z.string().describe('리간드 이름 또는 SMILES'), limit: z.number().optional().default(20) },
    async ({ query, limit }) => toMcpResult(await queries.searchLigands(createServiceClient(), query, limit)),
  );

  server.tool(
    'get_bindings',
    '약물-타겟 바인딩 데이터(IC50, Kd, Ki)를 조회합니다',
    { construct_id: z.number().optional(), ligand_id: z.number().optional(), limit: z.number().optional().default(20) },
    async ({ construct_id, ligand_id, limit }) => toMcpResult(await queries.getBindings(createServiceClient(), construct_id, ligand_id, limit)),
  );

  server.tool(
    'search_structures',
    'PDB ID 또는 실험 방법으로 3D 구조를 검색합니다',
    { pdb_id: z.string().optional(), method: z.enum(['X-ray', 'NMR', 'Cryo-EM']).optional(), limit: z.number().optional().default(20) },
    async ({ pdb_id, method, limit }) => toMcpResult(await queries.searchStructures(createServiceClient(), pdb_id, method, limit)),
  );

  server.tool(
    'search_mutations',
    '단백질 변이(mutation) 정보를 검색합니다. 변이명(G12V), 단백질명(KRAS), construct ID로 검색 가능',
    {
      mutation: z.string().optional().describe('변이명 (예: G12V, L858R)'),
      protein_name: z.string().optional().describe('단백질 이름 또는 약어'),
      construct_id: z.number().optional().describe('Construct ID'),
      limit: z.number().optional().default(20),
    },
    async (params) => toMcpResult(await queries.searchMutations(createServiceClient(), params)),
  );

  server.tool(
    'esm2_search',
    'ESM-2 임베딩 기반 서열 유사도 검색. GPU 서버에서 실시간 임베딩 계산 후 284K construct와 벡터 유사도로 검색합니다.',
    { sequence: z.string().describe('아미노산 서열 (최소 10잔기)'), limit: z.number().optional().default(20) },
    async ({ sequence, limit }) => toMcpResult(await queries.esm2Search(createServiceClient(), sequence, limit)),
  );

  server.tool(
    'copilot_analyze',
    '단백질 결정화 전략을 분석합니다. 단백질 ID 또는 서열로 유사 단백질을 찾고, 결정화 조건(pH, 온도, 침전제), 발현 조건, 성공률을 분석합니다.',
    {
      protein_id: z.number().optional().describe('단백질 ID (DB 검색 모드)'),
      sequence: z.string().optional().describe('아미노산 서열 (서열 검색 모드)'),
    },
    async (params) => toMcpResult(await queries.copilotAnalyze(createServiceClient(), params)),
  );

  server.tool(
    'predict_crystallization',
    'ESM-2 + XGBoost로 결정화 성공 확률을 예측합니다. 서열과 결정화 조건을 입력하면 성공 확률(%)을 반환합니다.',
    {
      sequence: z.string().describe('아미노산 서열'),
      ph: z.number().optional().default(7.0).describe('pH'),
      temperature: z.number().optional().default(18).describe('온도 (°C)'),
      precipitant_type: z.string().optional().default('unknown').describe('침전제 종류'),
      precipitant_conc: z.number().optional().default(0).describe('침전제 농도'),
    },
    async (params) => toMcpResult(await queries.predictCrystallizationSuccess(params)),
  );

  server.tool(
    'get_data_quality',
    '데이터 품질 요약 (필드 구조화율, outcome 분포, 합성/실험 비율)',
    {},
    async () => toMcpResult(await queries.getDataQualitySummary(createServiceClient())),
  );

  server.tool(
    'search_characterizations',
    '특성분석 데이터를 검색합니다 (DLS, SEC-MALS, SDS-PAGE, Tm 등)',
    {
      construct_id: z.number().optional(),
      method: z.string().optional().describe('DLS, SEC-MALS, SDS-PAGE, thermal_stability, CD, Mass Spec'),
      protein_name: z.string().optional(),
      limit: z.number().optional().default(20),
    },
    async (params) => toMcpResult(await queries.searchCharacterizations(createServiceClient(), params)),
  );

  server.tool(
    'search_diffractions',
    '회절 데이터를 검색합니다 (해상도, 공간군, 빔라인 등)',
    {
      construct_id: z.number().optional(),
      space_group: z.string().optional().describe('공간군 (예: P212121, C2)'),
      resolution_max: z.number().optional().describe('최대 해상도 (Å)'),
      protein_name: z.string().optional(),
      limit: z.number().optional().default(20),
    },
    async (params) => toMcpResult(await queries.searchDiffractions(createServiceClient(), params)),
  );

  server.tool(
    'get_ligand_binding_network',
    '단백질-리간드 바인딩 네트워크를 조회합니다',
    {
      protein_name: z.string().optional().describe('단백질 이름으로 필터'),
      ligand_name: z.string().optional().describe('리간드 이름으로 필터'),
      limit: z.number().optional().default(30),
    },
    async (params) => toMcpResult(await queries.getLigandBindingNetwork(createServiceClient(), params)),
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
