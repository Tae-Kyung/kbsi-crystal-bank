/**
 * DrugBank harvest via UniProt cross-references
 *
 * For each protein in our DB with a UniProt ID, queries the UniProt API
 * for DrugBank cross-references and pharmaceutical annotations.
 * Inserts found drugs into kbsi_ligand (source_db='DrugBank') and links
 * them to constructs via kbsi_construct_ligand.
 *
 * Usage:
 *   npx tsx scripts/harvest-drugbank.ts [--limit N] [--dry-run]
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const LAB_PG = {
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
};

const UNIPROT_API = 'https://rest.uniprot.org/uniprotkb/stream';
const BATCH_SIZE = 100;       // accessions per UniProt API call
const RATE_DELAY = 300;       // ms between API calls (~3 req/s, well under 10/s limit)
const INSERT_BATCH = 500;     // rows per INSERT statement

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function fmt(n: number) { return n.toLocaleString(); }

// ─── Parsed types ───
interface DrugBankRef {
  accession: string;
  drugbankId: string;
  drugName: string;
}

interface PharmAnnotation {
  accession: string;
  pharmaceutical: string | null;
}

// ─── UniProt API: batch fetch DrugBank cross-references ───
async function fetchDrugBankRefs(accessions: string[]): Promise<DrugBankRef[]> {
  const results: DrugBankRef[] = [];
  if (accessions.length === 0) return results;

  const query = accessions.map(a => `accession:${a}`).join('+OR+');
  const url = `${UNIPROT_API}?query=${query}&fields=accession,xref_drugbank,cc_pharmaceutical&format=json&size=500`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'KBSI-CrystalBank/1.0 (protein crystallization research)',
        },
      });

      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
        console.warn(`  Rate limited, waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!resp.ok) {
        console.error(`  UniProt API ${resp.status} (attempt ${attempt + 1})`);
        await sleep(2000 * (attempt + 1));
        continue;
      }

      const data = await resp.json() as { results: any[] };
      if (!data.results) return results;

      for (const entry of data.results) {
        const acc = entry.primaryAccession;
        if (!acc) continue;

        // Parse DrugBank cross-references
        const dbRefs = entry.uniProtKBCrossReferences || [];
        for (const ref of dbRefs) {
          if (ref.database !== 'DrugBank') continue;
          const drugbankId = ref.id;
          // DrugBank xref properties contain the drug name
          const props = ref.properties || [];
          const nameProp = props.find((p: any) => p.key === 'GenericName');
          const drugName = nameProp?.value || drugbankId;

          results.push({ accession: acc, drugbankId, drugName });
        }
      }
      return results;
    } catch (err: any) {
      console.error(`  Fetch error (attempt ${attempt + 1}): ${err.message}`);
      await sleep(3000 * (attempt + 1));
    }
  }
  return results;
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5000;

  console.log(`\n=== DrugBank Harvest via UniProt ===`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Limit: ${fmt(limit)} UniProt IDs\n`);

  const client = new pg.Client(LAB_PG);
  await client.connect();
  console.log('Connected to Lab PostgreSQL');

  // 1. Get UniProt accessions from kbsi_database_id
  const { rows: uniprotRows } = await client.query(
    `SELECT DISTINCT di.db_value AS accession, di.protein_id
     FROM kbsi_database_id di
     WHERE di.db_name = 'UniProt'
     ORDER BY di.protein_id
     LIMIT $1`,
    [limit]
  );
  console.log(`Found ${fmt(uniprotRows.length)} UniProt accessions\n`);

  if (uniprotRows.length === 0) {
    console.log('No UniProt IDs found. Exiting.');
    await client.end();
    return;
  }

  // Build accession -> protein_id map
  const accToProteinId = new Map<string, number>();
  for (const row of uniprotRows) {
    accToProteinId.set(row.accession, row.protein_id);
  }

  // 2. Pre-load existing DrugBank ligands to avoid duplicates
  const { rows: existingLigands } = await client.query(
    `SELECT id, source_id FROM kbsi_ligand WHERE source_db = 'DrugBank'`
  );
  const ligandIdByDrugBankId = new Map<string, number>();
  for (const lig of existingLigands) {
    ligandIdByDrugBankId.set(lig.source_id, lig.id);
  }
  console.log(`Existing DrugBank ligands: ${fmt(existingLigands.length)}`);

  // 3. Pre-load protein_id -> construct_ids mapping
  //    We link drugs to ALL constructs of a protein
  const proteinIds = [...new Set(uniprotRows.map((r: any) => r.protein_id))];
  const constructMap = new Map<number, number[]>(); // protein_id -> construct_id[]

  // Fetch in batches to avoid overly large queries
  for (let i = 0; i < proteinIds.length; i += 5000) {
    const batch = proteinIds.slice(i, i + 5000);
    const { rows: cRows } = await client.query(
      `SELECT id, protein_id FROM kbsi_construct WHERE protein_id = ANY($1::bigint[])`,
      [batch]
    );
    for (const c of cRows) {
      const list = constructMap.get(c.protein_id) || [];
      list.push(c.id);
      constructMap.set(c.protein_id, list);
    }
  }
  const totalConstructs = [...constructMap.values()].reduce((s, v) => s + v.length, 0);
  console.log(`Mapped ${fmt(totalConstructs)} constructs across ${fmt(constructMap.size)} proteins`);

  // 4. Pre-load existing construct_ligand pairs to avoid unique constraint violations
  const existingPairs = new Set<string>();
  const { rows: existingCL } = await client.query(
    `SELECT construct_id, ligand_id FROM kbsi_construct_ligand WHERE source_db = 'DrugBank'`
  );
  for (const cl of existingCL) {
    existingPairs.add(`${cl.construct_id}:${cl.ligand_id}`);
  }
  console.log(`Existing DrugBank construct-ligand links: ${fmt(existingCL.length)}\n`);

  // 5. Process in batches
  const allAccessions = uniprotRows.map((r: any) => r.accession as string);
  let totalDrugsFound = 0;
  let totalLigandsInserted = 0;
  let totalLinksInserted = 0;
  let batchNum = 0;

  // Buffers for batch insert
  let ligandBuffer: { name: string; drugbankId: string }[] = [];
  let linkBuffer: { constructId: number; ligandId: number }[] = [];

  for (let i = 0; i < allAccessions.length; i += BATCH_SIZE) {
    const batch = allAccessions.slice(i, i + BATCH_SIZE);
    batchNum++;
    const progress = `[${fmt(i + batch.length)}/${fmt(allAccessions.length)}]`;

    const refs = await fetchDrugBankRefs(batch);

    if (refs.length > 0) {
      console.log(`${progress} Batch ${batchNum}: ${refs.length} drug-target mappings found`);
    }

    totalDrugsFound += refs.length;

    for (const ref of refs) {
      // Ensure ligand exists
      let ligandId = ligandIdByDrugBankId.get(ref.drugbankId);

      if (!ligandId && !dryRun) {
        const { rows: inserted } = await client.query(
          `INSERT INTO kbsi_ligand (name, source, source_db, source_id)
           VALUES ($1, $2, 'DrugBank', $3)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [ref.drugName, `DrugBank ${ref.drugbankId}`, ref.drugbankId]
        );

        if (inserted.length > 0) {
          ligandId = inserted[0].id;
          totalLigandsInserted++;
        } else {
          // ON CONFLICT: fetch existing
          const { rows: existing } = await client.query(
            `SELECT id FROM kbsi_ligand WHERE source_db = 'DrugBank' AND source_id = $1 LIMIT 1`,
            [ref.drugbankId]
          );
          if (existing.length > 0) ligandId = existing[0].id;
        }

        if (ligandId) {
          ligandIdByDrugBankId.set(ref.drugbankId, ligandId);
        }
      } else if (!ligandId && dryRun) {
        // In dry-run, just count
        if (!ligandIdByDrugBankId.has(ref.drugbankId)) {
          totalLigandsInserted++;
          ligandIdByDrugBankId.set(ref.drugbankId, -1); // placeholder
        }
        ligandId = -1;
      }

      if (!ligandId) continue;

      // Link to constructs of this protein
      const proteinId = accToProteinId.get(ref.accession);
      if (!proteinId) continue;

      const constructIds = constructMap.get(proteinId) || [];
      for (const cid of constructIds) {
        const key = `${cid}:${ligandId}`;
        if (existingPairs.has(key)) continue;
        existingPairs.add(key);

        if (!dryRun) {
          linkBuffer.push({ constructId: cid, ligandId });
          totalLinksInserted++;

          // Flush link buffer when large enough
          if (linkBuffer.length >= INSERT_BATCH) {
            await flushLinks(client, linkBuffer);
            linkBuffer = [];
          }
        } else {
          totalLinksInserted++;
        }
      }
    }

    // Rate limiting
    if (i + BATCH_SIZE < allAccessions.length) {
      await sleep(RATE_DELAY);
    }

    // Progress every 10 batches
    if (batchNum % 10 === 0) {
      console.log(`  ... processed ${fmt(i + batch.length)} accessions, ${fmt(totalDrugsFound)} drugs, ${fmt(totalLinksInserted)} links`);
    }
  }

  // Flush remaining links
  if (linkBuffer.length > 0 && !dryRun) {
    await flushLinks(client, linkBuffer);
  }

  // 6. Summary
  console.log(`\n=== Summary ===`);
  console.log(`UniProt IDs queried:    ${fmt(allAccessions.length)}`);
  console.log(`Drug-target refs found: ${fmt(totalDrugsFound)}`);
  console.log(`New ligands inserted:   ${fmt(totalLigandsInserted)}`);
  console.log(`New links inserted:     ${fmt(totalLinksInserted)}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no changes)' : 'LIVE'}`);

  await client.end();
  console.log('\nDone.');
}

async function flushLinks(client: pg.Client, links: { constructId: number; ligandId: number }[]) {
  if (links.length === 0) return;

  // Use multi-row INSERT with ON CONFLICT
  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < links.length; i++) {
    const offset = i * 3;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
    values.push(links[i].constructId, links[i].ligandId, 'DrugBank');
  }

  await client.query(
    `INSERT INTO kbsi_construct_ligand (construct_id, ligand_id, source_db)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (construct_id, ligand_id) DO NOTHING`,
    values
  );
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
