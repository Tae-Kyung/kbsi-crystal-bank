import { describe, it, expect } from 'vitest';

describe('PDB Client', () => {
  it('module exports fetchPDBEntry', async () => {
    const mod = await import('@/lib/external/pdb');
    expect(typeof mod.fetchPDBEntry).toBe('function');
  });

  it('module exports searchPDB', async () => {
    const mod = await import('@/lib/external/pdb');
    expect(typeof mod.searchPDB).toBe('function');
  });
});
