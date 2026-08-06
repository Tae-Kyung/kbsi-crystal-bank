/**
 * 단백질 서열 유틸리티
 * MW, pI 계산, 해시, 검증
 */

import { createHash } from 'crypto';

// 아미노산별 평균 분자량 (Da) — 잔기 질량 (물 제거 전)
const AA_MW: Record<string, number> = {
  A: 71.08, R: 156.19, N: 114.10, D: 115.09, C: 103.14,
  E: 129.12, Q: 128.13, G: 57.05, H: 137.14, I: 113.16,
  L: 113.16, K: 128.17, M: 131.20, F: 147.18, P: 97.12,
  S: 87.08, T: 101.10, W: 186.21, Y: 163.18, V: 99.13,
};

const WATER_MW = 18.015;

// pKa 값 (Henderson-Hasselbalch 계산용)
const PK = {
  nterm: 9.69,  // N-terminus
  cterm: 2.34,  // C-terminus
  D: 3.65, E: 4.25, C: 8.18, Y: 10.07,
  H: 6.00, K: 10.54, R: 12.48,
};

const VALID_AA = new Set(Object.keys(AA_MW));

/**
 * 단백질 서열 유효성 검증
 * 표준 20개 아미노산 문자만 허용
 */
export function validateProteinSequence(sequence: string): boolean {
  if (!sequence || sequence.length === 0) return false;
  const upper = sequence.toUpperCase().replace(/\s/g, '');
  return [...upper].every((ch) => VALID_AA.has(ch));
}

/**
 * 분자량(MW) 계산 (Da)
 * 각 아미노산 잔기 질량 합 + 물 분자 1개 (양 말단)
 */
export function calculateMW(sequence: string): number {
  const upper = sequence.toUpperCase().replace(/\s/g, '');
  if (!validateProteinSequence(upper)) {
    throw new Error('Invalid protein sequence');
  }

  let mw = WATER_MW; // 펩타이드 결합 형성 후 양 말단에 H + OH 남음
  for (const aa of upper) {
    mw += AA_MW[aa];
  }
  return Math.round(mw * 100) / 100;
}

/**
 * 등전점(pI) 계산 — 이진 탐색
 * pH에서 순전하(net charge)가 0이 되는 지점
 */
export function calculatePI(sequence: string): number {
  const upper = sequence.toUpperCase().replace(/\s/g, '');
  if (!validateProteinSequence(upper)) {
    throw new Error('Invalid protein sequence');
  }

  // 아미노산 개수 세기
  const count: Record<string, number> = {};
  for (const aa of upper) {
    count[aa] = (count[aa] || 0) + 1;
  }

  function netCharge(ph: number): number {
    // 양전하: N-term, K, R, H
    let charge = 0;
    charge += 1 / (1 + Math.pow(10, ph - PK.nterm));  // N-terminus
    charge += (count['K'] || 0) / (1 + Math.pow(10, ph - PK.K));
    charge += (count['R'] || 0) / (1 + Math.pow(10, ph - PK.R));
    charge += (count['H'] || 0) / (1 + Math.pow(10, ph - PK.H));

    // 음전하: C-term, D, E, C, Y
    charge -= 1 / (1 + Math.pow(10, PK.cterm - ph));  // C-terminus
    charge -= (count['D'] || 0) / (1 + Math.pow(10, PK.D - ph));
    charge -= (count['E'] || 0) / (1 + Math.pow(10, PK.E - ph));
    charge -= (count['C'] || 0) / (1 + Math.pow(10, PK.C - ph));
    charge -= (count['Y'] || 0) / (1 + Math.pow(10, PK.Y - ph));

    return charge;
  }

  // 이진 탐색 (pH 0~14)
  let lo = 0;
  let hi = 14;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (netCharge(mid) > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return Math.round(((lo + hi) / 2) * 100) / 100;
}

/**
 * 서열 해시 (SHA-256) — 중복 검출용
 */
export function calculateSeqHash(sequence: string): string {
  const upper = sequence.toUpperCase().replace(/\s/g, '');
  return createHash('sha256').update(upper).digest('hex');
}
