/**
 * NCBI Gene ID + gene_name Backfill from UniProt API
 *
 * kbsi_database_id의 UniProt accession을 사용하여:
 * 1. kbsi_protein.gene_name 채우기
 * 2. kbsi_protein.abbreviation 채우기 (NULL인 경우 gene_name 사용)
 * 3. NCBI Gene ID를 kbsi_database_id에 추가
 *
 * npx tsx scripts/backfill-ncbi-gene.ts [옵션]
 *   --limit 10000    처리 건수 (기본: 전체)
 *   --offset 0       시작 오프셋 (기본: 0)
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

const UNIPROT_API = 'https://rest.uniprot.org/uniprotkb';
const USER_AGENT = 'KBSI-CrystalBank/1.0 (https://kbsi-crystal-bank.vercel.app)';
const DELAY_MS = 300;

interface UniProtEntry {
  accession: string;
  proteinId: number;
}

interface UniProtResult {
  geneName: string | null;
  ncbiGeneIds: string[];
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchUniProt(accession: string): Promise<UniProtResult | null> {
  try {
    const res = await fetch(`${UNIPROT_API}/${accession}.json`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      console.warn(`  UniProt ${accession}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();

    // gene name
    const geneName: string | null =
      data?.genes?.[0]?.geneName?.value || null;

    // NCBI Gene IDs from cross-references
    const ncbiGeneIds: string[] = [];
    if (Array.isArray(data?.uniProtKBCrossReferences)) {
      for (const xref of data.uniProtKBCrossReferences) {
        if (xref.database === 'GeneID' && xref.id) {
          ncbiGeneIds.push(xref.id);
        }
      }
    }

    return { geneName, ncbiGeneIds };
  } catch (err: any) {
    console.warn(`  UniProt ${accession}: ${err.message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1]) : Infinity;
  const offsetIdx = args.indexOf('--offset');
  const startOffset = offsetIdx >= 0 && args[offsetIdx + 1] ? parseInt(args[offsetIdx + 1]) : 0;
  const dryRun = args.includes('--dry-run');

  console.log('NCBI Gene + gene_name Backfill from UniProt');
  console.log(`limit: ${limit === Infinity ? 'all' : limit}, offset: ${startOffset}, dry-run: ${dryRun}\n`);

  await client.connect();
  try {
    // Step 1: protein_ids that already have NCBI Gene in kbsi_database_id
    const existingNcbi = new Set<number>();
    let off = 0;
    while (true) {
      const { rows: data } = await client.query(
        "SELECT protein_id FROM kbsi_database_id WHERE db_name = 'NCBI Gene' OFFSET $1 LIMIT 1000",
        [off]
      );
      if (!data || data.length === 0) break;
      for (const r of data as any[]) existingNcbi.add(r.protein_id);
      if (data.length < 1000) break;
      off += 1000;
    }
    console.log(`기존 NCBI Gene 연결: ${existingNcbi.size}건`);

    // Step 2: protein_ids that already have gene_name
    const existingGeneName = new Set<number>();
    off = 0;
    while (true) {
      const { rows: data } = await client.query(
        'SELECT id FROM kbsi_protein WHERE gene_name IS NOT NULL OFFSET $1 LIMIT 1000',
        [off]
      );
      if (!data || data.length === 0) break;
      for (const r of data as any[]) existingGeneName.add(r.id);
      if (data.length < 1000) break;
      off += 1000;
    }
    console.log(`기존 gene_name 보유: ${existingGeneName.size}건`);

    // Step 3: Load all UniProt entries from kbsi_database_id
    const entries: UniProtEntry[] = [];
    off = startOffset;
    while (entries.length < limit) {
      const { rows: data } = await client.query(
        "SELECT protein_id, db_value FROM kbsi_database_id WHERE db_name = 'UniProt' ORDER BY protein_id ASC OFFSET $1 LIMIT 1000",
        [off]
      );
      if (!data || data.length === 0) break;
      for (const r of data as any[]) {
        // Skip if protein already has gene_name AND NCBI Gene
        if (existingGeneName.has(r.protein_id) && existingNcbi.has(r.protein_id)) {
          continue;
        }
        entries.push({ accession: r.db_value, proteinId: r.protein_id });
        if (entries.length >= limit) break;
      }
      if (data.length < 1000) break;
      off += 1000;
    }
    console.log(`처리 대상: ${entries.length}건 (스킵: gene_name+NCBI Gene 모두 있는 건)\n`);

    if (entries.length === 0) {
      console.log('처리할 항목이 없습니다.');
      return;
    }

    let stats = {
      geneNameUpdated: 0,
      abbreviationUpdated: 0,
      ncbiGeneInserted: 0,
      skipped: 0,
      errors: 0,
      apiCalls: 0,
    };

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Progress every 100
      if (i > 0 && i % 100 === 0) {
        console.log(`[${i}/${entries.length}] gene_name=${stats.geneNameUpdated}, abbr=${stats.abbreviationUpdated}, ncbi=${stats.ncbiGeneInserted}, skip=${stats.skipped}, err=${stats.errors}`);
      }

      // Fetch from UniProt API
      const result = await fetchUniProt(entry.accession);
      stats.apiCalls++;

      if (!result) {
        stats.errors++;
        await sleep(DELAY_MS);
        continue;
      }

      const { geneName, ncbiGeneIds } = result;

      // Update gene_name if protein doesn't have one
      if (geneName && !existingGeneName.has(entry.proteinId)) {
        if (dryRun) {
          console.log(`  [DRY] protein ${entry.proteinId}: gene_name = "${geneName}"`);
        } else {
          const { rowCount } = await client.query(
            'UPDATE kbsi_protein SET gene_name = $1 WHERE id = $2 AND gene_name IS NULL',
            [geneName, entry.proteinId]
          );
          if (rowCount && rowCount > 0) {
            stats.geneNameUpdated++;
            existingGeneName.add(entry.proteinId);
          }
        }
      }

      // Update abbreviation if NULL (use gene_name)
      if (geneName) {
        if (dryRun) {
          console.log(`  [DRY] protein ${entry.proteinId}: abbreviation = "${geneName}" (if null)`);
        } else {
          await client.query(
            'UPDATE kbsi_protein SET abbreviation = $1 WHERE id = $2 AND abbreviation IS NULL',
            [geneName, entry.proteinId]
          );
          stats.abbreviationUpdated++;
        }
      }

      // Insert NCBI Gene IDs if not existing
      if (ncbiGeneIds.length > 0 && !existingNcbi.has(entry.proteinId)) {
        for (const geneId of ncbiGeneIds) {
          if (dryRun) {
            console.log(`  [DRY] protein ${entry.proteinId}: NCBI Gene = ${geneId}`);
          } else {
            try {
              await client.query(
                `INSERT INTO kbsi_database_id (protein_id, db_name, db_value)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (protein_id, db_name, db_value) DO NOTHING`,
                [entry.proteinId, 'NCBI Gene', geneId]
              );
              stats.ncbiGeneInserted++;
            } catch (e: any) {
              console.warn(`  NCBI Gene insert error (protein ${entry.proteinId}): ${e.message}`);
            }
          }
        }
        existingNcbi.add(entry.proteinId);
      } else if (ncbiGeneIds.length === 0) {
        stats.skipped++;
      }

      // Rate limit delay
      await sleep(DELAY_MS);
    }

    console.log('\n=== 완료 ===');
    console.log(`API 호출: ${stats.apiCalls}`);
    console.log(`gene_name 업데이트: ${stats.geneNameUpdated}`);
    console.log(`abbreviation 업데이트: ${stats.abbreviationUpdated}`);
    console.log(`NCBI Gene 삽입: ${stats.ncbiGeneInserted}`);
    console.log(`NCBI Gene 없음 (스킵): ${stats.skipped}`);
    console.log(`에러: ${stats.errors}`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
