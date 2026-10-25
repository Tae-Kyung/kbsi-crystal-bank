/**
 * UniProt ID Backfill
 * PDB 구조의 polymer entity에서 UniProt accession을 가져와 kbsi_database_id에 저장
 *
 * npx tsx scripts/backfill-uniprot-ids.ts [옵션]
 *   --limit 10000     처리 건수 (기본: 10000)
 *   --dry-run          미리보기
 *   --concurrency 10   동시 PDB fetch 수
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

async function getUniProtFromPDB(pdbId: string): Promise<string | null> {
  try {
    const res = await fetch(`${PDB_API}/polymer_entity/${pdbId.toLowerCase()}/1`);
    if (!res.ok) return null;
    const entity = await res.json();
    return entity?.rcsb_polymer_entity_container_identifiers?.uniprot_ids?.[0] || null;
  } catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '10000');
  const concIdx = args.indexOf('--concurrency');
  const concurrency = concIdx >= 0 && args[concIdx + 1] ? parseInt(args[concIdx + 1]) : 10;
  const dryRun = args.includes('--dry-run');

  await client.connect();
  try {
    console.log('UniProt ID Backfill');
    console.log(`limit: ${limit}, concurrency: ${concurrency}, dry-run: ${dryRun}\n`);

    // 이미 UniProt ID가 있는 protein_id 조회
    const { rows: existingData } = await client.query(
      `SELECT protein_id FROM kbsi_database_id WHERE db_name = $1`,
      ['UniProt']
    );
    const existingIds = new Set<number>(existingData.map((r: any) => r.protein_id));
    console.log(`기존 UniProt 연결: ${existingIds.size}건`);

    // PDB ID가 있는 structure → construct → protein_id 조회
    const { rows: structRows } = await client.query(
      `SELECT s.pdb_id, c.protein_id
       FROM kbsi_structure s
       JOIN kbsi_construct c ON c.id = s.construct_id
       WHERE s.pdb_id IS NOT NULL
       LIMIT $1`,
      [limit * 2] // fetch more to account for filtering
    );

    const seenProteins = new Set<number>(existingIds);
    const structures: { pdb_id: string; protein_id: number }[] = [];
    for (const s of structRows) {
      if (!seenProteins.has(s.protein_id)) {
        structures.push({ pdb_id: s.pdb_id, protein_id: s.protein_id });
        seenProteins.add(s.protein_id);
      }
      if (structures.length >= limit) break;
    }
    console.log(`UniProt 미보유 구조: ${structures.length}건\n`);

    let success = 0, notFound = 0, failed = 0;
    const startTime = Date.now();

    // 배치 처리
    for (let i = 0; i < structures.length; i += concurrency) {
      const batch = structures.slice(i, i + concurrency);

      const results = await Promise.all(
        batch.map(async (s) => {
          const uniprotId = await getUniProtFromPDB(s.pdb_id);
          return { ...s, uniprotId };
        })
      );

      for (const r of results) {
        if (!r.uniprotId) { notFound++; continue; }

        if (dryRun) {
          if (success < 10) console.log(`  ${r.pdb_id} → ${r.uniprotId} (protein ${r.protein_id})`);
          success++;
          continue;
        }

        try {
          await client.query(
            `INSERT INTO kbsi_database_id (protein_id, db_name, db_value)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [r.protein_id, 'UniProt', r.uniprotId]
          );
          success++;
        } catch (err: any) {
          if (err.code === '23505') { success++; } // duplicate OK
          else { failed++; }
        }
      }

      if ((i + concurrency) % 500 === 0 || i + concurrency >= structures.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = success > 0 ? (success / parseFloat(elapsed) * 60).toFixed(0) : '—';
        console.log(`  ${Math.min(i + concurrency, structures.length).toLocaleString()}/${structures.length.toLocaleString()} | UniProt: ${success.toLocaleString()} | not found: ${notFound} | ${elapsed}s (${rate}/min)`);
      }

      await sleep(50);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
    console.log(`UniProt 연결: ${success.toLocaleString()}건`);
    console.log(`미발견: ${notFound.toLocaleString()}건`);
    console.log(`실패: ${failed}건`);
    console.log(`소요: ${elapsed}s`);
    console.log('═'.repeat(50));
  } finally {
    await client.end();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
main().catch(console.error);
