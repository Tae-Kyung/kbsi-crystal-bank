import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proteinCreateSchema, proteinUpdateSchema } from '@/lib/validations/protein';
import { VALID_PROTEIN_CREATE, INVALID_PROTEIN_CREATE } from '../fixtures/proteins';

describe('Protein Validation Schemas', () => {
  describe('proteinCreateSchema', () => {
    it('accepts valid protein data', () => {
      const result = proteinCreateSchema.safeParse(VALID_PROTEIN_CREATE);
      expect(result.success).toBe(true);
    });

    it('rejects missing full_name', () => {
      const result = proteinCreateSchema.safeParse(INVALID_PROTEIN_CREATE);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors).toHaveProperty('full_name');
      }
    });

    it('rejects empty full_name', () => {
      const result = proteinCreateSchema.safeParse({ full_name: '' });
      expect(result.success).toBe(false);
    });

    it('accepts minimal data (only full_name)', () => {
      const result = proteinCreateSchema.safeParse({ full_name: 'Test' });
      expect(result.success).toBe(true);
    });

    it('allows null optional fields', () => {
      const result = proteinCreateSchema.safeParse({
        full_name: 'Test',
        abbreviation: null,
        gene_name: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('proteinUpdateSchema', () => {
    it('accepts partial update (only abbreviation)', () => {
      const result = proteinUpdateSchema.safeParse({ abbreviation: 'NEW' });
      expect(result.success).toBe(true);
    });

    it('accepts empty object (no changes)', () => {
      const result = proteinUpdateSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
