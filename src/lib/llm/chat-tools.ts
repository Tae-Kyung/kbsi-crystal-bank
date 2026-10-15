import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import * as queries from '@/lib/tools/crystallization-queries';

/**
 * AI 챗봇 function calling tools
 * 공통 쿼리 모듈(crystallization-queries.ts)을 사용
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
      return queries.searchProteins(supabase, query, limit);
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
      return queries.searchConstructs(supabase, protein_id, query, limit);
    },
  }),

  get_experiments: tool({
    description: '특정 Construct의 실험 데이터를 조회합니다. Get experiments for a construct by type.',
    parameters: z.object({
      construct_id: z.number().describe('Construct ID'),
      experiment_type: z.enum(['expression', 'purification', 'crystallization', 'characterization', 'diffraction', 'structure', 'nmr']),
      limit: z.number().optional().default(20),
    }),
    execute: async ({ construct_id, experiment_type, limit }) => {
      const supabase = await createClient();
      return queries.getExperiments(supabase, construct_id, experiment_type, limit);
    },
  }),

  get_statistics: tool({
    description: '데이터베이스 통계를 조회합니다. Get database statistics (counts of proteins, constructs, experiments).',
    parameters: z.object({}),
    execute: async () => {
      const supabase = await createClient();
      return queries.getStatistics(supabase);
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
    execute: async (params) => {
      const supabase = await createClient();
      return queries.recommendCrystallization(supabase, params);
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
    execute: async (params) => {
      const supabase = await createClient();
      return queries.predictSuccess(supabase, params);
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
    execute: async (params) => {
      const supabase = await createClient();
      return queries.searchCrystallizationConditions(supabase, params);
    },
  }),
  sequence_search: tool({
    description: '서열 유사도 기반으로 단백질을 검색합니다. 유사한 단백질의 결정화 성공 조건도 추천합니다.',
    parameters: z.object({
      sequence: z.string().describe('아미노산 서열 (최소 10잔기)'),
      limit: z.number().optional().default(10),
    }),
    execute: async ({ sequence, limit }) => {
      const supabase = await createClient();
      return queries.sequenceSearch(supabase, sequence, limit);
    },
  }),

  search_ligands: tool({
    description: '리간드(약물 후보)를 이름 또는 SMILES로 검색합니다.',
    parameters: z.object({
      query: z.string().describe('리간드 이름 또는 SMILES'),
      limit: z.number().optional().default(20),
    }),
    execute: async ({ query, limit }) => {
      const supabase = await createClient();
      return queries.searchLigands(supabase, query, limit);
    },
  }),

  get_bindings: tool({
    description: '약물-타겟 바인딩 데이터(IC50, Kd, Ki)를 조회합니다.',
    parameters: z.object({
      construct_id: z.number().optional().describe('Construct ID'),
      ligand_id: z.number().optional().describe('Ligand ID'),
      limit: z.number().optional().default(20),
    }),
    execute: async ({ construct_id, ligand_id, limit }) => {
      const supabase = await createClient();
      return queries.getBindings(supabase, construct_id, ligand_id, limit);
    },
  }),

  search_structures: tool({
    description: 'PDB ID 또는 실험 방법으로 3D 구조를 검색합니다.',
    parameters: z.object({
      pdb_id: z.string().optional().describe('PDB ID (예: 6GOD)'),
      method: z.enum(['X-ray', 'NMR', 'Cryo-EM']).optional().describe('구조 결정 방법'),
      limit: z.number().optional().default(20),
    }),
    execute: async ({ pdb_id, method, limit }) => {
      const supabase = await createClient();
      return queries.searchStructures(supabase, pdb_id, method, limit);
    },
  }),

  get_data_quality: tool({
    description: '데이터 품질 요약을 조회합니다 (필드 구조화율, outcome 분포, 합성/실험 비율).',
    parameters: z.object({}),
    execute: async () => {
      const supabase = await createClient();
      return queries.getDataQualitySummary(supabase);
    },
  }),

  search_characterizations: tool({
    description: '특성분석 데이터를 검색합니다 (DLS, SEC-MALS, SDS-PAGE, Tm 등).',
    parameters: z.object({
      construct_id: z.number().optional().describe('Construct ID'),
      method: z.string().optional().describe('측정 방법 (DLS, SEC-MALS, SDS-PAGE, thermal_stability, CD, Mass Spec)'),
      protein_name: z.string().optional().describe('단백질 이름으로 필터'),
      limit: z.number().optional().default(20),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      return queries.searchCharacterizations(supabase, params);
    },
  }),

  search_diffractions: tool({
    description: '회절 데이터를 검색합니다 (해상도, 공간군, 빔라인 등).',
    parameters: z.object({
      construct_id: z.number().optional().describe('Construct ID'),
      space_group: z.string().optional().describe('공간군 (예: P212121, C2)'),
      resolution_max: z.number().optional().describe('최대 해상도 (Å)'),
      protein_name: z.string().optional().describe('단백질 이름으로 필터'),
      limit: z.number().optional().default(20),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      return queries.searchDiffractions(supabase, params);
    },
  }),

  get_ligand_binding_network: tool({
    description: '단백질-리간드 바인딩 네트워크를 조회합니다.',
    parameters: z.object({
      protein_name: z.string().optional().describe('단백질 이름으로 필터'),
      ligand_name: z.string().optional().describe('리간드 이름으로 필터'),
      limit: z.number().optional().default(30),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      return queries.getLigandBindingNetwork(supabase, params);
    },
  }),

  esm2_search: tool({
    description: 'ESM-2 임베딩 기반 서열 유사도 검색. GPU에서 실시간 임베딩 후 284K construct와 벡터 유사도 검색. Search similar proteins using ESM-2 embeddings.',
    parameters: z.object({
      sequence: z.string().describe('아미노산 서열 (최소 10잔기)'),
      limit: z.number().optional().default(20),
    }),
    execute: async ({ sequence, limit }) => {
      const supabase = await createClient();
      return queries.esm2Search(supabase, sequence, limit);
    },
  }),

  copilot_analyze: tool({
    description: '결정화 전략 분석. 단백질 ID 또는 서열로 유사 단백질 검색 → 결정화 조건(pH, 온도, 침전제) + 발현 조건 + 성공률 분석. Analyze crystallization strategy for a protein.',
    parameters: z.object({
      protein_id: z.number().optional().describe('단백질 ID'),
      sequence: z.string().optional().describe('아미노산 서열'),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      return queries.copilotAnalyze(supabase, params);
    },
  }),

  predict_crystallization: tool({
    description: 'ESM-2 + XGBoost로 결정화 성공 확률을 예측합니다. 서열 + 조건 → 성공 확률(%). Predict crystallization success using ESM-2 embeddings + XGBoost.',
    parameters: z.object({
      sequence: z.string().describe('아미노산 서열'),
      ph: z.number().optional().default(7.0).describe('pH'),
      temperature: z.number().optional().default(18).describe('온도 (°C)'),
      precipitant_type: z.string().optional().default('unknown').describe('침전제 종류'),
      precipitant_conc: z.number().optional().default(0).describe('침전제 농도'),
    }),
    execute: async (params) => queries.predictCrystallizationSuccess(params),
  }),

  search_mutations: tool({
    description: '단백질 변이(mutation) 정보를 검색합니다. 변이명(G12V), 단백질명(KRAS), construct ID로 검색 가능.',
    parameters: z.object({
      mutation: z.string().optional().describe('변이명 (예: G12V, L858R)'),
      protein_name: z.string().optional().describe('단백질 이름 또는 약어'),
      construct_id: z.number().optional().describe('Construct ID'),
      limit: z.number().optional().default(20),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      return queries.searchMutations(supabase, params);
    },
  }),

  search_nmr_experiments: tool({
    description: 'NMR 실험 데이터를 검색합니다. 단백질명, 자기장 강도(MHz), pH, 동위원소 표지 등으로 검색 가능. Search NMR experiments by protein name, field strength, pH, labelling.',
    parameters: z.object({
      construct_id: z.number().optional().describe('Construct ID'),
      protein_name: z.string().optional().describe('단백질 이름 (예: ubiquitin, KRAS)'),
      field_min: z.number().optional().describe('최소 자기장 강도 (MHz)'),
      field_max: z.number().optional().describe('최대 자기장 강도 (MHz)'),
      ph_min: z.number().optional().describe('최소 pH'),
      ph_max: z.number().optional().describe('최대 pH'),
      labelling: z.string().optional().describe('동위원소 표지 (예: 15N, 13C)'),
      limit: z.number().optional().default(20),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      return queries.searchNmrExperiments(supabase, params);
    },
  }),
};

export const SYSTEM_PROMPT = `You are an AI assistant for the KBSI Protein Crystallization Bank (단백질 결정화은행).
You help researchers manage and analyze protein crystallization experiment data.

Your capabilities (20 tools):
- Search proteins, constructs, and experiments (including NMR)
- **ESM-2 sequence search**: Find similar proteins using ESM-2 protein language model embeddings (284K constructs, cosine similarity)
- **Copilot analyze**: Full strategy analysis (similar proteins → crystallization + NMR conditions → expression → method distribution → success rate)
- Recommend crystallization conditions using k-NN similarity
- **Predict crystallization success**: ESM-2 + XGBoost model predicts success probability for given sequence + conditions
- Provide database statistics (including NMR experiment/spectrum counts)
- Search crystallization conditions by parameters
- Search by protein sequence similarity (k-mer Jaccard, legacy)
- Search ligands (drug candidates) by name or SMILES
- Query drug-target binding data (IC50, Kd, Ki)
- Search 3D structures by PDB ID or method (X-ray, NMR, Cryo-EM)
- **Search NMR experiments**: by protein name, field strength (MHz), pH, labelling (15N/13C), conformer count
- Check data quality summary (field coverage, outcome distribution)
- Search characterization data (DLS, SEC-MALS, SDS-PAGE, thermal stability)
- Search diffraction data (resolution, space group, beamline)
- Query protein-ligand binding networks
- Search mutations (point mutations like G12V, L858R)

When a user provides a protein sequence, prefer esm2_search over sequence_search (k-mer).
When a user asks about crystallization strategy, use copilot_analyze.
When a user asks about success probability for specific conditions, use predict_crystallization.

When answering:
- Be concise and scientific
- Use both Korean and English terms where appropriate
- Format data clearly using tables or bullet points
- Suggest next steps when relevant (e.g., "Try adjusting pH" or "You might want to check similar conditions")
- If the user asks about a specific protein, search for it first
- When recommending conditions, explain why based on the data

You have access to the KBSI protein crystallization database containing protein information,
construct designs, and experimental data (expression, purification, crystallization, etc.).`;
