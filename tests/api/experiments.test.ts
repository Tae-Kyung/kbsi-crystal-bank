import { describe, it, expect } from 'vitest';
import {
  expressionCreateSchema,
  crystallizationCreateSchema,
  purificationCreateSchema,
  characterizationCreateSchema,
  diffractionCreateSchema,
  structureCreateSchema,
} from '@/lib/validations/protein';
import { VALID_CRYSTALLIZATION_CREATE } from '../fixtures/proteins';

describe('Expression Validation', () => {
  it('accepts valid expression', () => {
    const result = expressionCreateSchema.safeParse({
      construct_id: 1,
      host: 'E. coli',
      result_level: 'high',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid result_level', () => {
    const result = expressionCreateSchema.safeParse({
      construct_id: 1,
      result_level: 'super_high',
    });
    expect(result.success).toBe(false);
  });

  it('defaults source_type to experimental', () => {
    const result = expressionCreateSchema.safeParse({ construct_id: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_type).toBe('experimental');
    }
  });
});

describe('Crystallization Validation', () => {
  it('accepts valid crystallization', () => {
    const result = crystallizationCreateSchema.safeParse(VALID_CRYSTALLIZATION_CREATE);
    expect(result.success).toBe(true);
  });

  it('rejects pH out of range', () => {
    const result = crystallizationCreateSchema.safeParse({
      ...VALID_CRYSTALLIZATION_CREATE,
      ph: 15,
    });
    expect(result.success).toBe(false);
  });

  it('rejects temperature out of range', () => {
    const result = crystallizationCreateSchema.safeParse({
      ...VALID_CRYSTALLIZATION_CREATE,
      temperature: 200,
    });
    expect(result.success).toBe(false);
  });

  it('accepts all outcome values in order', () => {
    const outcomes = [
      'clear', 'precipitate', 'phase_separation',
      'microcrystal', 'single_crystal', 'diffraction_quality',
    ];
    for (const outcome of outcomes) {
      const result = crystallizationCreateSchema.safeParse({
        construct_id: 1,
        outcome,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('Purification Validation', () => {
  it('accepts valid purification', () => {
    const result = purificationCreateSchema.safeParse({
      construct_id: 1,
      method_summary: 'Ni-NTA + SEC',
      result_level: 'high',
    });
    expect(result.success).toBe(true);
  });

  it('rejects purity > 100', () => {
    const result = purificationCreateSchema.safeParse({
      construct_id: 1,
      final_purity: 105,
    });
    expect(result.success).toBe(false);
  });
});

describe('Characterization Validation', () => {
  it('requires method field', () => {
    const result = characterizationCreateSchema.safeParse({
      construct_id: 1,
      value_num: 42.5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid characterization', () => {
    const result = characterizationCreateSchema.safeParse({
      construct_id: 1,
      method: 'DLS_PDI',
      value_num: 0.15,
      unit_normalized: '',
    });
    expect(result.success).toBe(true);
  });
});

describe('Diffraction Validation', () => {
  it('accepts valid diffraction', () => {
    const result = diffractionCreateSchema.safeParse({
      construct_id: 1,
      resolution: 2.0,
      space_group: 'P212121',
    });
    expect(result.success).toBe(true);
  });
});

describe('Structure Validation', () => {
  it('requires method', () => {
    const result = structureCreateSchema.safeParse({ construct_id: 1 });
    expect(result.success).toBe(false);
  });

  it('accepts all method values', () => {
    for (const method of ['X-ray', 'NMR', 'Cryo-EM']) {
      const result = structureCreateSchema.safeParse({ construct_id: 1, method });
      expect(result.success).toBe(true);
    }
  });
});
