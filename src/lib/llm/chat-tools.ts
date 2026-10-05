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
      experiment_type: z.enum(['expression', 'purification', 'crystallization', 'characterization', 'diffraction', 'structure']),
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
};

export const SYSTEM_PROMPT = `You are an AI assistant for the KBSI Protein Crystallization Bank (단백질 결정화은행).
You help researchers manage and analyze protein crystallization experiment data.

Your capabilities:
- Search proteins, constructs, and experiments
- Recommend crystallization conditions using k-NN similarity
- Predict crystallization success probability
- Provide database statistics
- Search crystallization conditions by parameters
- Search by protein sequence similarity (k-mer Jaccard)
- Search ligands (drug candidates) by name or SMILES
- Query drug-target binding data (IC50, Kd, Ki)
- Search 3D structures by PDB ID or method (X-ray, NMR, Cryo-EM)
- Check data quality summary (field coverage, outcome distribution)

When answering:
- Be concise and scientific
- Use both Korean and English terms where appropriate
- Format data clearly using tables or bullet points
- Suggest next steps when relevant (e.g., "Try adjusting pH" or "You might want to check similar conditions")
- If the user asks about a specific protein, search for it first
- When recommending conditions, explain why based on the data

You have access to the KBSI protein crystallization database containing protein information,
construct designs, and experimental data (expression, purification, crystallization, etc.).`;
