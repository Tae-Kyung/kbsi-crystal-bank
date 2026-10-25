/**
 * PDB 리간드 수확 v2 — GraphQL 배치 쿼리 (기존 REST 대비 ~50배 빠름)
 *
 * kbsi_structure(pdb_id) -> PDB GraphQL batch -> kbsi_ligand + kbsi_construct_ligand
 * 이미 처리된 construct는 건너뜀 (이어하기 가능)
 *
 * npx tsx scripts/harvest-pdb-ligands-v2.ts [--dry-run] [--limit N]
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const PDB_GRAPHQL = 'https://data.rcsb.org/graphql';
const GQL_BATCH = 30;
const RATE_DELAY = 400;

const SKIP_COMP_IDS = new Set([
  'HOH', 'GOL', 'EDO', 'PEG', 'SO4', 'PO4', 'CL', 'NA', 'MG', 'ZN',
  'CA', 'K', 'MN', 'FE', 'CO', 'NI', 'CU', 'CD', 'IOD', 'BR',
  'ACT', 'FMT', 'DMS', 'BME', 'TRS', 'MPD', 'EPE', 'MES', 'CIT',
  'HEX', 'IMD', '1PE', 'P6G', 'PG4', 'PGE', '2PE', 'IPA',
]);

interface LigandInfo {
  compId: string;
  name: string;
  smiles: string | null;
  inchi: string | null;
  mw: number | null;
}

async function fetchLigandsBatch(pdbIds: string[]): Promise<Map<string, LigandInfo[]>> {
  const result = new Map<string, LigandInfo[]>();
  if (pdbIds.length === 0) return result;

  const query = `{
    entries(entry_ids: [${pdbIds.map(id => `"${id}"`).join(', ')}]) {
      rcsb_id
      nonpolymer_entities {
        pdbx_entity_nonpoly { comp_id name }
        nonpolymer_comp {
          chem_comp { id name formula_weight }
          rcsb_chem_comp_descriptor { SMILES InChI }
        }
      }
    }
  }`;

  let json: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(PDB_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!resp.ok) {
        console.error(`  GraphQL ${resp.status} (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      json = await resp.json();
      break;
    } catch (err: any) {
      console.error(`  fetch error (attempt ${attempt + 1}): ${err.message}`);
      await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  if (!json?.data?.entries) return result;

  for (const entry of json.data.entries) {
    const pdbId = entry.rcsb_id;
    const ligands: LigandInfo[] = [];
    const seen = new Set<string>();

    for (const npe of entry.nonpolymer_entities || []) {
      const compId = npe.pdbx_entity_nonpoly?.comp_id;
      if (!compId || SKIP_COMP_IDS.has(compId) || seen.has(compId)) continue;
      seen.add(compId);

      const cc = npe.nonpolymer_comp?.chem_comp;
      const desc = npe.nonpolymer_comp?.rcsb_chem_comp_descriptor;

      ligands.push({
        compId,
        name: cc?.name || compId,
        smiles: desc?.SMILES || null,
        inchi: desc?.InChI || null,
        mw: cc?.formula_weight ? parseFloat(cc.formula_weight) : null,
      });
    }

    if (ligands.length > 0) {
      result.set(pdbId, ligands);
    }
  }

  return result;
}

async function main() {
  await client.connect();
  try {
    const dryRun = process.argv.includes('--dry-run');
    const limitIdx = process.argv.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;

    console.log(`=== PDB Ligands Harvest v2 (GraphQL) ===`);
    console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}\n`);

    // 1. 이미 PDB 바인딩이 있는 construct_id 수집
    console.log('기존 바인딩 construct_id 로딩...');
    const processedConstructs = new Set<number>();
    let offset = 0;
    while (true) {
      const { rows: data } = await client.query(
        `SELECT construct_id FROM kbsi_construct_ligand WHERE source_db = $1 OFFSET $2 LIMIT 1000`,
        ['PDB', offset]
      );
      if (!data || data.length === 0) break;
      for (const r of data) processedConstructs.add(r.construct_id);
      if (data.length < 1000) break;
      offset += 1000;
    }
    console.log(`기존 처리 완료 construct: ${processedConstructs.size}개`);

    // 2. pdb_id 있는 structure 전체 로드
    console.log('미처리 structure 로딩...');
    interface StructRow { id: number; construct_id: number; pdb_id: string }
    let allStructures: StructRow[] = [];
    offset = 0;
    while (true) {
      const { rows: data } = await client.query(
        `SELECT id, construct_id, pdb_id FROM kbsi_structure
         WHERE pdb_id IS NOT NULL ORDER BY id OFFSET $1 LIMIT 1000`,
        [offset]
      );
      if (!data || data.length === 0) break;
      allStructures.push(...data);
      if (offset % 50000 === 0) console.log(`  structure 로딩: ${allStructures.length}건...`);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const structures = allStructures.filter(s => !processedConstructs.has(s.construct_id));
    if (limit !== Infinity) structures.splice(limit);

    console.log(`전체 structure: ${allStructures.length}, 미처리: ${structures.length}개\n`);

    if (structures.length === 0) {
      console.log('모든 structure가 이미 처리되었습니다!');
      return;
    }

    // 3. PDB ID별 그룹핑
    const pdbGroups = new Map<string, StructRow[]>();
    for (const s of structures) {
      const pdbId = s.pdb_id.toUpperCase();
      if (!pdbGroups.has(pdbId)) pdbGroups.set(pdbId, []);
      pdbGroups.get(pdbId)!.push(s);
    }

    const allPdbIds = Array.from(pdbGroups.keys());
    console.log(`고유 PDB ID: ${allPdbIds.length}개\n`);

    // 4. ligand ID 캐시
    const ligandIdCache = new Map<string, number>();

    let totalNewLigands = 0;
    let totalNewBindings = 0;
    let totalNoLigand = 0;
    let totalErrors = 0;
    let batchNum = 0;

    for (let i = 0; i < allPdbIds.length; i += GQL_BATCH) {
      const batchIds = allPdbIds.slice(i, i + GQL_BATCH);
      batchNum++;

      const ligandMap = await fetchLigandsBatch(batchIds);

      for (const pdbId of batchIds) {
        const structsForPdb = pdbGroups.get(pdbId) || [];
        const ligands = ligandMap.get(pdbId);

        if (!ligands || ligands.length === 0) {
          totalNoLigand += structsForPdb.length;
          continue;
        }

        for (const lig of ligands) {
          let ligandId = ligandIdCache.get(lig.compId);

          if (!ligandId) {
            const { rows: existing } = await client.query(
              'SELECT id FROM kbsi_ligand WHERE source_db = $1 AND source_id = $2 LIMIT 1',
              ['PDB', lig.compId]
            );

            if (existing && existing.length > 0) {
              ligandId = existing[0].id;
            } else if (!dryRun) {
              try {
                const { rows: [newL] } = await client.query(
                  `INSERT INTO kbsi_ligand (name, smiles, inchi, mw, source, source_db, source_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                  [lig.name, lig.smiles, lig.inchi, lig.mw, `PDB HET ${lig.compId}`, 'PDB', lig.compId]
                );
                ligandId = newL.id;
                totalNewLigands++;
              } catch { totalErrors++; continue; }
            } else {
              totalNewLigands++;
              continue;
            }
            if (ligandId) ligandIdCache.set(lig.compId, ligandId);
          }

          if (!ligandId) continue;

          const bindingRows = structsForPdb.map(s => ({
            construct_id: s.construct_id,
            ligand_id: ligandId!,
            source_db: 'PDB',
            source_id: pdbId,
            notes: `Bound ligand ${lig.compId} from PDB ${pdbId}`,
          }));

          if (!dryRun) {
            for (let j = 0; j < bindingRows.length; j += 200) {
              const chunk = bindingRows.slice(j, j + 200);
              for (const row of chunk) {
                try {
                  await client.query(
                    `INSERT INTO kbsi_construct_ligand (construct_id, ligand_id, source_db, source_id, notes)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (construct_id, ligand_id) DO UPDATE SET source_id = EXCLUDED.source_id`,
                    [row.construct_id, row.ligand_id, row.source_db, row.source_id, row.notes]
                  );
                } catch { totalErrors++; }
              }
            }
          }
          totalNewBindings += bindingRows.length;
        }
      }

      if (batchNum % 20 === 0 || i + GQL_BATCH >= allPdbIds.length) {
        const done = Math.min(i + GQL_BATCH, allPdbIds.length);
        const pct = (done / allPdbIds.length * 100).toFixed(1);
        console.log(`  [${done}/${allPdbIds.length} PDBs, ${pct}%] ligands: +${totalNewLigands} | bindings: +${totalNewBindings} | no-ligand: ${totalNoLigand} | errors: ${totalErrors}`);
      }

      await new Promise(r => setTimeout(r, RATE_DELAY));
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
    console.log(`  신규 리간드: ${totalNewLigands}건`);
    console.log(`  바인딩 추가: ${totalNewBindings}건`);
    console.log(`  리간드 없음: ${totalNoLigand}건`);
    console.log(`  에러: ${totalErrors}건`);
    console.log(`  chemcomp 캐시: ${ligandIdCache.size}개`);
    console.log('='.repeat(60));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
