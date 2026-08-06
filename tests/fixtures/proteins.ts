/**
 * 테스트용 단백질 데이터 Fixture
 * 모든 테스트에서 공유하는 표준 테스트 데이터
 */

import type { Protein, Construct, Expression, Crystallization } from '@/types/database';

export const MOCK_PROTEINS: Protein[] = [
  {
    id: 1,
    custom_id: 'PROT-001',
    full_name: 'Kirsten Rat Sarcoma Viral Proto-Oncogene',
    abbreviation: 'KRAS',
    gene_name: 'KRAS',
    organism: 'Homo sapiens',
    owner: 'Lab A',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    custom_id: null,
    full_name: 'Epidermal Growth Factor Receptor',
    abbreviation: 'EGFR',
    gene_name: 'EGFR',
    organism: 'Homo sapiens',
    owner: 'Lab A',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
];

export const MOCK_CONSTRUCTS: Construct[] = [
  {
    id: 1,
    protein_id: 1,
    parent_construct_id: null,
    name: 'KRAS-G12D-1-169',
    residues: '1-169',
    construct_type: 'truncation',
    expression_system: 'E. coli BL21(DE3)',
    vector: 'pET-28a',
    dna_sequence: null,
    codon_optimized: null,
    seq_expression: null,
    seq_final: null,
    tag_name: 'His6',
    tag_position: 'N-terminal',
    cleavage_site: null,
    theoretical_mw: 19.3,
    theoretical_pi: 5.2,
    status: 'active',
    seq_hash: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

export const MOCK_EXPRESSIONS: Expression[] = [
  {
    id: 1,
    construct_id: 1,
    attempt_number: 1,
    source_type: 'experimental',
    reference_id: null,
    is_validated: true,
    performed_by: 'Researcher A',
    performed_on: '2024-01-15',
    host: 'E. coli',
    strain: 'BL21(DE3)',
    induction_temp: 18,
    yield_mg_l: 15.5,
    solubility: 'soluble',
    result_level: 'high',
    conditions: 'IPTG 0.5mM, 18°C, 16h',
    notes: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 2,
    construct_id: 1,
    attempt_number: 2,
    source_type: 'experimental',
    reference_id: null,
    is_validated: true,
    performed_by: 'Researcher A',
    performed_on: '2024-01-20',
    host: 'E. coli',
    strain: 'BL21(DE3)',
    induction_temp: 37,
    yield_mg_l: 0,
    solubility: 'insoluble',
    result_level: 'insoluble',
    conditions: 'IPTG 1mM, 37°C, 4h',
    notes: '높은 온도에서 inclusion body 형성',
    created_at: '2024-01-20T00:00:00Z',
    updated_at: '2024-01-20T00:00:00Z',
  },
];

export const MOCK_CRYSTALLIZATIONS: Crystallization[] = [
  {
    id: 1,
    construct_id: 1,
    attempt_number: 1,
    source_type: 'experimental',
    reference_id: null,
    is_validated: true,
    performed_by: 'Researcher B',
    performed_on: '2024-02-01',
    stage: 'screening',
    protein_concentration: 10.0,
    precipitant_type: 'PEG 3350',
    precipitant_conc: 20,
    precipitant_unit: '%',
    salt_type: null,
    salt_conc: null,
    buffer_type: 'Bis-Tris',
    ph: 6.5,
    temperature: 18,
    additive: null,
    drop_ratio: '1:1',
    days_to_crystal: 7,
    outcome: 'single_crystal',
    condition_detail: 'JCSG+ screen, plate A3',
    notes: null,
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 2,
    construct_id: 1,
    attempt_number: 2,
    source_type: 'experimental',
    reference_id: null,
    is_validated: true,
    performed_by: 'Researcher B',
    performed_on: '2024-02-01',
    stage: 'screening',
    protein_concentration: 10.0,
    precipitant_type: 'Ammonium Sulfate',
    precipitant_conc: 2.0,
    precipitant_unit: 'M',
    salt_type: null,
    salt_conc: null,
    buffer_type: 'HEPES',
    ph: 7.5,
    temperature: 18,
    additive: null,
    drop_ratio: '1:1',
    days_to_crystal: null,
    outcome: 'precipitate',
    condition_detail: 'JCSG+ screen, plate B7',
    notes: '즉시 침전 발생',
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
];

// 유효한 생성 요청 body
export const VALID_PROTEIN_CREATE = {
  full_name: 'Test Protein',
  abbreviation: 'TP',
  gene_name: 'TP1',
  organism: 'Homo sapiens',
};

export const INVALID_PROTEIN_CREATE = {
  abbreviation: 'TP',  // full_name 누락 → 400
};

export const VALID_CONSTRUCT_CREATE = {
  protein_id: 1,
  name: 'Test-FL',
  residues: '1-200',
  construct_type: 'full-length' as const,
  expression_system: 'E. coli',
  vector: 'pET-28a',
  tag_name: 'His6',
  tag_position: 'N-terminal' as const,
};

export const VALID_CRYSTALLIZATION_CREATE = {
  construct_id: 1,
  source_type: 'experimental' as const,
  stage: 'screening' as const,
  protein_concentration: 10.0,
  precipitant_type: 'PEG 4000',
  precipitant_conc: 25,
  precipitant_unit: '%',
  ph: 7.0,
  temperature: 20,
  outcome: 'clear' as const,
};
