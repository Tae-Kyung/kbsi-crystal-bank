import { describe, it, expect } from 'vitest';
import { expressionCreateSchema } from '@/lib/validations/protein';

describe('Expression API Validation', () => {
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
