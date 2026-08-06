import { describe, it, expect } from 'vitest';
import { constructCreateSchema, constructUpdateSchema } from '@/lib/validations/protein';
import { VALID_CONSTRUCT_CREATE } from '../fixtures/proteins';

describe('Construct Validation Schemas', () => {
  it('accepts valid construct data', () => {
    const result = constructCreateSchema.safeParse(VALID_CONSTRUCT_CREATE);
    expect(result.success).toBe(true);
  });

  it('rejects missing protein_id', () => {
    const { protein_id, ...rest } = VALID_CONSTRUCT_CREATE;
    const result = constructCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid construct_type', () => {
    const result = constructCreateSchema.safeParse({
      ...VALID_CONSTRUCT_CREATE,
      construct_type: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid construct_type values', () => {
    for (const type of ['full-length', 'domain', 'truncation', 'fusion', 'mutant']) {
      const result = constructCreateSchema.safeParse({
        ...VALID_CONSTRUCT_CREATE,
        construct_type: type,
      });
      expect(result.success).toBe(true);
    }
  });

  it('allows partial update', () => {
    const result = constructUpdateSchema.safeParse({ name: 'Updated' });
    expect(result.success).toBe(true);
  });
});
