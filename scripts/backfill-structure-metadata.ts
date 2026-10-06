/**
 * kbsi_structure의 performed_on (deposit_date) 및 emdb_id를 PDB API에서 backfill
 *
 * npx tsx scripts/backfill-structure-metadata.ts [옵션]
 *   --limit 10000    처리 건수 (기본: 전체)
 *   --offset 0       시작 위치
 *   --dry-run        미리보기
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PDB_API = 'https://data.rcsb.org/rest/v1/core/entry';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface StructureRow {
  id: number;
  pdb_id: string;
  performed_on: string | null;
  emdb_id: string | null;
  method: string | null;
  notes: string | null;
}

interface PdbMetadata {
  depositDate: string | null;       // YYYY-MM-DD
  initialReleaseDate: string | null;
  emdbId: string | null;
}

async function fetchPdbMetadata(pdbId: string): Promise<PdbMetadata | null> {
  try {
    const res = await fetch(`${PDB_API}/${pdbId.toLowerCase()}`, {
      headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
    });
    if (!res.ok) return null;
    const entry = await res.json();

    // deposit_date & initial_release_date
    const accession = entry.rcsb_accession_info;
    const depositDate = accession?.deposit_date
      ? accession.deposit_date.substring(0, 10)   // "2023-01-15T00:00:00Z" → "2023-01-15"
      : null;
    const initialReleaseDate = accession?.initial_release_date
      ? accession.initial_release_date.substring(0, 10)
      : null;

    // EMDB ID from pdbx_database_related
    let emdbId: string | null = null;
    const related = entry.pdbx_database_related;
    if (Array.isArray(related)) {
      for (const rel of related) {
        if (rel.content_type === 'associated EM volume' || rel.db_name === 'EMDB') {
          emdbId = rel.db_id || null;
          break;
        }
      }
    }

    return { depositDate, initialReleaseDate, emdbId };
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const offsetIdx = args.indexOf('--offset');
  const startOffset = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) : 0;
  const dryRun = args.includes('--dry-run');

  console.log('=== Structure Metadata Backfill (deposit_date + emdb_id) ===');
  console.log(`limit: ${limit === Infinity ? '전체' : limit}, offset: ${startOffset}, dry-run: ${dryRun}\n`);

  // 1) kbsi_structure에서 performed_on IS NULL & pdb_id 있는 항목 조회 (페이지네이션)
  let structures: StructureRow[] = [];
  let off = startOffset;
  while (structures.length < limit) {
    const { data, error } = await supabase
      .from('kbsi_structure')
      .select('id, pdb_id, performed_on, emdb_id, method, notes')
      .not('pdb_id', 'is', null)
      .is('performed_on', null)
      .order('id')
      .range(off, off + 999);
    if (error) { console.error('조회 에러:', error.message); break; }
    if (!data || data.length === 0) break;
    structures = structures.concat(data as any[]);
    if (data.length < 1000) break;
    off += 1000;
  }
  if (limit !== Infinity) structures = structures.slice(0, limit);
  console.log(`대상: ${structures.length.toLocaleString()}건\n`);

  if (structures.length === 0) {
    console.log('처리할 구조가 없습니다.');
    return;
  }

  let updatedDate = 0, updatedEmdb = 0, skipped = 0, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    const meta = await fetchPdbMetadata(s.pdb_id);

    if (!meta) {
      skipped++;
      await sleep(200);
      continue;
    }

    // Build update payload — only update fields that are currently NULL
    const update: Record<string, any> = {};

    if (s.performed_on === null && meta.depositDate) {
      update.performed_on = meta.depositDate;
    }

    if (s.emdb_id === null && meta.emdbId) {
      update.emdb_id = meta.emdbId;
    }

    // Append initial_release_date to notes
    if (meta.initialReleaseDate) {
      const releaseNote = `release_date: ${meta.initialReleaseDate}`;
      if (s.notes) {
        if (!s.notes.includes('release_date:')) {
          update.notes = `${s.notes}; ${releaseNote}`;
        }
      } else {
        update.notes = releaseNote;
      }
    }

    if (Object.keys(update).length === 0) {
      skipped++;
      await sleep(200);
      continue;
    }

    if (!dryRun) {
      const { error } = await supabase
        .from('kbsi_structure')
        .update(update)
        .eq('id', s.id);
      if (error) {
        failed++;
      } else {
        if (update.performed_on) updatedDate++;
        if (update.emdb_id) updatedEmdb++;
      }
    } else {
      if (update.performed_on) updatedDate++;
      if (update.emdb_id) updatedEmdb++;
      if (i < 5) {
        console.log(`  [dry-run] id=${s.id} pdb=${s.pdb_id} → ${JSON.stringify(update)}`);
      }
    }

    await sleep(200);

    if ((i + 1) % 100 === 0 || i + 1 === structures.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = parseFloat(elapsed) > 0 ? ((i + 1) / parseFloat(elapsed) * 60).toFixed(0) : '--';
      console.log(
        `[${(i + 1).toLocaleString()}/${structures.length.toLocaleString()}] ` +
        `date: +${updatedDate} | emdb: +${updatedEmdb} | ` +
        `skip: ${skipped} | fail: ${failed} | ${elapsed}s (${rate}/min)`
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(55)}`);
  console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
  console.log(`performed_on 업데이트: ${updatedDate.toLocaleString()}건`);
  console.log(`emdb_id 업데이트: ${updatedEmdb.toLocaleString()}건`);
  console.log(`스킵: ${skipped.toLocaleString()}건, 실패: ${failed}건`);
  console.log(`소요: ${elapsed}s`);
  console.log('='.repeat(55));
}

main().catch(console.error);
