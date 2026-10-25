/**
 * PDB Database ID Backfill
 * kbsi_structure의 pdb_id를 kbsi_database_id에 등록 (PDB + NCBI Gene)
 *
 * npx tsx scripts/backfill-pdb-database-ids.ts [옵션]
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

const PDB_API = 'https://data.rcsb.org/rest/v1/core';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface StructureRow {
  pdb_id: string;
  construct_id: number;
}

interface ExternalIds {
  pdbId: string;
  ncbiGeneId: string | null;
}

async function fetchExternalIds(pdbId: string): Promise<ExternalIds> {
  const result: ExternalIds = { pdbId, ncbiGeneId: null };
  try {
    const res = await fetch(`${PDB_API}/polymer_entity/${pdbId.toLowerCase()}/1`, {
      headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
    });
    if (!res.ok) return result;
    const entity = await res.json();

    const refs = entity?.rcsb_polymer_entity_container_identifiers?.reference_sequence_identifiers;
    if (Array.isArray(refs)) {
      for (const ref of refs) {
        if (ref.database_name === 'NCBI Gene') {
          result.ncbiGeneId = ref.database_accession;
          break;
        }
      }
    }
  } catch { /* skip */ }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const offsetIdx = args.indexOf('--offset');
  const startOffset = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) : 0;
  const dryRun = args.includes('--dry-run');

  console.log('=== PDB Database ID Backfill ===');
  console.log(`limit: ${limit === Infinity ? '전체' : limit}, offset: ${startOffset}, dry-run: ${dryRun}\n`);

  await client.connect();
  try {
    // 1) 기존 PDB 등록 조회 (중복 방지용)
    const existingPdb = new Set<string>(); // key = `${protein_id}::${pdb_id}`
    const existingNcbi = new Set<string>();
    let off = 0;
    while (true) {
      const { rows: data } = await client.query(
        "SELECT protein_id, db_name, db_value FROM kbsi_database_id WHERE db_name = ANY($1) OFFSET $2 LIMIT 1000",
        [['PDB', 'NCBI Gene'], off]
      );
      if (!data || data.length === 0) break;
      for (const r of data as any[]) {
        const key = `${r.protein_id}::${r.db_value}`;
        if (r.db_name === 'PDB') existingPdb.add(key);
        else existingNcbi.add(key);
      }
      if (data.length < 1000) break;
      off += 1000;
    }
    console.log(`기존 PDB 등록: ${existingPdb.size}건, NCBI Gene: ${existingNcbi.size}건\n`);

    // 2) kbsi_structure에서 pdb_id 있는 항목 조회
    let structures: StructureRow[] = [];
    off = startOffset;
    while (structures.length < limit) {
      const { rows: data } = await client.query(
        'SELECT pdb_id, construct_id FROM kbsi_structure WHERE pdb_id IS NOT NULL ORDER BY id OFFSET $1 LIMIT 1000',
        [off]
      );
      if (!data || data.length === 0) break;
      structures = structures.concat(data as any[]);
      if (data.length < 1000) break;
      off += 1000;
    }
    if (limit !== Infinity) structures = structures.slice(0, limit);
    console.log(`PDB 구조: ${structures.length.toLocaleString()}건\n`);

    if (structures.length === 0) {
      console.log('처리할 구조가 없습니다.');
      return;
    }

    // 3) construct_id → protein_id 매핑 구축
    const allConstructIds = [...new Set(structures.map(s => s.construct_id))];
    const constructToProtein = new Map<number, number>();
    for (let i = 0; i < allConstructIds.length; i += 100) {
      const chunk = allConstructIds.slice(i, i + 100);
      const { rows: data } = await client.query(
        'SELECT id, protein_id FROM kbsi_construct WHERE id = ANY($1)',
        [chunk]
      );
      if (data) {
        for (const c of data as any[]) {
          constructToProtein.set(c.id, c.protein_id);
        }
      }
    }
    console.log(`construct → protein 매핑: ${constructToProtein.size}건\n`);

    let pdbInserted = 0, ncbiInserted = 0, skippedPdb = 0, skippedNcbi = 0, failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < structures.length; i++) {
      const s = structures[i];
      const proteinId = constructToProtein.get(s.construct_id);
      if (!proteinId) { failed++; continue; }

      const pdbKey = `${proteinId}::${s.pdb_id}`;

      // PDB ID 등록
      if (!existingPdb.has(pdbKey)) {
        if (!dryRun) {
          try {
            await client.query(
              'INSERT INTO kbsi_database_id (protein_id, db_name, db_value) VALUES ($1, $2, $3)',
              [proteinId, 'PDB', s.pdb_id]
            );
            pdbInserted++;
            existingPdb.add(pdbKey);
          } catch (e: any) {
            if (e.code !== '23505') failed++;
            else { pdbInserted++; existingPdb.add(pdbKey); }
          }
        } else {
          pdbInserted++;
          existingPdb.add(pdbKey);
        }
      } else {
        skippedPdb++;
      }

      // NCBI Gene ID fetch (API 호출)
      const ext = await fetchExternalIds(s.pdb_id);

      if (ext.ncbiGeneId) {
        const ncbiKey = `${proteinId}::${ext.ncbiGeneId}`;
        if (!existingNcbi.has(ncbiKey)) {
          if (!dryRun) {
            try {
              await client.query(
                'INSERT INTO kbsi_database_id (protein_id, db_name, db_value) VALUES ($1, $2, $3)',
                [proteinId, 'NCBI Gene', ext.ncbiGeneId]
              );
              ncbiInserted++;
              existingNcbi.add(ncbiKey);
            } catch (e: any) {
              if (e.code !== '23505') failed++;
              else { ncbiInserted++; existingNcbi.add(ncbiKey); }
            }
          } else {
            ncbiInserted++;
            existingNcbi.add(ncbiKey);
          }
        } else {
          skippedNcbi++;
        }
      }

      await sleep(200);

      if ((i + 1) % 1000 === 0 || i + 1 === structures.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (i + 1) > 0 ? ((i + 1) / parseFloat(elapsed) * 60).toFixed(0) : '--';
        console.log(
          `[${(i + 1).toLocaleString()}/${structures.length.toLocaleString()}] ` +
          `PDB: +${pdbInserted} (skip ${skippedPdb}) | ` +
          `NCBI Gene: +${ncbiInserted} (skip ${skippedNcbi}) | ` +
          `failed: ${failed} | ${elapsed}s (${rate}/min)`
        );
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
    console.log(`PDB 등록: ${pdbInserted.toLocaleString()}건 (중복 skip: ${skippedPdb.toLocaleString()})`);
    console.log(`NCBI Gene 등록: ${ncbiInserted.toLocaleString()}건 (중복 skip: ${skippedNcbi.toLocaleString()})`);
    console.log(`실패: ${failed}건`);
    console.log(`소요: ${elapsed}s`);
    console.log('='.repeat(50));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
