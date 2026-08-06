import { describe, it, expect } from 'vitest';
import {
  extractFeatures,
  featuresToArray,
  euclideanDistance,
  findKNearest,
  estimateSuccessProbability,
} from '@/lib/ml/features';

describe('extractFeatures', () => {
  it('extracts numeric features from crystallization record', () => {
    const f = extractFeatures({
      protein_concentration: 10,
      precipitant_type: 'PEG 3350',
      precipitant_conc: 20,
      ph: 6.5,
      temperature: 18,
      additive: null,
      outcome: 'single_crystal',
    });

    expect(f.protein_concentration).toBe(10);
    expect(f.precipitant_type_encoded).toBe(1); // PEG 3350 = 1
    expect(f.ph).toBe(6.5);
    expect(f.has_additive).toBe(0);
    expect(f.outcome_rank).toBe(4); // single_crystal = 4
  });

  it('handles null values', () => {
    const f = extractFeatures({});
    expect(f.protein_concentration).toBeNull();
    expect(f.precipitant_type_encoded).toBe(0);
    expect(f.outcome_rank).toBe(-1);
  });

  it('encodes additive presence as binary', () => {
    const withAdditive = extractFeatures({ additive: 'Glycerol' });
    const withoutAdditive = extractFeatures({ additive: null });
    expect(withAdditive.has_additive).toBe(1);
    expect(withoutAdditive.has_additive).toBe(0);
  });
});

describe('featuresToArray', () => {
  it('converts features to number array with null defaults', () => {
    const f = extractFeatures({ ph: 7.0, temperature: 20 });
    const arr = featuresToArray(f);
    expect(arr).toHaveLength(6);
    expect(arr[3]).toBe(7.0); // ph
    expect(arr[4]).toBe(20);  // temperature
    expect(arr[0]).toBe(0);   // null protein_concentration → 0
  });
});

describe('euclideanDistance', () => {
  it('returns 0 for identical vectors', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('calculates correct distance', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
  });
});

describe('findKNearest', () => {
  const dataset = [
    extractFeatures({ ph: 6.0, temperature: 18, outcome: 'clear' }),
    extractFeatures({ ph: 7.0, temperature: 20, outcome: 'single_crystal' }),
    extractFeatures({ ph: 8.0, temperature: 22, outcome: 'precipitate' }),
    extractFeatures({ ph: 6.5, temperature: 18, outcome: 'diffraction_quality' }),
  ];

  it('returns k nearest neighbors', () => {
    const query = extractFeatures({ ph: 6.5, temperature: 18 });
    const results = findKNearest(query, dataset, 2);
    expect(results).toHaveLength(2);
    expect(results[0].distance).toBeLessThanOrEqual(results[1].distance);
  });

  it('closest neighbor to ph=6.0 is the first record', () => {
    const query = extractFeatures({ ph: 6.0, temperature: 18 });
    const results = findKNearest(query, dataset, 1);
    expect(results[0].index).toBe(0);
  });
});

describe('estimateSuccessProbability', () => {
  it('returns 1.0 when all neighbors are successful', () => {
    const neighbors = [
      { features: extractFeatures({ outcome: 'single_crystal' }) },
      { features: extractFeatures({ outcome: 'diffraction_quality' }) },
    ];
    expect(estimateSuccessProbability(neighbors)).toBe(1.0);
  });

  it('returns 0.0 when no neighbors are successful', () => {
    const neighbors = [
      { features: extractFeatures({ outcome: 'clear' }) },
      { features: extractFeatures({ outcome: 'precipitate' }) },
    ];
    expect(estimateSuccessProbability(neighbors)).toBe(0.0);
  });

  it('returns 0.5 when half are successful', () => {
    const neighbors = [
      { features: extractFeatures({ outcome: 'single_crystal' }) },
      { features: extractFeatures({ outcome: 'clear' }) },
    ];
    expect(estimateSuccessProbability(neighbors)).toBe(0.5);
  });

  it('returns 0 for empty array', () => {
    expect(estimateSuccessProbability([])).toBe(0);
  });
});
