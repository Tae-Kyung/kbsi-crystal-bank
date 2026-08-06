// Auto-mirrored from Supabase schema — run `npx supabase gen types typescript` to regenerate
// This file provides manual type definitions for development before codegen is available

// --------------------------------------------------------
// Enum types (mirroring SQL enums)
// --------------------------------------------------------
export type ConstructType = 'full-length' | 'domain' | 'truncation' | 'fusion' | 'mutant';
export type SourceType = 'experimental' | 'literature' | 'database';
export type ExpressionResult = 'no_expression' | 'insoluble' | 'low' | 'moderate' | 'high';
export type PurificationResult = 'failed' | 'low' | 'acceptable' | 'high';
export type CrystallizationOutcome =
  | 'clear' | 'precipitate' | 'phase_separation'
  | 'microcrystal' | 'single_crystal' | 'diffraction_quality';
export type StructureMethod = 'X-ray' | 'NMR' | 'Cryo-EM';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type TagPosition = 'N-terminal' | 'C-terminal';
export type CrystallizationStage = 'screening' | 'optimization';

// --------------------------------------------------------
// Ordinal rank maps (for ML feature encoding)
// --------------------------------------------------------
export const EXPRESSION_RESULT_RANK: Record<ExpressionResult, number> = {
  no_expression: 0, insoluble: 1, low: 2, moderate: 3, high: 4,
};

export const PURIFICATION_RESULT_RANK: Record<PurificationResult, number> = {
  failed: 0, low: 1, acceptable: 2, high: 3,
};

export const CRYSTALLIZATION_OUTCOME_RANK: Record<CrystallizationOutcome, number> = {
  clear: 0, precipitate: 1, phase_separation: 2,
  microcrystal: 3, single_crystal: 4, diffraction_quality: 5,
};

// --------------------------------------------------------
// Table row types
// --------------------------------------------------------
export interface Protein {
  id: number;
  custom_id: string | null;
  full_name: string;
  abbreviation: string | null;
  gene_name: string | null;
  organism: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatabaseId {
  id: number;
  protein_id: number;
  db_name: string;
  db_value: string;
}

export interface Construct {
  id: number;
  protein_id: number;
  parent_construct_id: number | null;
  name: string | null;
  residues: string | null;
  construct_type: ConstructType | null;
  expression_system: string | null;
  vector: string | null;
  dna_sequence: string | null;
  codon_optimized: boolean | null;
  seq_expression: string | null;
  seq_final: string | null;
  tag_name: string | null;
  tag_position: TagPosition | null;
  cleavage_site: string | null;
  theoretical_mw: number | null;
  theoretical_pi: number | null;
  status: string | null;
  seq_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expression {
  id: number;
  construct_id: number;
  attempt_number: number | null;
  source_type: SourceType;
  reference_id: number | null;
  is_validated: boolean;
  performed_by: string | null;
  performed_on: string | null;
  host: string | null;
  strain: string | null;
  induction_temp: number | null;
  yield_mg_l: number | null;
  solubility: string | null;
  result_level: ExpressionResult | null;
  conditions: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Crystallization {
  id: number;
  construct_id: number;
  attempt_number: number | null;
  source_type: SourceType;
  reference_id: number | null;
  is_validated: boolean;
  performed_by: string | null;
  performed_on: string | null;
  stage: CrystallizationStage | null;
  protein_concentration: number | null;
  precipitant_type: string | null;
  precipitant_conc: number | null;
  precipitant_unit: string | null;
  salt_type: string | null;
  salt_conc: number | null;
  buffer_type: string | null;
  ph: number | null;
  temperature: number | null;
  additive: string | null;
  drop_ratio: string | null;
  days_to_crystal: number | null;
  outcome: CrystallizationOutcome | null;
  condition_detail: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Structure {
  id: number;
  construct_id: number;
  attempt_number: number | null;
  source_type: SourceType;
  reference_id: number | null;
  is_validated: boolean;
  performed_by: string | null;
  performed_on: string | null;
  method: StructureMethod;
  resolution: number | null;
  pdb_id: string | null;
  emdb_id: string | null;
  bmrb_id: string | null;
  publication_ref_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractionStaging {
  id: number;
  reference_id: number | null;
  target_table: string;
  extracted_payload: Record<string, unknown>;
  source_location: string | null;
  source_snippet: string | null;
  extracted_by: string | null;
  model_version: string | null;
  extraction_confidence: number | null;
  extraction_date: string;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface Ligand {
  id: number;
  name: string;
  smiles: string | null;
  inchi: string | null;
  mw: number | null;
  source: string | null;
  created_at: string;
}

export interface Reference {
  id: number;
  title: string | null;
  authors: string | null;
  year: number | null;
  doi: string | null;
  pmid: string | null;
  journal: string | null;
}
