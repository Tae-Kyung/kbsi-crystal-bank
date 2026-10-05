/**
 * kbsi_diffraction의 space_group NULL을 PDB API에서 backfill
 * 버그: cell.space_group_name_H_M → symmetry.space_group_name_H_M
 *
 * npx tsx scripts/backfill-space-group.ts [--limit N] [--dry-run]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const dryRun = args.includes('--dry-run');

  console.log(`=== space_group backfill ===`);
  console.log(`limit: ${limit === Infinity ? '전체' : limit}, dry-run: ${dryRun}\n`);

  // space_group이 NULL인 PDB 소스 diffraction 레코드 조회
  let records: any[] = [];
  let offset = 0;
  while (records.length < limit) {
    const { data, error } = await supabase
      .from('kbsi_diffraction')
      .select('id, source_id')
      .eq('source_db', 'PDB')
      .is('space_group', null)
      .order('id')
      .range(offset, offset + 999);
    if (error) { console.error('조회 에러:', error.message); break; }
    if (!data || data.length === 0) break;
    records = records.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (limit !== Infinity) records = records.slice(0, limit);
  console.log(`대상: ${records.length}건\n`);

  let updated = 0, skipped = 0, failed = 0;
  const BATCH = 50;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${r.source_id}`, {
        headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
      });
      if (!res.ok) { skipped++; await sleep(200); continue; }
      const entry = await res.json();
      const sg = entry.symmetry?.space_group_name_H_M;
      if (!sg) { skipped++; await sleep(200); continue; }

      if (!dryRun) {
        const { error } = await supabase
          .from('kbsi_diffraction')
          .update({ space_group: sg })
          .eq('id', r.id);
        if (error) { failed++; } else { updated++; }
      } else {
        updated++;
      }
    } catch { failed++; }

    await sleep(200);

    if ((i + 1) % 100 === 0) {
      console.log(`[${i + 1}/${records.length}] updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
    }
  }

  console.log(`\n=== 완료 ${dryRun ? '(dry-run)' : ''} ===`);
  console.log(`updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
}

main().catch(console.error);
