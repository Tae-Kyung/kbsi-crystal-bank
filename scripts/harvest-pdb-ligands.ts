/**
 * PDB 구조에서 결합 리간드 추출 → kbsi_ligand + kbsi_construct_ligand 저장
 *
 * RCSB PDB REST API를 사용하여 각 PDB entry의 nonpolymer entity (리간드)를
 * 조회하고, 화학 정보 (SMILES, InChI, MW)를 수집하여 DB에 적재합니다.
 *
 * npx tsx scripts/harvest-pdb-ligands.ts [옵션]
 *   --limit 1000      최대 처리할 PDB 엔트리 수
 *   --offset 0        시작 오프셋
 *   --dry-run         미리보기 (DB 변경 없음)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RCSB_BASE = 'https://data.rcsb.org/rest/v1/core';

// 일반적인 용매/버퍼/이온 — 실제 리간드가 아님
const SKIP_COMP_IDS = new Set([
  'HOH', 'GOL', 'EDO', 'PEG', 'SO4', 'PO4', 'CL', 'NA', 'MG', 'ZN',
  'CA', 'K', 'MN', 'FE', 'CO', 'NI', 'CU', 'CD', 'IOD', 'BR',
  'ACT', 'FMT', 'DMS', 'BME', 'TRS', 'MPD', 'EPE', 'MES', 'CIT',
  'HEX', 'IMD', '1PE', 'P6G', 'PG4', 'PGE', '2PE', 'IPA',
]);

// chemcomp 캐시: comp_id → { smiles, inchi, mw, name }
interface ChemCompInfo {
  name: string;
  smiles: string | null;
  inchi: string | null;
  mw: number | null;
}
const chemCompCache = new Map<string, ChemCompInfo | null>();

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * PDB entry에서 nonpolymer entity 정보 가져오기
 * Returns: comp_ids (HET codes) 배열
 */
async function fetchNonpolymerEntities(pdbId: string): Promise<string[]> {
  const url = `${RCSB_BASE}/entry/${pdbId}`;
  const data = await fetchJson(url);
  if (!data) return [];

  const entityCount = data?.rcsb_entry_info?.nonpolymer_entity_count ?? 0;
  if (entityCount === 0) return [];

  const compIds: string[] = [];
  for (let entityId = 1; entityId <= entityCount + 5; entityId++) {
    // entity IDs may not be sequential for nonpolymer entities,
    // so we try a few extra. Break after consecutive failures.
    const entityUrl = `${RCSB_BASE}/nonpolymer_entity/${pdbId}/${entityId}`;
    const entityData = await fetchJson(entityUrl);
    if (!entityData) continue;

    const compId = entityData?.pdbx_entity_nonpoly?.comp_id;
    if (compId && !SKIP_COMP_IDS.has(compId)) {
      compIds.push(compId);
    }
    await sleep(100);
  }

  return [...new Set(compIds)]; // deduplicate
}

/**
 * chemcomp에서 SMILES/InChI/MW 조회 (캐시됨)
 */
async function fetchChemComp(compId: string): Promise<ChemCompInfo | null> {
  if (chemCompCache.has(compId)) {
    return chemCompCache.get(compId)!;
  }

  const url = `${RCSB_BASE}/chemcomp/${compId}`;
  const data = await fetchJson(url);
  if (!data) {
    chemCompCache.set(compId, null);
    return null;
  }

  // SMILES: look for canonical SMILES in descriptor list
  let smiles: string | null = null;
  let inchi: string | null = null;

  const descriptors = data?.rcsb_chem_comp_descriptor ?? [];
  if (Array.isArray(descriptors)) {
    for (const d of descriptors) {
      if (d.type === 'SMILES_CANONICAL' || d.type === 'SMILES') {
        smiles = smiles || d.descriptor;
      }
      if (d.type === 'InChI') {
        inchi = inchi || d.descriptor;
      }
    }
  }

  // Name and MW from chem_comp
  const name = data?.chem_comp?.name ?? compId;
  const mw = data?.chem_comp?.formula_weight
    ? parseFloat(data.chem_comp.formula_weight)
    : null;

  const info: ChemCompInfo = { name, smiles, inchi, mw };
  chemCompCache.set(compId, info);
  await sleep(200);
  return info;
}

/**
 * kbsi_structure에서 pdb_id가 있는 엔트리를 페이지네이션으로 가져오기
 */
