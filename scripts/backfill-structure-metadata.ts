/**
 * kbsi_structure의 performed_on (deposit_date) 및 emdb_id를 PDB API에서 backfill
 *
 * npx tsx scripts/backfill-structure-metadata.ts [옵션]
 *   --limit 10000    처리 건수 (기본: 전체)
 *   --offset 0       시작 위치
 *   --dry-run        미리보기
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

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
      ? accession.deposit_date.substring(0, 10)
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

  await client.connect();
  try {
    // 1) kbsi_structure에서 performed_on IS NULL & pdb_id 있는 항목 조회 (페이지네이션)
    let structures: StructureRow[] = [];
    let off = startOffset;
    while (structures.length < limit) {
      const { rows: data } = await client.query(
        'SELECT id, pdb_id, performed_on, emdb_id, method, notes FROM kbsi_structure WHERE pdb_id IS NOT NULL AND performed_on IS NULL ORDER BY id OFFSET $1 LIMIT 1000',
        [off]
      );
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
      const updates: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (s.performed_on === null && meta.depositDate) {
        updates.push(`performed_on = $${paramIdx++}`);
        values.push(meta.depositDate);
      }

      if (s.emdb_id === null && meta.emdbId) {
        updates.push(`emdb_id = $${paramIdx++}`);
        values.push(meta.emdbId);
      }

      // Append initial_release_date to notes
      if (meta.initialReleaseDate) {
        const releaseNote = `release_date: ${meta.initialReleaseDate}`;
        if (s.notes) {
          if (!s.notes.includes('release_date:')) {
            updates.push(`notes = $${paramIdx++}`);
            values.push(`${s.notes}; ${releaseNote}`);
          }
        } else {
          updates.push(`notes = $${paramIdx++}`);
          values.push(releaseNote);
        }
      }

      if (updates.length === 0) {
        skipped++;
        await sleep(200);
        continue;
      }

      if (!dryRun) {
        values.push(s.id);
        try {
          await client.query(
            `UPDATE kbsi_structure SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
            values
          );
          if (values.some((v, idx) => updates[idx]?.startsWith('performed_on'))) updatedDate++;
          if (values.some((v, idx) => updates[idx]?.startsWith('emdb_id'))) updatedEmdb++;
        } catch {
          failed++;
        }
      } else {
        if (updates.some(u => u.startsWith('performed_on'))) updatedDate++;
        if (updates.some(u => u.startsWith('emdb_id'))) updatedEmdb++;
        if (i < 5) {
          const updateObj: any = {};
          updates.forEach((u, idx) => { const col = u.split(' = ')[0]; updateObj[col] = values[idx]; });
          console.log(`  [dry-run] id=${s.id} pdb=${s.pdb_id} → ${JSON.stringify(updateObj)}`);
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
  } finally {
    await client.end();
  }
}

main().catch(console.error);
