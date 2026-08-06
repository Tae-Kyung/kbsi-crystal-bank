import { z } from 'zod';

const constructTypeEnum = z.enum([
  'full-length', 'domain', 'truncation', 'fusion', 'mutant',
]);

const sourceTypeEnum = z.enum(['experimental', 'literature', 'database']);

const expressionResultEnum = z.enum([
  'no_expression', 'insoluble', 'low', 'moderate', 'high',
]);

const purificationResultEnum = z.enum(['failed', 'low', 'acceptable', 'high']);

const crystallizationOutcomeEnum = z.enum([
  'clear', 'precipitate', 'phase_separation',
  'microcrystal', 'single_crystal', 'diffraction_quality',
]);

// --------------------------------------------------------
// Protein
// --------------------------------------------------------
export const proteinCreateSchema = z.object({
  custom_id: z.string().max(50).nullish(),
  full_name: z.string().min(1).max(500),
  abbreviation: z.string().max(50).nullish(),
  gene_name: z.string().max(100).nullish(),
  organism: z.string().max(200).nullish(),
  owner: z.string().max(100).nullish(),
});

export const proteinUpdateSchema = proteinCreateSchema.partial();

// --------------------------------------------------------
// Construct
// --------------------------------------------------------
export const constructCreateSchema = z.object({
  protein_id: z.number().int().positive(),
  parent_construct_id: z.number().int().positive().nullish(),
  name: z.string().max(200).nullish(),
  residues: z.string().max(50).nullish(),
  construct_type: constructTypeEnum.nullish(),
  expression_system: z.string().max(200).nullish(),
  vector: z.string().max(100).nullish(),
  dna_sequence: z.string().nullish(),
  codon_optimized: z.boolean().nullish(),
  seq_expression: z.string().nullish(),
  seq_final: z.string().nullish(),
  tag_name: z.string().max(50).nullish(),
  tag_position: z.enum(['N-terminal', 'C-terminal']).nullish(),
  cleavage_site: z.string().max(50).nullish(),
  theoretical_mw: z.number().positive().nullish(),
  theoretical_pi: z.number().min(0).max(14).nullish(),
  status: z.string().max(50).nullish(),
});

export const constructUpdateSchema = constructCreateSchema.partial();

// --------------------------------------------------------
// Expression
// --------------------------------------------------------
export const expressionCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: sourceTypeEnum.default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  host: z.string().max(200).nullish(),
  strain: z.string().max(200).nullish(),
  induction_temp: z.number().nullish(),
  yield_mg_l: z.number().min(0).nullish(),
  solubility: z.string().nullish(),
  result_level: expressionResultEnum.nullish(),
  conditions: z.string().nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

// --------------------------------------------------------
// Crystallization
// --------------------------------------------------------
export const crystallizationCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: sourceTypeEnum.default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  stage: z.enum(['screening', 'optimization']).nullish(),
  protein_concentration: z.number().positive().nullish(),
  precipitant_type: z.string().max(200).nullish(),
  precipitant_conc: z.number().min(0).nullish(),
  precipitant_unit: z.string().max(20).nullish(),
  salt_type: z.string().max(200).nullish(),
  salt_conc: z.number().min(0).nullish(),
  buffer_type: z.string().max(200).nullish(),
  ph: z.number().min(0).max(14).nullish(),
  temperature: z.number().min(-80).max(100).nullish(),
  additive: z.string().nullish(),
  drop_ratio: z.string().max(20).nullish(),
  days_to_crystal: z.number().int().min(0).nullish(),
  outcome: crystallizationOutcomeEnum.nullish(),
  condition_detail: z.string().nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

// --------------------------------------------------------
// Purification
// --------------------------------------------------------
export const purificationCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: sourceTypeEnum.default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  method_summary: z.string().nullish(),
  final_purity: z.number().min(0).max(100).nullish(),
  final_yield: z.number().min(0).nullish(),
  result_level: purificationResultEnum.nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

// --------------------------------------------------------
// Characterization
// --------------------------------------------------------
export const characterizationCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: sourceTypeEnum.default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  method: z.string().min(1),
  value_num: z.number().nullish(),
  value_text: z.string().nullish(),
  unit_normalized: z.string().nullish(),
  unit_raw: z.string().nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

// --------------------------------------------------------
// Diffraction
// --------------------------------------------------------
export const diffractionCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: sourceTypeEnum.default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  crystal_id: z.string().nullish(),
  beamline: z.string().nullish(),
  resolution: z.number().positive().nullish(),
  space_group: z.string().nullish(),
  unit_cell: z.string().nullish(),
  data_quality: z.string().nullish(),
  phasing: z.string().nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

// --------------------------------------------------------
// Structure
// --------------------------------------------------------
export const structureCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: sourceTypeEnum.default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  method: z.enum(['X-ray', 'NMR', 'Cryo-EM']),
  resolution: z.number().positive().nullish(),
  pdb_id: z.string().nullish(),
  emdb_id: z.string().nullish(),
  bmrb_id: z.string().nullish(),
  publication_ref_id: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

// --------------------------------------------------------
// Extraction Staging
// --------------------------------------------------------
export const extractionStagingCreateSchema = z.object({
  reference_id: z.number().int().positive().nullish(),
  target_table: z.string().min(1),
  extracted_payload: z.record(z.unknown()),
  source_location: z.string().nullish(),
  source_snippet: z.string().nullish(),
  extracted_by: z.string().nullish(),
  model_version: z.string().nullish(),
  extraction_confidence: z.number().min(0).max(1).nullish(),
});

export const extractionReviewSchema = z.object({
  review_status: z.enum(['approved', 'rejected']),
  reviewed_by: z.string().min(1),
  review_notes: z.string().nullish(),
});
