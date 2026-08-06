import { describe, it, expect } from 'vitest';
import { purificationCreateSchema } from '@/lib/validations/protein';

describe('Purification API Validation', () => {
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

  it('accepts purification with minimal fields', () => {
    const result = purificationCreateSchema.safeParse({ construct_id: 1 });
    expect(result.success).toBe(true);
  });
});
