/**
 * PDB Database ID Backfill
 * kbsi_structure의 pdb_id를 kbsi_database_id에 등록 (PDB + NCBI Gene)
 *
 * npx tsx scripts/backfill-pdb-database-ids.ts [옵션]
 *   --limit 10000    처리 건수 (기본: 전체)
 *   --offset 0       시작 위치
 *   --dry-run        미리보기
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // 1) 기존 PDB 등록 조회 (중복 방지용)
  const existingPdb = new Set<string>(); // key = `${protein_id}::${pdb_id}`
  const existingNcbi = new Set<string>();
  let off = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_database_id')
      .select('protein_id, db_name, db_value')
      .in('db_name', ['PDB', 'NCBI Gene'])
      .range(off, off + 999);
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
    const { data, error } = await supabase
      .from('kbsi_structure')
      .select('pdb_id, construct_id')
      .not('pdb_id', 'is', null)
      .order('id')
      .range(off, off + 999);
    if (error) { console.error('조회 에러:', error.message); break; }
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
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, protein_id')
      .in('id', chunk);
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
        const { error } = await supabase
          .from('kbsi_database_id')
          .insert({ protein_id: proteinId, db_name: 'PDB', db_value: s.pdb_id });
        if (error && error.code !== '23505') { failed++; }
        else {
          pdbInserted++;
          existingPdb.add(pdbKey);
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
          const { error } = await supabase
            .from('kbsi_database_id')
            .insert({ protein_id: proteinId, db_name: 'NCBI Gene', db_value: ext.ncbiGeneId });
          if (error && error.code !== '23505') { failed++; }
          else {
            ncbiInserted++;
            existingNcbi.add(ncbiKey);
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
}

main().catch(console.error);
