/**
 * gene_name Backfill — PDB GraphQL에서 rcsb_gene_name 추출
 *
 * gene_name이 NULL인 protein → kbsi_database_id에서 PDB ID 조회 →
 * PDB GraphQL batch → gene_name 업데이트
 *
 * npx tsx scripts/backfill-gene-name-pdb.ts [--dry-run] [--limit N]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PDB_GRAPHQL = 'https://data.rcsb.org/graphql';
const GQL_BATCH = 40;
const RATE_DELAY = 300;

async function fetchGeneNames(pdbIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (pdbIds.length === 0) return result;

  const query = `{
    entries(entry_ids: [${pdbIds.map(id => `"${id}"`).join(', ')}]) {
      rcsb_id
      polymer_entities {
        rcsb_entity_source_organism { rcsb_gene_name { value } }
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
      if (!resp.ok) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
      json = await resp.json();
      break;
    } catch (err: any) {
      console.error(`  fetch error (attempt ${attempt + 1}): ${err.message}`);
      await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  if (!json?.data?.entries) return result;

  for (const entry of json.data.entries) {
    const genes = new Set<string>();
    for (const pe of entry.polymer_entities || []) {
      for (const org of pe.rcsb_entity_source_organism || []) {
        for (const gn of org.rcsb_gene_name || []) {
          if (gn.value) genes.add(gn.value);
        }
      }
    }
    if (genes.size > 0) {
      result.set(entry.rcsb_id, Array.from(genes));
    }
  }
  return result;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;

  console.log(`=== gene_name Backfill (PDB GraphQL) ===`);
  console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}\n`);

  // 1. gene_name이 NULL인 protein의 PDB ID 수집
  console.log('gene_name NULL protein + PDB ID 로딩...');
  const proteinPdbMap = new Map<number, string[]>(); // protein_id → [pdb_ids]
  let offset = 0;
  while (proteinPdbMap.size < (limit === Infinity ? 999999 : limit)) {
    const { data } = await supabase
      .from('kbsi_protein')
      .select('id')
      .is('gene_name', null)
      .order('id')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;

    const pids = data.map((d: any) => d.id);

    // 이 protein들의 PDB IDs 가져오기
    const { data: dbIds } = await supabase
      .from('kbsi_database_id')
      .select('protein_id, db_value')
      .eq('db_name', 'PDB')
      .in('protein_id', pids);

    for (const row of dbIds || []) {
      if (!proteinPdbMap.has(row.protein_id)) proteinPdbMap.set(row.protein_id, []);
      proteinPdbMap.get(row.protein_id)!.push(row.db_value.toUpperCase());
    }

    if (data.length < 1000) break;
    offset += 1000;
  }

  // PDB ID가 있는 protein만 필터
  const proteinsWithPdb = Array.from(proteinPdbMap.entries()).filter(([, pdbs]) => pdbs.length > 0);
  console.log(`gene_name NULL: ${proteinPdbMap.size + (limit !== Infinity ? 0 : offset)}개`);
  console.log(`PDB ID 있는 대상: ${proteinsWithPdb.length}개\n`);

  // 2. 고유 PDB ID 수집 → batch 쿼리
  const pdbToProteins = new Map<string, number[]>();
  for (const [proteinId, pdbIds] of proteinsWithPdb) {
    for (const pdbId of pdbIds) {
      if (!pdbToProteins.has(pdbId)) pdbToProteins.set(pdbId, []);
      pdbToProteins.get(pdbId)!.push(proteinId);
    }
  }

  const allPdbIds = Array.from(pdbToProteins.keys());
  console.log(`고유 PDB ID: ${allPdbIds.length}개\n`);

  let updated = 0;
  let noGene = 0;

  for (let i = 0; i < allPdbIds.length; i += GQL_BATCH) {
    const batchIds = allPdbIds.slice(i, i + GQL_BATCH);
    const geneMap = await fetchGeneNames(batchIds);

    for (const pdbId of batchIds) {
      const genes = geneMap.get(pdbId);
      const proteinIds = pdbToProteins.get(pdbId) || [];

      if (!genes || genes.length === 0) {
        noGene += proteinIds.length;
        continue;
      }

      const geneName = genes[0]; // 첫 번째 gene name 사용

      for (const proteinId of proteinIds) {
        if (!dryRun) {
          await supabase
            .from('kbsi_protein')
            .update({ gene_name: geneName })
            .eq('id', proteinId)
            .is('gene_name', null); // 이미 채워진 경우 건너뜀
        }
        updated++;
      }
    }

    if ((i + GQL_BATCH) % (GQL_BATCH * 20) === 0 || i + GQL_BATCH >= allPdbIds.length) {
      const done = Math.min(i + GQL_BATCH, allPdbIds.length);
      console.log(`  [${done}/${allPdbIds.length} PDBs] updated: ${updated}, no-gene: ${noGene}`);
    }

    await new Promise(r => setTimeout(r, RATE_DELAY));
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
  console.log(`  gene_name 업데이트: ${updated}건`);
  console.log(`  PDB에 gene_name 없음: ${noGene}건`);
  console.log('='.repeat(50));
}

main().catch(console.error);
