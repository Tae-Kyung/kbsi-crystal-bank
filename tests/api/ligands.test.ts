import { describe, it, expect } from 'vitest';
import { ligandCreateSchema, constructLigandCreateSchema } from '@/lib/validations/ligand';

describe('Ligand Validation', () => {
  it('accepts valid ligand', () => {
    const result = ligandCreateSchema.safeParse({
      name: 'Gefitinib',
      smiles: 'COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1',
      mw: 446.9,
    });
    expect(result.success).toBe(true);
  });

  it('rejects ligand without name', () => {
    const result = ligandCreateSchema.safeParse({ smiles: 'CCO' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = ligandCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts ligand with only name', () => {
    const result = ligandCreateSchema.safeParse({ name: 'ATP' });
    expect(result.success).toBe(true);
  });

  it('rejects negative mw', () => {
    const result = ligandCreateSchema.safeParse({ name: 'Test', mw: -100 });
    expect(result.success).toBe(false);
  });
});

describe('Construct-Ligand Binding Validation', () => {
  it('accepts valid binding', () => {
    const result = constructLigandCreateSchema.safeParse({
      construct_id: 1,
      ligand_id: 1,
      binding_kd: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing construct_id', () => {
    const result = constructLigandCreateSchema.safeParse({ ligand_id: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects negative binding_kd', () => {
    const result = constructLigandCreateSchema.safeParse({
      construct_id: 1,
      ligand_id: 1,
      binding_kd: -0.1,
    });
    expect(result.success).toBe(false);
  });
});
