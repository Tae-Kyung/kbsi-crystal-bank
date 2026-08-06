import { describe, it, expect } from 'vitest';
import { proteinCreateSchema } from '@/lib/validations/protein';
import { VALID_PROTEIN_CREATE, INVALID_PROTEIN_CREATE } from '../fixtures/proteins';

describe('Protein Form Validation', () => {
  it('accepts valid protein create data', () => {
    const result = proteinCreateSchema.safeParse(VALID_PROTEIN_CREATE);
    expect(result.success).toBe(true);
  });

  it('rejects protein without full_name', () => {
    const result = proteinCreateSchema.safeParse(INVALID_PROTEIN_CREATE);
    expect(result.success).toBe(false);
  });

  it('accepts protein with only full_name', () => {
    const result = proteinCreateSchema.safeParse({ full_name: 'Test' });
    expect(result.success).toBe(true);
  });

  it('rejects empty full_name', () => {
    const result = proteinCreateSchema.safeParse({ full_name: '' });
    expect(result.success).toBe(false);
  });
});
