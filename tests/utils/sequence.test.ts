import { describe, it, expect } from 'vitest';
import {
  validateProteinSequence,
  calculateMW,
  calculatePI,
  calculateSeqHash,
} from '@/lib/utils/sequence';

describe('validateProteinSequence', () => {
  it('accepts valid amino acid sequences', () => {
    expect(validateProteinSequence('ACDEFGHIKLMNPQRSTVWY')).toBe(true);
    expect(validateProteinSequence('acde')).toBe(true); // lowercase OK
    expect(validateProteinSequence('A C D E')).toBe(true); // spaces ignored
  });

  it('rejects invalid characters', () => {
    expect(validateProteinSequence('ACDE123')).toBe(false);
    expect(validateProteinSequence('ACDEXYZ')).toBe(false); // B, J, O, U, X, Z are invalid
    expect(validateProteinSequence('')).toBe(false);
  });
});

describe('calculateMW', () => {
  it('calculates MW for single amino acid (Alanine)', () => {
    // A = 71.08 + 18.015 (water) = 89.095
    const mw = calculateMW('A');
    expect(mw).toBeCloseTo(89.10, 1);
  });

  it('calculates MW for a short peptide', () => {
    // AG = 71.08 + 57.05 + 18.015 = 146.145
    const mw = calculateMW('AG');
    expect(mw).toBeCloseTo(146.15, 1);
  });

  it('calculates MW for all 20 amino acids', () => {
    const mw = calculateMW('ACDEFGHIKLMNPQRSTVWY');
    // 합계: 2395.72 + 18.015 = 2413.735
    expect(mw).toBeGreaterThan(2000);
    expect(mw).toBeLessThan(3000);
  });

  it('throws on invalid sequence', () => {
    expect(() => calculateMW('AXZ')).toThrow('Invalid protein sequence');
  });

  it('handles case insensitivity', () => {
    expect(calculateMW('acde')).toBe(calculateMW('ACDE'));
  });
});

describe('calculatePI', () => {
  it('returns pI in valid range (3-12)', () => {
    const pi = calculatePI('ACDEFGHIKLMNPQRSTVWY');
    expect(pi).toBeGreaterThan(3);
    expect(pi).toBeLessThan(12);
  });

  it('acidic protein has low pI', () => {
    // Mostly D and E (acidic residues)
    const pi = calculatePI('DDDDEEEE');
    expect(pi).toBeLessThan(5);
  });

  it('basic protein has high pI', () => {
    // Mostly K and R (basic residues)
    const pi = calculatePI('KKKKRRRR');
    expect(pi).toBeGreaterThan(10);
  });

  it('throws on invalid sequence', () => {
    expect(() => calculatePI('123')).toThrow('Invalid protein sequence');
  });
});

describe('calculateSeqHash', () => {
  it('returns consistent hash for same sequence', () => {
    expect(calculateSeqHash('ACDE')).toBe(calculateSeqHash('ACDE'));
  });

  it('returns different hash for different sequences', () => {
    expect(calculateSeqHash('ACDE')).not.toBe(calculateSeqHash('ACDF'));
  });

  it('is case insensitive', () => {
    expect(calculateSeqHash('acde')).toBe(calculateSeqHash('ACDE'));
  });

  it('ignores whitespace', () => {
    expect(calculateSeqHash('AC DE')).toBe(calculateSeqHash('ACDE'));
  });

  it('returns 64-char hex string (SHA-256)', () => {
    const hash = calculateSeqHash('ACDE');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
