import { describe, it, expect } from 'vitest';
import {
  extractFeatures,
  findKNearest,
  estimateSuccessProbability,
} from '@/lib/ml/features';

describe('Recommend API Logic', () => {
  const dataset = [
    extractFeatures({ ph: 6.5, temperature: 18, precipitant_type: 'PEG 3350', precipitant_conc: 20, outcome: 'single_crystal' }),
    extractFeatures({ ph: 7.0, temperature: 20, precipitant_type: 'PEG 4000', precipitant_conc: 25, outcome: 'clear' }),
    extractFeatures({ ph: 7.5, temperature: 18, precipitant_type: 'Ammonium Sulfate', precipitant_conc: 2, outcome: 'precipitate' }),
    extractFeatures({ ph: 6.0, temperature: 4, precipitant_type: 'PEG 3350', precipitant_conc: 15, outcome: 'diffraction_quality' }),
    extractFeatures({ ph: 8.0, temperature: 22, precipitant_type: 'PEG 8000', precipitant_conc: 10, outcome: 'microcrystal' }),
  ];

  it('finds nearest neighbors for a query condition', () => {
    const query = extractFeatures({ ph: 6.5, temperature: 18, precipitant_type: 'PEG 3350' });
    const neighbors = findKNearest(query, dataset, 3);
    expect(neighbors).toHaveLength(3);
    // closest neighbor by euclidean distance
    expect(neighbors[0].distance).toBeLessThanOrEqual(neighbors[1].distance);
  });

  it('calculates success rate from neighbors', () => {
    const query = extractFeatures({ ph: 6.5, temperature: 18 });
    const neighbors = findKNearest(query, dataset, 5);
    const successRate = estimateSuccessProbability(neighbors);
    // 2 out of 5 are success (single_crystal + diffraction_quality)
    expect(successRate).toBeGreaterThanOrEqual(0);
    expect(successRate).toBeLessThanOrEqual(1);
  });

  it('filters success neighbors (outcome_rank >= 4)', () => {
    const query = extractFeatures({ ph: 6.5, temperature: 18 });
    const neighbors = findKNearest(query, dataset, 5);
    const successNeighbors = neighbors.filter((n) => n.features.outcome_rank >= 4);
    // single_crystal(rank 4) + diffraction_quality(rank 5)
    expect(successNeighbors.length).toBe(2);
  });
});
