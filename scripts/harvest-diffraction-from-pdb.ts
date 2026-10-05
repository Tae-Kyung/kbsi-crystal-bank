/**
 * PDB에서 회절(diffraction) 데이터 추출 → kbsi_diffraction 테이블 적재
 *
 * kbsi_structure에 등록된 PDB 엔트리 중 아직 diffraction 레코드가 없는 것을 대상으로
 * RCSB REST API에서 해상도, 공간군, 단위 셀, 빔라인, 위상 결정법 등을 수집.
 *
 * npx tsx scripts/harvest-diffraction-from-pdb.ts [옵션]
 *   --limit 1000      처리 건수 (기본: 전체)
 *   --offset 0        시작 오프셋 (기본: 0)
 *   --dry-run         미리보기 (DB 삽입 안 함)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PDB_API = 'https://data.rcsb.org/rest/v1/core/entry';
const BATCH_SIZE = 50;
const API_DELAY_MS = 200;

interface StructureRow {
  id: number;
  construct_id: number;
  pdb_id: string;
}

interface DiffractionRecord {
  construct_id: number;
  source_type: string;
  source_db: string;
  source_id: string;
  resolution: number | null;
  space_group: string | null;
  unit_cell: string | null;
  beamline: string | null;
  phasing: string | null;
  data_quality: string | null;
  is_validated: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatUnitCell(cell: any): string | null {
  if (!cell) return null;
  const a = cell.length_a;
  const b = cell.length_b;
  const c = cell.length_c;
  const alpha = cell.angle_alpha;
  const beta = cell.angle_beta;
  const gamma = cell.angle_gamma;
  if (a == null || b == null || c == null) return null;
  const parts = [
    `${Number(a).toFixed(2)}`,
    `${Number(b).toFixed(2)}`,
    `${Number(c).toFixed(2)}`,
  ].join('\u00d7'); // × 문자
  const angles = [alpha, beta, gamma]
    .filter((v) => v != null)
    .map((v) => Number(v).toFixed(1))
    .join(' ');
  return angles ? `${parts} ${angles}` : parts;
}

function extractBeamline(entry: any): string | null {
  const diffrn = entry.diffrn_source;
  if (!diffrn || !Array.isArray(diffrn) || diffrn.length === 0) return null;
  const src = diffrn[0];
  const site = src.pdbx_synchrotron_site || '';
  const bl = src.pdbx_synchrotron_beamline || '';
  const combined = [site, bl].filter(Boolean).join(' ').trim();
  return combined || null;
}

async function fetchPDBEntry(pdbId: string): Promise<DiffractionRecord | null> {
  try {
    const res = await fetch(`${PDB_API}/${pdbId}`, {
      headers: { 'User-Agent': 'KBSI-CrystalBank/1.0 (https://kbsi-crystal-bank.vercel.app)' },
    });
    if (!res.ok) return null;
    const entry = await res.json();

    // X-ray만 처리
    const method = entry.rcsb_entry_info?.experimental_method;
    if (!method || !method.toUpperCase().includes('X-RAY')) return null;

    const resolution = entry.rcsb_entry_info?.resolution_combined?.[0] ?? null;
    const spaceGroup = entry.cell?.space_group_name_H_M ?? null;
    const unitCell = formatUnitCell(entry.cell);
    const beamline = extractBeamline(entry);
    const phasing = entry.refine?.[0]?.pdbx_method_to_determine_struct ?? null;

    // data_quality 메모
    let dataQuality: string | null = null;
    const vrptRes = entry.pdbx_vrpt_summary?.PDB_resolution;
    if (vrptRes != null) {
      dataQuality = `VRPT resolution: ${vrptRes} A`;
    }

    return {
      construct_id: 0, // 나중에 설정
      source_type: 'database',
      source_db: 'PDB',
      source_id: pdbId,
      resolution,
      space_group: spaceGroup,
      unit_cell: unitCell,
      beamline,
      phasing,
      data_quality: dataQuality,
      is_validated: false,
    };
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const offsetIdx = args.indexOf('--offset');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const offsetArg = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) : 0;
  const dryRun = args.includes('--dry-run');

  console.log('=== PDB Diffraction 데이터 수집 ===');
  console.log(`  limit: ${limit === Infinity ? '전체' : limit}, offset: ${offsetArg}, dry-run: ${dryRun}`);

  // 1) kbsi_structure에서 pdb_id가 있는 엔트리 조회
  console.log('\n[1] kbsi_structure에서 PDB 엔트리 조회...');
  let structures: StructureRow[] = [];
  let dbOffset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('kbsi_structure')
      .select('id, construct_id, pdb_id')
      .not('pdb_id', 'is', null)
      .order('id', { ascending: true })
      .range(dbOffset, dbOffset + 999);
    if (error) {
      console.error('  구조 조회 에러:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    structures = structures.concat(data as StructureRow[]);
    if (data.length < 1000) break;
    dbOffset += 1000;
  }
  console.log(`  전체 PDB 구조: ${structures.length}개`);

  // 2) 이미 kbsi_diffraction에 있는 construct_id + source_id 조합 조회
  console.log('\n[2] 기존 diffraction 레코드 확인...');
  const existingSet = new Set<string>();
  let diffOffset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('kbsi_diffraction')
      .select('construct_id, source_id')
      .eq('source_db', 'PDB')
      .range(diffOffset, diffOffset + 999);
    if (error) {
      console.error('  diffraction 조회 에러:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      existingSet.add(`${row.construct_id}:${row.source_id}`);
    }
    if (data.length < 1000) break;
    diffOffset += 1000;
  }
  console.log(`  기존 diffraction: ${existingSet.size}개`);

  // 3) 필터: 이미 있는 것 제외
  const targets = structures.filter(
    (s) => !existingSet.has(`${s.construct_id}:${s.pdb_id}`)
  );
  console.log(`  신규 대상: ${targets.length}개`);

  // offset/limit 적용
  const sliced = targets.slice(offsetArg, offsetArg + (limit === Infinity ? targets.length : limit));
  console.log(`  처리 예정: ${sliced.length}개 (offset ${offsetArg})`);

  // 4) 배치 처리
  let inserted = 0;
  let skippedNotXray = 0;
  let fetchFailed = 0;
  let insertFailed = 0;

  for (let i = 0; i < sliced.length; i += BATCH_SIZE) {
    const batch = sliced.slice(i, i + BATCH_SIZE);
    const records: DiffractionRecord[] = [];

    for (const structure of batch) {
      const record = await fetchPDBEntry(structure.pdb_id);
      if (!record) {
        // null = fetch 실패 or non-X-ray
        // 구분을 위해 빠른 재시도 없이 카운트만
        fetchFailed++;
        await sleep(API_DELAY_MS);
        continue;
      }
      record.construct_id = structure.construct_id;
      records.push(record);
      await sleep(API_DELAY_MS);
    }

    if (records.length > 0 && !dryRun) {
      const { error } = await supabase.from('kbsi_diffraction').insert(records);
      if (error) {
        console.error(`  배치 삽입 에러 (offset ${i}):`, error.message);
        insertFailed += records.length;
      } else {
        inserted += records.length;
      }
    } else if (dryRun) {
      inserted += records.length;
      if (records.length > 0) {
        console.log(`  [DRY-RUN] 배치 ${Math.floor(i / BATCH_SIZE) + 1}: ${records.length}건 (예: ${records[0].source_id} res=${records[0].resolution} sg=${records[0].space_group})`);
      }
    }

    const processed = Math.min(i + BATCH_SIZE, sliced.length);
    if (processed % 100 === 0 || processed === sliced.length) {
      console.log(`  진행: ${processed}/${sliced.length} (삽입: ${inserted}, 실패: ${fetchFailed})`);
    }
  }

  // 5) 요약
  console.log('\n=== 완료 ===');
  console.log(`  전체 PDB 구조:   ${structures.length}`);
  console.log(`  기존 diffraction: ${existingSet.size}`);
  console.log(`  처리 대상:        ${sliced.length}`);
  console.log(`  삽입${dryRun ? '(예정)' : ''}:        ${inserted}`);
  console.log(`  API 실패/비X-ray: ${fetchFailed}`);
  if (insertFailed > 0) console.log(`  DB 삽입 실패:     ${insertFailed}`);
  if (dryRun) console.log('  (DRY-RUN 모드 — 실제 DB 변경 없음)');
}

main().catch((e) => {
  console.error('치명적 에러:', e);
  process.exit(1);
});
