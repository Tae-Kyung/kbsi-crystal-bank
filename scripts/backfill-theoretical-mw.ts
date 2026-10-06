/**
 * Theoretical MW & pI Backfill
 * seq_final로부터 theoretical_mw, theoretical_pi를 계산하여 kbsi_construct에 저장
 *
 * npx tsx scripts/backfill-theoretical-mw.ts [옵션]
 *   --limit 50000    처리 건수 (기본: 전체)
 *   --dry-run        미리보기
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Standard amino acid residue weights (monoisotopic-ish, daltons)
const AA_WEIGHTS: Record<string, number> = {
  A: 71.08, R: 156.19, N: 114.10, D: 115.09, C: 103.14,
  E: 129.12, Q: 128.13, G: 57.05, H: 137.14, I: 113.16,
  L: 113.16, K: 128.17, M: 131.20, F: 147.18, P: 97.12,
  S: 87.08, T: 101.10, W: 186.21, Y: 163.18, V: 99.13,
};

const WATER = 18.015;

// pKa values for pI calculation
const PK_NTERM = 9.69;
const PK_CTERM = 2.34;
const PK_SIDE: Record<string, number> = {
  D: 3.65, E: 4.25, C: 8.18, Y: 10.07,
  H: 6.00, K: 10.53, R: 12.48,
};

function calcMW(seq: string): number {
  let mw = WATER;
  for (const aa of seq.toUpperCase()) {
    const w = AA_WEIGHTS[aa];
    if (w) mw += w;
    // skip unknown residues (X, etc.)
  }
  return Math.round(mw * 100) / 100;
}

function calcPI(seq: string): number {
  const upper = seq.toUpperCase();
  // Count charged residues
  const counts: Record<string, number> = { D: 0, E: 0, C: 0, Y: 0, H: 0, K: 0, R: 0 };
  for (const aa of upper) {
    if (aa in counts) counts[aa]++;
  }

  // Bisection method to find pH where net charge = 0
  let lo = 0, hi = 14;
  for (let iter = 0; iter < 100; iter++) {
    const pH = (lo + hi) / 2;
    const charge = netCharge(pH, counts);
    if (charge > 0) lo = pH;
    else hi = pH;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

function netCharge(pH: number, counts: Record<string, number>): number {
  // Positive: N-term, K, R, H
  let charge = 0;
  charge += 1 / (1 + Math.pow(10, pH - PK_NTERM));          // N-terminus
  charge += counts.K / (1 + Math.pow(10, pH - PK_SIDE.K));
  charge += counts.R / (1 + Math.pow(10, pH - PK_SIDE.R));
  charge += counts.H / (1 + Math.pow(10, pH - PK_SIDE.H));

  // Negative: C-term, D, E, C, Y
  charge -= 1 / (1 + Math.pow(10, PK_CTERM - pH));          // C-terminus
  charge -= counts.D / (1 + Math.pow(10, PK_SIDE.D - pH));
  charge -= counts.E / (1 + Math.pow(10, PK_SIDE.E - pH));
  charge -= counts.C / (1 + Math.pow(10, PK_SIDE.C - pH));
  charge -= counts.Y / (1 + Math.pow(10, PK_SIDE.Y - pH));

  return charge;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const dryRun = args.includes('--dry-run');

  console.log('=== Theoretical MW & pI Backfill ===');
  console.log(`limit: ${limit === Infinity ? '전체' : limit}, dry-run: ${dryRun}\n`);

  // 1) theoretical_mw IS NULL AND seq_final IS NOT NULL인 construct 전부 조회
  let records: { id: number; seq_final: string }[] = [];
  let offset = 0;
  while (records.length < limit) {
    const { data, error } = await supabase
      .from('kbsi_construct')
      .select('id, seq_final')
      .is('theoretical_mw', null)
      .not('seq_final', 'is', null)
      .order('id')
      .range(offset, offset + 999);
    if (error) { console.error('조회 에러:', error.message); break; }
    if (!data || data.length === 0) break;
    records = records.concat(data as any[]);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (limit !== Infinity) records = records.slice(0, limit);
  console.log(`대상: ${records.length.toLocaleString()}건\n`);

  if (records.length === 0) {
    console.log('처리할 construct가 없습니다.');
    return;
  }

  let updated = 0, skipped = 0, failed = 0;
  const startTime = Date.now();
  const BATCH = 100;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const updates: { id: number; theoretical_mw: number; theoretical_pi: number }[] = [];

    for (const r of batch) {
      const seq = r.seq_final.replace(/\s/g, '').toUpperCase();
      // 유효한 아미노산 문자만 포함하는지 체크
      if (seq.length === 0 || !/^[ACDEFGHIKLMNPQRSTVWY]+$/i.test(seq.replace(/X/g, ''))) {
        skipped++;
        continue;
      }
      const mw = calcMW(seq);
      const pi = calcPI(seq);
      updates.push({ id: r.id, theoretical_mw: mw, theoretical_pi: pi });
    }

    if (!dryRun && updates.length > 0) {
      // Supabase doesn't support batch update, so we do individual updates
      // But we can parallelize within the batch
      const results = await Promise.all(
        updates.map(u =>
          supabase
            .from('kbsi_construct')
            .update({ theoretical_mw: u.theoretical_mw, theoretical_pi: u.theoretical_pi })
            .eq('id', u.id)
        )
      );
      for (const res of results) {
        if (res.error) failed++;
        else updated++;
      }
    } else {
      updated += updates.length;
    }

    const processed = Math.min(i + BATCH, records.length);
    if (processed % 1000 === 0 || processed === records.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = updated > 0 ? (updated / parseFloat(elapsed) * 60).toFixed(0) : '--';
      console.log(
        `[${processed.toLocaleString()}/${records.length.toLocaleString()}] ` +
        `updated: ${updated.toLocaleString()}, skipped: ${skipped}, failed: ${failed} | ` +
        `${elapsed}s (${rate}/min)`
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
  console.log(`updated: ${updated.toLocaleString()}건`);
  console.log(`skipped: ${skipped.toLocaleString()}건`);
  console.log(`failed: ${failed}건`);
  console.log(`소요: ${elapsed}s`);

  if (dryRun && records.length > 0) {
    console.log('\n--- 샘플 (처음 5건) ---');
    for (const r of records.slice(0, 5)) {
      const seq = r.seq_final.replace(/\s/g, '').toUpperCase();
      console.log(`  id=${r.id}: MW=${calcMW(seq)} Da, pI=${calcPI(seq)}, len=${seq.length}`);
    }
  }
  console.log('='.repeat(50));
}

main().catch(console.error);
