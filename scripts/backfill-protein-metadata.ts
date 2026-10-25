/**
 * Protein Metadata Backfill from PDB API
 * gene_name, abbreviation (kbsi_protein) + expression_system (kbsi_construct) 소급
 *
 * npx tsx scripts/backfill-protein-metadata.ts [옵션]
 *   --limit 10000     처리할 고유 protein_id 수 (기본: 999999)
 *   --offset 0        시작 offset (기본: 0)
 *   --dry-run          미리보기
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

interface PdbMetadata {
  geneName: string | null;
  description: string | null;   // pdbx_description → abbreviation candidate
  organism: string | null;
  expressionSystem: string | null;
}

async function fetchPdbMetadata(pdbId: string): Promise<PdbMetadata> {
  const result: PdbMetadata = {
    geneName: null,
    description: null,
    organism: null,
    expressionSystem: null,
  };

  try {
    // Fetch polymer_entity/1 (primary entity)
    const res = await fetch(`${PDB_API}/polymer_entity/${pdbId.toLowerCase()}/1`);
    if (!res.ok) return result;
    const entity = await res.json();

    // gene_name
    result.geneName =
      entity?.rcsb_gene_name?.[0]?.value || null;

    // pdbx_description → abbreviation / full_name
    result.description =
      entity?.rcsb_polymer_entity?.pdbx_description || null;

    // organism
    result.organism =
      entity?.rcsb_entity_source_organism?.[0]?.ncbi_scientific_name || null;

    // expression_system (host organism for recombinant expression)
    result.expressionSystem =
      entity?.entity_src_gen?.[0]?.pdbx_host_org_scientific_name || null;
  } catch {
    // network error → return nulls
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1]) : 999999;
  const offsetIdx = args.indexOf('--offset');
  const offsetArg = offsetIdx >= 0 && args[offsetIdx + 1] ? parseInt(args[offsetIdx + 1]) : 0;
  const dryRun = args.includes('--dry-run');

  console.log('Protein Metadata Backfill from PDB API');
  console.log(`limit: ${limit}, offset: ${offsetArg}, dry-run: ${dryRun}\n`);

  await client.connect();
  try {
    // ── Step 1: structure → construct → protein 매핑 조회 (paginate) ──
    console.log('Loading structure → construct → protein mappings...');

    // 1a. Load all structures with pdb_id (paginated)
    interface StructRow { pdb_id: string; construct_id: number }
    let allStructures: StructRow[] = [];
    let off = 0;
    const PAGE = 1000;
    while (true) {
      const { rows: data } = await client.query(
        'SELECT pdb_id, construct_id FROM kbsi_structure WHERE pdb_id IS NOT NULL OFFSET $1 LIMIT $2',
        [off, PAGE]
      );
      if (!data || data.length === 0) break;
      allStructures = allStructures.concat(data as StructRow[]);
      if (data.length < PAGE) break;
      off += PAGE;
    }
    console.log(`  Structures with pdb_id: ${allStructures.length.toLocaleString()}`);

    // 1b. Collect unique construct_ids and load protein_id mapping (paginated)
    const uniqueConstructIds = [...new Set(allStructures.map(s => s.construct_id))];
    console.log(`  Unique construct_ids: ${uniqueConstructIds.length.toLocaleString()}`);

    const constructToProtein = new Map<number, number>();
    for (let i = 0; i < uniqueConstructIds.length; i += PAGE) {
      const batch = uniqueConstructIds.slice(i, i + PAGE);
      const { rows: data } = await client.query(
        'SELECT id, protein_id FROM kbsi_construct WHERE id = ANY($1)',
        [batch]
      );
      if (data) {
        for (const c of data as any[]) {
          constructToProtein.set(c.id, c.protein_id);
        }
      }
    }
    console.log(`  Construct→Protein mappings: ${constructToProtein.size.toLocaleString()}`);

    // ── Step 2: Build unique protein_id → { pdbId, constructIds } ──
    interface ProteinEntry {
      proteinId: number;
      pdbId: string;
      constructIds: Set<number>;
    }

    const proteinMap = new Map<number, ProteinEntry>();
    for (const s of allStructures) {
      const proteinId = constructToProtein.get(s.construct_id);
      if (!proteinId) continue;
      if (!proteinMap.has(proteinId)) {
        proteinMap.set(proteinId, {
          proteinId,
          pdbId: s.pdb_id,
          constructIds: new Set([s.construct_id]),
        });
      } else {
        proteinMap.get(proteinId)!.constructIds.add(s.construct_id);
      }
    }

    // Apply offset and limit over unique protein entries
    const allEntries = [...proteinMap.values()];
    const entries = allEntries.slice(offsetArg, offsetArg + limit);
    console.log(`  Unique proteins total: ${allEntries.length.toLocaleString()}`);
    console.log(`  Processing (offset=${offsetArg}, limit=${limit}): ${entries.length.toLocaleString()}\n`);

    if (entries.length === 0) {
      console.log('Nothing to process.');
      return;
    }

    // ── Step 3: Fetch PDB metadata and update ──
    const startTime = Date.now();
    let proteinUpdated = 0;
    let constructUpdated = 0;
    let apiFetched = 0;
    let apiErrors = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Progress every 100 entries
      if (i > 0 && i % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (i / ((Date.now() - startTime) / 1000)).toFixed(1);
        console.log(
          `[${i.toLocaleString()}/${entries.length.toLocaleString()}] ` +
          `protein: +${proteinUpdated} | construct: +${constructUpdated} | ` +
          `errors: ${apiErrors} | ${elapsed}s (${rate}/s)`
        );
      }

      // Fetch metadata from PDB API
      const meta = await fetchPdbMetadata(entry.pdbId);
      apiFetched++;

      if (!meta.geneName && !meta.description && !meta.expressionSystem) {
        apiErrors++;
        await sleep(200);
        continue;
      }

      // Derive abbreviation: use description if <= 50 chars
      const abbreviation =
        meta.description && meta.description.length <= 50
          ? meta.description
          : null;

      if (dryRun) {
        if (i < 10) {
          console.log(
            `  [DRY] protein_id=${entry.proteinId} pdb=${entry.pdbId}: ` +
            `gene=${meta.geneName || '-'}, abbr=${abbreviation || '-'}, ` +
            `organism=${meta.organism || '-'}, expr_sys=${meta.expressionSystem || '-'}`
          );
        }
      } else {
        // UPDATE kbsi_protein: gene_name, abbreviation (only if NULL)
        if (meta.geneName) {
          const { rowCount } = await client.query(
            'UPDATE kbsi_protein SET gene_name = $1 WHERE id = $2 AND gene_name IS NULL',
            [meta.geneName, entry.proteinId]
          );
          if (rowCount && rowCount > 0) proteinUpdated++;
        }

        if (abbreviation) {
          await client.query(
            'UPDATE kbsi_protein SET abbreviation = $1 WHERE id = $2 AND abbreviation IS NULL',
            [abbreviation, entry.proteinId]
          );
        }

        // UPDATE kbsi_construct: expression_system (only if NULL)
        if (meta.expressionSystem) {
          const constructIds = [...entry.constructIds];
          for (let ci = 0; ci < constructIds.length; ci += 100) {
            const batch = constructIds.slice(ci, ci + 100);
            await client.query(
              'UPDATE kbsi_construct SET expression_system = $1 WHERE id = ANY($2) AND expression_system IS NULL',
              [meta.expressionSystem, batch]
            );
          }
          constructUpdated += entry.constructIds.size;
        }
      }

      // 200ms delay between API calls
      await sleep(200);
    }

    // Final report
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Backfill complete in ${elapsed}s`);
    console.log(`  PDB API fetched: ${apiFetched.toLocaleString()}`);
    console.log(`  API errors/empty: ${apiErrors.toLocaleString()}`);
    console.log(`  Protein gene_name updated: ${proteinUpdated.toLocaleString()}`);
    console.log(`  Construct expression_system updated: ${constructUpdated.toLocaleString()}`);
    if (dryRun) console.log('  (DRY-RUN: no actual updates)');
    console.log('='.repeat(60));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