async function fetchStructuresWithPdb(offset: number, limit: number) {
  const rows: { id: number; construct_id: number; pdb_id: string }[] = [];
  const pageSize = 1000;
  let fetched = 0;

  while (fetched < limit) {
    const batchSize = Math.min(pageSize, limit - fetched);
    const { data, error } = await supabase
      .from('kbsi_structure')
      .select('id, construct_id, pdb_id')
      .not('pdb_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset + fetched, offset + fetched + batchSize - 1);

    if (error) {
      console.error('DB 조회 에러:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    fetched += data.length;
    if (data.length < batchSize) break; // no more rows
  }

  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '0') || Infinity;
  const offset = parseInt(args[args.indexOf('--offset') + 1] || '0') || 0;
  const dryRun = args.includes('--dry-run');

  console.log('PDB 구조 → 리간드 추출');
  console.log(`offset: ${offset}, limit: ${limit === Infinity ? 'ALL' : limit}, dry-run: ${dryRun}\n`);

  // 1) DB에서 pdb_id가 있는 structure 목록 가져오기
  const fetchLimit = limit === Infinity ? 999999 : limit;
  const structures = await fetchStructuresWithPdb(offset, fetchLimit);
  console.log(`PDB 엔트리: ${structures.length}개\n`);

  if (structures.length === 0) {
    console.log('처리할 데이터 없음');
    return;
  }

  // 기존 PDB 소스 리간드 캐시: source_id(comp_id) → ligand_id
  const ligandIdCache = new Map<string, number>();

  let totalNewLigands = 0;
  let totalNewBindings = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let processed = 0;

  for (const structure of structures) {
    processed++;
    const pdbId = structure.pdb_id.toUpperCase();

    // 2) PDB에서 nonpolymer entity(리간드) 조회
    const compIds = await fetchNonpolymerEntities(pdbId);
    await sleep(200);

    if (compIds.length === 0) {
      totalSkipped++;
      if (processed % 100 === 0) {
        printProgress(processed, structures.length, totalNewLigands, totalNewBindings);
      }
      continue;
    }

    // 3) 각 comp_id에 대해 처리
    for (const compId of compIds) {
      const chemInfo = await fetchChemComp(compId);
      if (!chemInfo) continue;

      if (dryRun) {
        console.log(`  [${pdbId}] ${compId}: ${chemInfo.name} | MW=${chemInfo.mw} | SMILES=${chemInfo.smiles?.substring(0, 50) ?? 'N/A'}`);
        totalNewBindings++;
        continue;
      }

      try {
        // 3a) kbsi_ligand: source_db='PDB', source_id=comp_id로 찾거나 삽입
        let ligandId = ligandIdCache.get(compId);

        if (!ligandId) {
          const { data: existing } = await supabase
            .from('kbsi_ligand')
            .select('id')
            .eq('source_db', 'PDB')
            .eq('source_id', compId)
            .maybeSingle();

          if (existing) {
            ligandId = existing.id;
            ligandIdCache.set(compId, ligandId);
          } else {
            const { data: newL, error } = await supabase
              .from('kbsi_ligand')
              .insert({
                name: chemInfo.name,
                smiles: chemInfo.smiles,
                inchi: chemInfo.inchi,
                mw: chemInfo.mw,
                source: `PDB HET ${compId}`,
                source_db: 'PDB',
                source_id: compId,
              })
              .select('id')
              .single();

            if (error) {
              totalErrors++;
              continue;
            }
            ligandId = newL.id;
            ligandIdCache.set(compId, ligandId);
            totalNewLigands++;
          }
        }

        // 3b) kbsi_construct_ligand: upsert
        const { error: bErr } = await supabase
          .from('kbsi_construct_ligand')
          .upsert(
            {
              construct_id: structure.construct_id,
              ligand_id: ligandId,
              source_db: 'PDB',
              source_id: pdbId,
              notes: `Bound ligand ${compId} from PDB ${pdbId}`,
            },
            { onConflict: 'construct_id,ligand_id' }
          );

        if (bErr) {
          totalErrors++;
        } else {
          totalNewBindings++;
        }
      } catch {
        totalErrors++;
      }
    }

    if (processed % 100 === 0) {
      printProgress(processed, structures.length, totalNewLigands, totalNewBindings);
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
  console.log(`처리된 PDB 엔트리: ${processed}개`);
  console.log(`리간드 없음 (건너뜀): ${totalSkipped}개`);
  console.log(`신규 리간드: ${totalNewLigands}건`);
  console.log(`바인딩 데이터: ${totalNewBindings}건`);
  console.log(`chemcomp 캐시: ${chemCompCache.size}개`);
  console.log(`에러: ${totalErrors}건`);
  console.log('═'.repeat(50));
}

function printProgress(
  current: number,
  total: number,
  ligands: number,
  bindings: number
) {
  const pct = ((current / total) * 100).toFixed(1);
  console.log(
    `  [진행] ${current}/${total} (${pct}%) | 신규 리간드: ${ligands} | 바인딩: ${bindings} | chemcomp 캐시: ${chemCompCache.size}`
  );
}

main().catch(console.error);
