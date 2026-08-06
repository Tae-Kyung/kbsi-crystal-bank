import { describe, it, expect } from 'vitest';
import { crystallizationCreateSchema } from '@/lib/validations/protein';
import { VALID_CRYSTALLIZATION_CREATE } from '../fixtures/proteins';

describe('Crystallization API Validation', () => {
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

  it('accepts all outcome values', () => {
    const outcomes = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
    for (const outcome of outcomes) {
      const result = crystallizationCreateSchema.safeParse({ construct_id: 1, outcome });
      expect(result.success).toBe(true);
    }
  });
});
