/**
 * UniProt ID Backfill
 * PDB 구조의 polymer entity에서 UniProt accession을 가져와 kbsi_database_id에 저장
 *
 * npx tsx scripts/backfill-uniprot-ids.ts [옵션]
 *   --limit 10000     처리 건수 (기본: 10000)
 *   --dry-run          미리보기
 *   --concurrency 10   동시 PDB fetch 수
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  console.log('UniProt ID Backfill');
  console.log(`limit: ${limit}, concurrency: ${concurrency}, dry-run: ${dryRun}\n`);

  // 이미 UniProt ID가 있는 protein_id 조회
  let existingIds = new Set<number>();
  let off = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_database_id')
      .select('protein_id')
      .eq('db_name', 'UniProt')
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) existingIds.add(r.protein_id);
    if (data.length < 1000) break;
    off += 1000;
  }
  console.log(`기존 UniProt 연결: ${existingIds.size}건`);

  // PDB ID가 있는 structure → construct → protein_id 조회
  let structures: { pdb_id: string; protein_id: number }[] = [];
  const seenProteins = new Set<number>(existingIds);
  off = 0;
  while (structures.length < limit) {
    const { data: structs } = await supabase
      .from('kbsi_structure')
      .select('pdb_id, construct_id')
      .not('pdb_id', 'is', null)
      .range(off, off + 999);
    if (!structs || structs.length === 0) break;

    // construct_id → protein_id 매핑
    const constructIds = [...new Set((structs as any[]).map(s => s.construct_id))];
    const { data: constructs } = await supabase
      .from('kbsi_construct')
      .select('id, protein_id')
      .in('id', constructIds.slice(0, 100)); // Supabase .in() 제한

    const constructMap = new Map<number, number>();
    for (const c of (constructs || []) as any[]) {
      constructMap.set(c.id, c.protein_id);
    }

    for (const s of structs as any[]) {
      const proteinId = constructMap.get(s.construct_id);
      if (proteinId && !seenProteins.has(proteinId)) {
        structures.push({ pdb_id: s.pdb_id, protein_id: proteinId });
        seenProteins.add(proteinId);
      }
    }
    if (structs.length < 1000) break;
    off += 1000;
  }
  structures = structures.slice(0, limit);
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

      const { error } = await supabase
        .from('kbsi_database_id')
        .insert({ protein_id: r.protein_id, db_name: 'UniProt', db_value: r.uniprotId })
        .then(res => res);

      if (!error) { success++; }
      else if (error.code === '23505') { success++; } // duplicate OK
      else { failed++; }
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
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
main().catch(console.error);
