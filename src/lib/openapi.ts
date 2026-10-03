/**
 * OpenAPI 3.0 Specification for KBSI Protein Crystallization Bank API
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'KBSI Protein Crystallization Bank API',
    description: '단백질 결정화은행(Crystallization Bank) 기반 신약개발 AI 데이터 허브 API.\n단백질의 발현 → 정제 → 특성분석 → 결정화 → 구조결정 전 과정의 실험 데이터를 관리합니다.',
    version: '1.0.0',
    contact: {
      name: 'KBSI',
      url: 'https://kbsi-crystal-bank.vercel.app',
    },
  },
  servers: [
    { url: '/', description: 'Current server' },
  ],
  tags: [
    { name: 'Proteins', description: '단백질 관리' },
    { name: 'Constructs', description: 'Construct 관리' },
    { name: 'Expression', description: '발현 실험' },
    { name: 'Purification', description: '정제 실험' },
    { name: 'Crystallization', description: '결정화 실험' },
    { name: 'Characterization', description: '특성분석' },
    { name: 'Diffraction', description: '회절 실험' },
    { name: 'Structure', description: '구조결정' },
    { name: 'Storage', description: '시료 보관' },
    { name: 'NMR', description: 'NMR 실험' },
    { name: 'CryoEM', description: 'Cryo-EM 세션' },
    { name: 'Ligands', description: '리간드 관리' },
    { name: 'AI/ML', description: 'AI 추천 및 예측' },
    { name: 'LLM', description: 'LLM 문헌 추출 및 챗봇' },
    { name: 'Staging', description: 'Staging 검토' },
    { name: 'Export', description: '데이터 Export' },
    { name: 'Import', description: '데이터 Import' },
    { name: 'PDB Import', description: 'PDB 데이터 가져오기' },
  ],
  paths: {
    // ─── Proteins ───
    '/api/proteins': {
      get: {
        tags: ['Proteins'],
        summary: '단백질 목록 조회',
        description: '페이지네이션 및 검색을 지원하는 단백질 목록을 반환합니다.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: '이름/약어/유전자명 검색' },
        ],
        responses: {
          '200': {
            description: '성공',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProteinListResponse' } } },
          },
        },
      },
      post: {
        tags: ['Proteins'],
        summary: '단백질 생성',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProteinCreate' } } },
        },
        responses: {
          '201': { description: '생성됨', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProteinResponse' } } } },
          '400': { description: '유효성 검증 실패' },
        },
      },
    },
    '/api/proteins/{id}': {
      get: {
        tags: ['Proteins'],
        summary: '단백질 상세 조회',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '성공' }, '404': { description: 'Not found' } },
      },
      put: {
        tags: ['Proteins'],
        summary: '단백질 수정',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProteinCreate' } } } },
        responses: { '200': { description: '수정됨' }, '404': { description: 'Not found' } },
      },
      delete: {
        tags: ['Proteins'],
        summary: '단백질 삭제',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '삭제됨' }, '404': { description: 'Not found' } },
      },
    },
    // ─── Constructs ───
    '/api/constructs': {
      get: {
        tags: ['Constructs'],
        summary: 'Construct 목록 조회',
        parameters: [
          { name: 'protein_id', in: 'query', schema: { type: 'integer' }, description: '단백질 ID로 필터' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: '성공', content: { 'application/json': { schema: { $ref: '#/components/schemas/ConstructListResponse' } } } } },
      },
      post: {
        tags: ['Constructs'],
        summary: 'Construct 생성',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ConstructCreate' } } } },
        responses: { '201': { description: '생성됨' }, '400': { description: '유효성 검증 실패' } },
      },
    },
    '/api/constructs/{id}': {
      get: {
        tags: ['Constructs'],
        summary: 'Construct 상세 조회',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '성공' } },
      },
      put: {
        tags: ['Constructs'],
        summary: 'Construct 수정',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ConstructCreate' } } } },
        responses: { '200': { description: '수정됨' } },
      },
      delete: {
        tags: ['Constructs'],
        summary: 'Construct 삭제',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '삭제됨' } },
      },
    },
    // ─── Experiment APIs (공통 패턴) ───
    ...experimentPaths('expressions', 'Expression', '발현'),
    ...experimentPaths('purifications', 'Purification', '정제'),
    ...experimentPaths('crystallizations', 'Crystallization', '결정화'),
    ...experimentPaths('characterizations', 'Characterization', '특성분석'),
    ...experimentPaths('diffractions', 'Diffraction', '회절'),
    ...experimentPaths('structures', 'Structure', '구조결정'),
    ...experimentPaths('storages', 'Storage', '보관'),
    ...experimentPaths('nmr-experiments', 'NMR', 'NMR'),
    ...experimentPaths('cryoem-sessions', 'CryoEM', 'Cryo-EM'),
    // ─── Ligands ───
    '/api/ligands': {
      get: {
        tags: ['Ligands'],
        summary: '리간드 목록 조회',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: '성공' } },
      },
      post: {
        tags: ['Ligands'],
        summary: '리간드 생성',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LigandCreate' } } } },
        responses: { '201': { description: '생성됨' } },
      },
    },
    '/api/construct-ligands': {
      get: {
        tags: ['Ligands'],
        summary: 'Construct-Ligand 바인딩 목록',
        parameters: [{ name: 'construct_id', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': { description: '성공' } },
      },
      post: {
        tags: ['Ligands'],
        summary: 'Construct-Ligand 바인딩 생성',
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { '201': { description: '생성됨' } },
      },
    },
    // ─── AI/ML ───
    '/api/recommend': {
      get: {
        tags: ['AI/ML'],
        summary: '결정화 조건 추천 (k-NN)',
        description: '입력된 조건과 유사한 과거 실험을 k-NN으로 찾아 성공 조건을 추천합니다.',
        parameters: [
          { name: 'ph', in: 'query', schema: { type: 'number' }, description: 'pH 값' },
          { name: 'temperature', in: 'query', schema: { type: 'number' }, description: '온도 (°C)' },
          { name: 'precipitant_type', in: 'query', schema: { type: 'string' }, description: '침전제 종류' },
          { name: 'precipitant_conc', in: 'query', schema: { type: 'number' }, description: '침전제 농도' },
          { name: 'protein_concentration', in: 'query', schema: { type: 'number' }, description: '단백질 농도 (mg/mL)' },
          { name: 'k', in: 'query', schema: { type: 'integer', default: 10 }, description: '이웃 수' },
        ],
        responses: {
          '200': {
            description: '추천 결과',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RecommendResponse' } } },
          },
        },
      },
    },
    '/api/predict': {
      post: {
        tags: ['AI/ML'],
        summary: '결정화 성공 확률 예측',
        description: 'k-NN 기반으로 주어진 조건에서의 결정화 성공 확률을 추정합니다.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  protein_concentration: { type: 'number', description: '단백질 농도 (mg/mL)' },
                  precipitant_type: { type: 'string', description: '침전제 종류' },
                  precipitant_conc: { type: 'number', description: '침전제 농도' },
                  ph: { type: 'number', description: 'pH 값' },
                  temperature: { type: 'number', description: '온도 (°C)' },
                  additive: { type: 'string', description: '첨가제' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: '예측 결과',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PredictResponse' } } },
          },
        },
      },
    },
    // ─── LLM ───
    '/api/extract': {
      post: {
        tags: ['LLM'],
        summary: '논문 텍스트에서 실험 데이터 추출',
        description: 'LLM을 사용하여 논문 텍스트에서 구조화된 실험 데이터를 추출하고 staging 테이블에 저장합니다.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['text', 'target_table'],
                properties: {
                  text: { type: 'string', description: '논문 텍스트 (최대 15,000자)' },
                  doi: { type: 'string', description: 'DOI (optional)' },
                  target_table: {
                    type: 'string',
                    enum: ['kbsi_expression', 'kbsi_crystallization', 'kbsi_purification'],
                    description: '추출 대상 테이블',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '추출 완료' },
          '500': { description: 'LLM 호출 실패' },
        },
      },
    },
    '/api/chat-to-form': {
      post: {
        tags: ['LLM'],
        summary: '자연어 → 폼 데이터 변환',
        description: '연구자의 자연어 메모를 구조화된 폼 데이터로 변환합니다.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text', 'experimentType'],
                properties: {
                  text: { type: 'string', description: '자연어 입력' },
                  experimentType: {
                    type: 'string',
                    enum: ['expression', 'crystallization', 'purification', 'characterization', 'structure'],
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: '파싱 결과 (JSON)' } },
      },
    },
    '/api/chat': {
      post: {
        tags: ['LLM'],
        summary: 'AI 챗봇 (스트리밍)',
        description: 'Vercel AI SDK 기반 스트리밍 챗봇. 단백질 검색, 조건 추천, 예측 등 function calling을 지원합니다.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['messages'],
                properties: {
                  messages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['role', 'content'],
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                        content: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSE 스트리밍 응답 (text/event-stream)',
            content: { 'text/event-stream': {} },
          },
        },
      },
    },
    // ─── Staging ───
    '/api/staging': {
      get: {
        tags: ['Staging'],
        summary: 'Staging 레코드 목록 조회',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } },
        ],
        responses: { '200': { description: '성공' } },
      },
      patch: {
        tags: ['Staging'],
        summary: 'Staging 레코드 승인/거부',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'action'],
                properties: {
                  id: { type: 'integer' },
                  action: { type: 'string', enum: ['approve', 'reject'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: '처리됨' } },
      },
    },
    // ─── Export / Import ───
    '/api/export': {
      get: {
        tags: ['Export'],
        summary: '데이터 Export (CSV/JSON)',
        parameters: [
          {
            name: 'table', in: 'query', required: true,
            schema: {
              type: 'string',
              enum: ['kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification',
                'kbsi_crystallization', 'kbsi_characterization', 'kbsi_structure', 'kbsi_diffraction', 'kbsi_storage'],
            },
          },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'], default: 'json' } },
          { name: 'construct_id', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: '데이터' }, '400': { description: 'Invalid table' } },
      },
    },
    '/api/export/ml-dataset': {
      get: {
        tags: ['Export'],
        summary: 'ML 학습 데이터셋 Export',
        description: '결정화 데이터를 ML 학습용 포맷(CSV/JSON)으로 export합니다. 이진분류 옵션 지원.',
        parameters: [
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'], default: 'json' } },
          { name: 'binary', in: 'query', schema: { type: 'boolean', default: false }, description: '이진분류 (success/fail)' },
        ],
        responses: { '200': { description: '데이터셋' } },
      },
    },
    '/api/import': {
      post: {
        tags: ['Import'],
        summary: 'CSV 일괄 가져오기',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, table: { type: 'string' } } } } },
        },
        responses: { '200': { description: 'Import 완료' } },
      },
    },
    // ─── PDB Import ───
    '/api/pdb-import': {
      get: {
        tags: ['PDB Import'],
        summary: 'PDB 구조 검색',
        parameters: [
          { name: 'query', in: 'query', required: true, schema: { type: 'string' }, description: 'PDB ID 또는 단백질 이름' },
        ],
        responses: { '200': { description: 'PDB 검색 결과' } },
      },
      post: {
        tags: ['PDB Import'],
        summary: 'PDB 구조 가져오기',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  pdbId: { type: 'string', description: 'PDB ID' },
                  pdbIds: { type: 'array', items: { type: 'string' }, description: '일괄 등록용 PDB ID 배열' },
                },
              },
            },
          },
        },
        responses: { '201': { description: '등록됨' } },
      },
    },
    '/api/pdb-import/featured': {
      get: {
        tags: ['PDB Import'],
        summary: '추천 단백질 목록',
        responses: { '200': { description: '추천 단백질 목록' } },
      },
      post: {
        tags: ['PDB Import'],
        summary: '추천 단백질 추가',
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { '201': { description: '추가됨' } },
      },
    },
    '/api/pdb-import/featured/suggest': {
      get: {
        tags: ['PDB Import'],
        summary: '카테고리별 PDB 추천',
        parameters: [{ name: 'category', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: '추천 목록' } },
      },
    },
    '/api/pdb-import/enrich': {
      post: {
        tags: ['PDB Import'],
        summary: '결정화 조건 LLM 파싱 (Condition Enrichment)',
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { '200': { description: '파싱 결과' } },
      },
    },
    '/api/pdb-import/negative-controls': {
      post: {
        tags: ['PDB Import'],
        summary: 'Negative Control 합성 (Data Augmentation)',
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { '200': { description: '합성 데이터' } },
      },
    },
  },
  components: {
    schemas: {
      Protein: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          custom_id: { type: 'string', description: '사용자 지정 ID' },
          full_name: { type: 'string', description: '전체 이름' },
          abbreviation: { type: 'string', description: '약어' },
          gene_name: { type: 'string', description: '유전자명' },
          organism: { type: 'string', description: '생물종' },
          source_type: { type: 'string', enum: ['human', 'pdb', 'synthetic'], description: '데이터 출처' },
          owner: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      ProteinCreate: {
        type: 'object',
        required: ['full_name'],
        properties: {
          custom_id: { type: 'string' },
          full_name: { type: 'string' },
          abbreviation: { type: 'string' },
          gene_name: { type: 'string' },
          organism: { type: 'string' },
          description: { type: 'string' },
          function_summary: { type: 'string' },
          uniprot_id: { type: 'string' },
          sequence: { type: 'string' },
        },
      },
      ProteinListResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Protein' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        },
      },
      ProteinResponse: {
        type: 'object',
        properties: { data: { $ref: '#/components/schemas/Protein' } },
      },
      Construct: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          protein_id: { type: 'integer' },
          name: { type: 'string' },
          construct_type: { type: 'string', enum: ['full-length', 'domain', 'truncation', 'fusion', 'mutant'] },
          expression_system: { type: 'string' },
          vector: { type: 'string' },
          tag_name: { type: 'string' },
          tag_position: { type: 'string' },
          status: { type: 'string' },
        },
      },
      ConstructCreate: {
        type: 'object',
        required: ['protein_id', 'name'],
        properties: {
          protein_id: { type: 'integer' },
          name: { type: 'string' },
          construct_type: { type: 'string' },
          expression_system: { type: 'string' },
          vector: { type: 'string' },
          residues: { type: 'string' },
          tag_name: { type: 'string' },
          tag_position: { type: 'string' },
          dna_sequence: { type: 'string' },
          seq_expression: { type: 'string' },
          seq_final: { type: 'string' },
        },
      },
      ConstructListResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Construct' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        },
      },
      LigandCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          smiles: { type: 'string' },
          molecular_weight: { type: 'number' },
          cas_number: { type: 'string' },
          description: { type: 'string' },
        },
      },
      RecommendResponse: {
        type: 'object',
        properties: {
          query: { type: 'object' },
          k: { type: 'integer' },
          total_data_points: { type: 'integer' },
          success_rate: { type: 'integer', description: '성공률 (%)' },
          recommendations: { type: 'array', items: { type: 'object' } },
          nearest_neighbors: { type: 'array', items: { type: 'object' } },
        },
      },
      PredictResponse: {
        type: 'object',
        properties: {
          prediction: {
            type: 'object',
            properties: {
              success_probability: { type: 'integer', description: '성공 확률 (%)' },
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              k_used: { type: 'integer' },
              data_points_total: { type: 'integer' },
            },
          },
          outcome_distribution: { type: 'object' },
          best_match: { type: 'object', nullable: true },
          query: { type: 'object' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer', nullable: true },
        },
      },
    },
  },
};

/** 실험 API 경로 생성 헬퍼 */
function experimentPaths(endpoint: string, tag: string, label: string) {
  return {
    [`/api/${endpoint}`]: {
      get: {
        tags: [tag],
        summary: `${label} 실험 목록 조회`,
        parameters: [
          { name: 'construct_id', in: 'query', schema: { type: 'integer' }, description: 'Construct ID 필터' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': { description: '성공' } },
      },
      post: {
        tags: [tag],
        summary: `${label} 실험 생성`,
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { '201': { description: '생성됨' }, '400': { description: '유효성 검증 실패' } },
      },
    },
  };
}
