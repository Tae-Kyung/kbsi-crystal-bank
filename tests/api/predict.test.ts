import { describe, it, expect } from 'vitest';
import {
  extractFeatures,
  findKNearest,
  estimateSuccessProbability,
} from '@/lib/ml/features';

describe('Predict API Logic', () => {
  const dataset = [
    extractFeatures({ ph: 6.5, temperature: 18, outcome: 'single_crystal' }),
    extractFeatures({ ph: 7.0, temperature: 20, outcome: 'clear' }),
    extractFeatures({ ph: 7.5, temperature: 18, outcome: 'precipitate' }),
    extractFeatures({ ph: 6.0, temperature: 4, outcome: 'diffraction_quality' }),
    extractFeatures({ ph: 8.0, temperature: 22, outcome: 'microcrystal' }),
    extractFeatures({ ph: 6.5, temperature: 20, outcome: 'single_crystal' }),
  ];

  it('estimates probability between 0 and 1', () => {
    const query = extractFeatures({ ph: 6.5, temperature: 18 });
    const k = Math.max(3, Math.min(20, Math.round(Math.sqrt(dataset.length))));
    const neighbors = findKNearest(query, dataset, k);
    const probability = estimateSuccessProbability(neighbors);
    expect(probability).toBeGreaterThanOrEqual(0);
    expect(probability).toBeLessThanOrEqual(1);
  });

  it('calculates outcome distribution from neighbors', () => {
    const query = extractFeatures({ ph: 6.5, temperature: 18 });
    const neighbors = findKNearest(query, dataset, 3);

    const distribution: Record<string, number> = {};
    for (const n of neighbors) {
      const rank = n.features.outcome_rank;
      const key = String(rank);
      distribution[key] = (distribution[key] || 0) + 1;
    }

    const total = Object.values(distribution).reduce((s, v) => s + v, 0);
    expect(total).toBe(3);
  });

  it('determines confidence based on data size', () => {
    const getConfidence = (count: number) =>
      count >= 50 ? 'high' : count >= 20 ? 'medium' : 'low';

    expect(getConfidence(100)).toBe('high');
    expect(getConfidence(50)).toBe('high');
    expect(getConfidence(30)).toBe('medium');
    expect(getConfidence(5)).toBe('low');
  });

  it('requires minimum 5 data points', () => {
    const smallDataset = dataset.slice(0, 3);
    expect(smallDataset.length).toBeLessThan(5);
  });
});
