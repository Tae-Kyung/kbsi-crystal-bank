import { describe, it, expect } from 'vitest';

describe('AlphaFold Client', () => {
  it('module exports fetchAlphaFoldPrediction', async () => {
    const mod = await import('@/lib/external/alphafold');
    expect(typeof mod.fetchAlphaFoldPrediction).toBe('function');
  });

  it('module exports getAlphaFoldModelUrl', async () => {
    const mod = await import('@/lib/external/alphafold');
    expect(typeof mod.getAlphaFoldModelUrl).toBe('function');
  });

  it('getAlphaFoldModelUrl generates correct URL', async () => {
    const { getAlphaFoldModelUrl } = await import('@/lib/external/alphafold');
    const url = getAlphaFoldModelUrl('P12345');
    expect(url).toBe('https://alphafold.ebi.ac.uk/files/AF-P12345-F1-model_v4.pdb');
  });

  it('getAlphaFoldModelUrl supports custom version', async () => {
    const { getAlphaFoldModelUrl } = await import('@/lib/external/alphafold');
    const url = getAlphaFoldModelUrl('P12345', 3);
    expect(url).toBe('https://alphafold.ebi.ac.uk/files/AF-P12345-F1-model_v3.pdb');
  });

  it('getAlphaFoldPaeUrl generates correct URL', async () => {
    const { getAlphaFoldPaeUrl } = await import('@/lib/external/alphafold');
    const url = getAlphaFoldPaeUrl('Q9Y6K9');
    expect(url).toBe('https://alphafold.ebi.ac.uk/files/AF-Q9Y6K9-F1-predicted_aligned_error_v4.json');
  });
});
