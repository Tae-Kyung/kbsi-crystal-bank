/**
 * kbsi_mutation 테이블 채우기 — PDB GraphQL에서 pdbx_mutation 추출
 *
 * mutant construct의 PDB ID → PDB GraphQL batch 조회 → mutation 파싱 → kbsi_mutation INSERT
 *
 * npx tsx scripts/backfill-mutations.ts [--dry-run] [--limit N] [--batch-size N]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PDB_GRAPHQL = 'https://data.rcsb.org/graphql';
const GRAPHQL_BATCH = 40; // PDB IDs per GraphQL request
const RATE_DELAY = 300;   // ms between GraphQL requests

interface Construct {
  id: number;
  name: string;
  protein_id: number;
  kbsi_protein: { full_name: string } | null;
}

interface PdbMutation {
  entityId: string;
  description: string | null;
  mutations: string[];  // individual mutations like "L457V"
}

// ─── Parse mutation string ───
// "L457V, C488A, C584S" → ["L457V", "C488A", "C584S"]
// "L457V/C488A/C584S" → ["L457V", "C488A", "C584S"]
// "K27M" → ["K27M"]
function parseMutations(raw: string): string[] {
  return raw
    .split(/[,;/]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 30);  // sanity check
}

// ─── Extract PDB ID from construct name ───
function extractPdbId(name: string): string | null {
  // "1AGW-chain" → "1AGW"
  const match = name.match(/^([0-9A-Za-z]{4})-/);
  return match ? match[1].toUpperCase() : null;
}

// ─── Batch query PDB GraphQL ───
async function fetchMutations(pdbIds: string[]): Promise<Map<string, PdbMutation[]>> {
  const result = new Map<string, PdbMutation[]>();
  if (pdbIds.length === 0) return result;

  const query = `{
    entries(entry_ids: [${pdbIds.map(id => `"${id}"`).join(', ')}]) {
      rcsb_id
      polymer_entities {
        rcsb_id
        rcsb_polymer_entity {
          pdbx_description
          pdbx_mutation
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
        console.error(`  GraphQL error: ${resp.status} (attempt ${attempt + 1})`);
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
    const mutations: PdbMutation[] = [];
    for (const pe of entry.polymer_entities || []) {
      const raw = pe.rcsb_polymer_entity?.pdbx_mutation;
      if (raw) {
        mutations.push({
          entityId: pe.rcsb_id,
          description: pe.rcsb_polymer_entity?.pdbx_description || null,
          mutations: parseMutations(raw),
        });
      }
    }
    if (mutations.length > 0) {
      result.set(pdbId, mutations);
    }
  }

  return result;
}

// ─── Match construct to entity by protein name similarity ───
function findBestEntity(
  construct: Construct,
  entities: PdbMutation[]
): PdbMutation | null {
  if (entities.length === 1) return entities[0];

  const proteinName = (construct.kbsi_protein?.full_name || '').toLowerCase();
  if (!proteinName) return entities[0]; // fallback to first

  let best: PdbMutation | null = null;
  let bestScore = -1;

  for (const entity of entities) {
    const desc = (entity.description || '').toLowerCase();
    // Simple word overlap score
    const proteinWords = proteinName.split(/\s+/).filter(w => w.length > 2);
    const descWords = desc.split(/\s+/).filter(w => w.length > 2);
    const overlap = proteinWords.filter(w => descWords.includes(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = entity;
    }
  }

  return best || entities[0];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;
  const batchIdx = process.argv.indexOf('--batch-size');
  const batchSize = batchIdx >= 0 ? parseInt(process.argv[batchIdx + 1]) : GRAPHQL_BATCH;

  console.log(`=== kbsi_mutation Backfill (PDB GraphQL) ===`);
  console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}, batch: ${batchSize}\n`);

  // 1. 이미 mutation이 있는 construct 제외 목록
  const { data: existingRows } = await supabase
    .from('kbsi_mutation')
    .select('construct_id');
  const existingSet = new Set((existingRows || []).map(r => r.construct_id));
  console.log(`기존 mutation 레코드: ${existingSet.size}건`);

  // 2. mutant construct 전체 로드
  let constructs: Construct[] = [];
  let offset = 0;
  while (constructs.length < limit) {
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, name, protein_id, kbsi_protein(full_name)')
      .eq('construct_type', 'mutant')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    constructs.push(...(data as any));
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (limit !== Infinity) constructs = constructs.slice(0, limit);

  // 기존 mutation 있는 construct 제외
  constructs = constructs.filter(c => !existingSet.has(c.id));
  console.log(`대상 mutant constructs: ${constructs.length}건 (기존 제외)\n`);

  // 3. PDB ID별 그룹핑
  const pdbGroups = new Map<string, Construct[]>();
  let noPdbCount = 0;
  for (const c of constructs) {
    const pdbId = extractPdbId(c.name);
    if (!pdbId) { noPdbCount++; continue; }
    if (!pdbGroups.has(pdbId)) pdbGroups.set(pdbId, []);
    pdbGroups.get(pdbId)!.push(c);
  }
  console.log(`고유 PDB ID: ${pdbGroups.size}개 (PDB ID 없음: ${noPdbCount}건)\n`);

  // 4. 배치로 PDB GraphQL 호출
  const allPdbIds = Array.from(pdbGroups.keys());
  let totalInserted = 0;
  let totalWithMutation = 0;
  let totalNoMutation = 0;
  let batchNum = 0;

  for (let i = 0; i < allPdbIds.length; i += batchSize) {
    const batchIds = allPdbIds.slice(i, i + batchSize);
    batchNum++;

    const mutationMap = await fetchMutations(batchIds);

    // 각 PDB의 construct에 mutation 매핑
    const inserts: { construct_id: number; mutation: string }[] = [];

    for (const pdbId of batchIds) {
      const constructsForPdb = pdbGroups.get(pdbId) || [];
      const entities = mutationMap.get(pdbId);

      if (!entities || entities.length === 0) {
        totalNoMutation += constructsForPdb.length;
        continue;
      }

      for (const construct of constructsForPdb) {
        const bestEntity = findBestEntity(construct, entities);
        if (!bestEntity) continue;

        for (const mut of bestEntity.mutations) {
          inserts.push({ construct_id: construct.id, mutation: mut });
        }
        totalWithMutation++;
      }
    }

    // DB INSERT
    if (inserts.length > 0 && !dryRun) {
      // Supabase upsert in chunks of 500
      for (let j = 0; j < inserts.length; j += 500) {
        const chunk = inserts.slice(j, j + 500);
        const { error } = await supabase.from('kbsi_mutation').insert(chunk);
        if (error) {
          console.error(`  INSERT error (batch ${batchNum}): ${error.message}`);
        }
      }
    }

    totalInserted += inserts.length;

    if (batchNum % 10 === 0 || i + batchSize >= allPdbIds.length) {
      const pct = ((i + batchSize) / allPdbIds.length * 100).toFixed(1);
      console.log(`  [${Math.min(i + batchSize, allPdbIds.length)}/${allPdbIds.length} PDBs, ${pct}%] mutations: ${totalInserted}, matched: ${totalWithMutation}, no-mutation: ${totalNoMutation}`);
    }

    await new Promise(r => setTimeout(r, RATE_DELAY));
  }

  console.log(`\n${'='.repeat(55)}`);
  console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
  console.log(`  mutation 레코드 삽입: ${totalInserted}건`);
  console.log(`  mutation 있는 construct: ${totalWithMutation}건`);
  console.log(`  PDB에 mutation 없음: ${totalNoMutation}건`);
  console.log(`  PDB ID 추출 불가: ${noPdbCount}건`);
  console.log('='.repeat(55));
}

main().catch(console.error);
