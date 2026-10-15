/**
 * BMRB 공식 PDB↔BMRB 매핑 파일로 kbsi_nmr_experiment.bmrb_id 채우기
 *
 * 소스: https://bmrb.io/ftp/pub/bmrb/nmr_pdb_integrated_data/adit_nmr_matched_pdb_bmrb_entry_ids.csv
 * 형식: bmrb_id,pdb_id (한 줄에 하나, 헤더 없음)
 *
 * npx tsx scripts/backfill-bmrb-mapping.ts [옵션]
 *   --dry-run    미리보기 (DB 업데이트 안 함)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BMRB_MAPPING_URL = 'https://bmrb.io/ftp/pub/bmrb/nmr_pdb_integrated_data/adit_nmr_matched_pdb_bmrb_entry_ids.csv';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`=== BMRB Mapping Backfill ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}\n`);

  // 1. BMRB 매핑 파일 다운로드
  console.log('Downloading BMRB↔PDB mapping file...');
  const res = await fetch(BMRB_MAPPING_URL);
  if (!res.ok) {
    console.error('Failed to download mapping file:', res.status);
    process.exit(1);
  }
  const csvText = await res.text();
  const lines = csvText.trim().split('\n').filter(l => l.trim());

  // PDB → BMRB 맵 (1 PDB : 1 BMRB, 중복 시 첫 번째 사용)
  const pdbToBmrb = new Map<string, string>();
  for (const line of lines) {
    const [bmrbId, pdbId] = line.split(',').map(s => s.trim());
    if (!bmrbId || !pdbId) continue;
    const pdbUpper = pdbId.toUpperCase();
    if (!pdbToBmrb.has(pdbUpper)) {
      pdbToBmrb.set(pdbUpper, bmrbId);
    }
  }
  console.log(`  Mapping entries: ${lines.length}`);
  console.log(`  Unique PDB IDs: ${pdbToBmrb.size}\n`);

  // 2. bmrb_id가 NULL인 NMR experiment 조회
  console.log('Loading NMR experiments with NULL bmrb_id...');
  const PAGE_SIZE = 1000;
  const records: { id: number; source_id: string }[] = [];
  for (let off = 0; ; off += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('kbsi_nmr_experiment')
      .select('id, source_id')
      .is('bmrb_id', null)
      .not('source_id', 'is', null)
      .order('id', { ascending: true })
      .range(off, off + PAGE_SIZE - 1);

    if (error) { console.error('Query error:', error.message); return; }
    if (!data || data.length === 0) break;
    records.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`  Records with NULL bmrb_id: ${records.length}\n`);

  // 3. 매핑 매칭
  const matched: { id: number; source_id: string; bmrb_id: string }[] = [];
  const unmatched: string[] = [];

  for (const rec of records) {
    const pdbUpper = rec.source_id.toUpperCase();
    const bmrbId = pdbToBmrb.get(pdbUpper);
    if (bmrbId) {
      matched.push({ id: rec.id, source_id: rec.source_id, bmrb_id: bmrbId });
    } else {
      unmatched.push(rec.source_id);
    }
  }

  console.log(`=== MATCHING RESULTS ===`);
  console.log(`  Total NULL bmrb_id:  ${records.length}`);
  console.log(`  Matched in BMRB:     ${matched.length} (${Math.round(matched.length / records.length * 100)}%)`);
  console.log(`  No BMRB entry:       ${unmatched.length}`);
  console.log();

  // 4. 검증: 샘플 확인
  console.log('=== SAMPLE MATCHES (first 10) ===');
  for (const m of matched.slice(0, 10)) {
    console.log(`  PDB ${m.source_id} → BMRB ${m.bmrb_id}`);
  }
  console.log();

  // 5. 교차 검증: 이미 bmrb_id가 있는 레코드와 BMRB 매핑 비교
  console.log('=== CROSS-VALIDATION ===');
  const { data: existingBmrb } = await supabase
    .from('kbsi_nmr_experiment')
    .select('source_id, bmrb_id')
    .not('bmrb_id', 'is', null)
    .not('source_id', 'is', null)
    .limit(500);

  let crossMatch = 0, crossMismatch = 0, crossNotInFile = 0;
  const mismatches: string[] = [];
  for (const rec of existingBmrb || []) {
    const pdbUpper = rec.source_id.toUpperCase();
    const fileBmrb = pdbToBmrb.get(pdbUpper);
    if (!fileBmrb) {
      crossNotInFile++;
    } else if (fileBmrb === rec.bmrb_id) {
      crossMatch++;
    } else {
      crossMismatch++;
      if (mismatches.length < 5) {
        mismatches.push(`PDB ${rec.source_id}: DB=${rec.bmrb_id} vs File=${fileBmrb}`);
      }
    }
  }
  console.log(`  Checked: ${(existingBmrb || []).length} existing records`);
  console.log(`  Match:       ${crossMatch}`);
  console.log(`  Mismatch:    ${crossMismatch}`);
  console.log(`  Not in file: ${crossNotInFile} (PDB에서 직접 가져온 것)`);
  if (mismatches.length > 0) {
    console.log(`  Mismatch samples:`);
    mismatches.forEach(m => console.log(`    ${m}`));
  }
  console.log();

  if (crossMismatch > (existingBmrb || []).length * 0.1) {
    console.error('WARNING: >10% mismatch with existing data. Aborting.');
    return;
  }

  if (dryRun) {
    console.log('DRY RUN complete. Use without --dry-run to apply updates.');
    return;
  }

  // 6. DB 업데이트
  console.log(`Updating ${matched.length} records...`);
  let updated = 0, errors = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < matched.length; i += BATCH_SIZE) {
    const batch = matched.slice(i, i + BATCH_SIZE);

    for (const m of batch) {
      const { error } = await supabase
        .from('kbsi_nmr_experiment')
        .update({ bmrb_id: m.bmrb_id })
        .eq('id', m.id);

      if (error) {
        errors++;
        if (errors <= 3) console.error(`  [ERR] ${m.source_id}: ${error.message}`);
      } else {
        updated++;
      }
    }

    const pct = Math.round(Math.min(i + batch.length, matched.length) / matched.length * 100);
    process.stdout.write(`\r  Progress: ${Math.min(i + batch.length, matched.length)}/${matched.length} (${pct}%) | updated=${updated} errors=${errors}`);
  }

  console.log('\n');
  console.log('=== FINAL RESULTS ===');
  console.log(`  Updated:  ${updated}`);
  console.log(`  Errors:   ${errors}`);

  // 최종 커버리지 확인
  const { count: finalHas } = await supabase.from('kbsi_nmr_experiment').select('id', { count: 'exact', head: true }).not('bmrb_id', 'is', null);
  const { count: finalTotal } = await supabase.from('kbsi_nmr_experiment').select('id', { count: 'exact', head: true });
  console.log(`  BMRB coverage: ${finalHas}/${finalTotal} (${Math.round((finalHas ?? 0) / (finalTotal ?? 1) * 100)}%)`);
}

main().catch(console.error);
