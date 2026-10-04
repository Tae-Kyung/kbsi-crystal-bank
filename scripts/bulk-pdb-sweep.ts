/**
 * PDB 전체 Sweep — 키워드 없이 X-ray + pH 있는 구조를 해상도 순으로 전량 수집
 *
 * npx tsx scripts/bulk-pdb-sweep.ts [옵션]
 *   --batch 500       한 번에 검색할 PDB ID 수 (기본: 500)
 *   --max 50000       최대 수집 수 (기본: 50000)
 *   --offset 0        검색 시작 위치 (중단 후 재개용)
 *   --resolution 4.0  해상도 필터 (기본: 제한 없음)
 *   --dry-run         미리보기
 *   --concurrency 5   동시 PDB fetch 수 (기본: 5)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PDB_API = 'https://data.rcsb.org/rest/v1/core';
const SEARCH_API = 'https://search.rcsb.org/rcsbsearch/v2/query';

// ─── PDB ID 목록 검색 (pH 있는 X-ray, 해상도 순) ───
async function searchPDBIds(start: number, rows: number, maxResolution?: number): Promise<{ ids: string[]; total: number }> {
  const nodes: any[] = [
    {
      type: 'terminal',
      service: 'text',
      parameters: { attribute: 'exptl.method', operator: 'exact_match', value: 'X-RAY DIFFRACTION' },
    },
    {
      type: 'terminal',
      service: 'text',
      parameters: { attribute: 'exptl_crystal_grow.pH', operator: 'exists' },
    },
  ];

  if (maxResolution) {
    nodes.push({
      type: 'terminal',
      service: 'text',
      parameters: { attribute: 'rcsb_entry_info.resolution_combined', operator: 'less_or_equal', value: maxResolution },
    });
  }

  const body = {
    query: { type: 'group', logical_operator: 'and', nodes },
    return_type: 'entry',
    request_options: {
      paginate: { start, rows },
      results_content_type: ['experimental'],
      sort: [{ sort_by: 'rcsb_entry_info.resolution_combined', direction: 'asc' }],
    },
  };

  const res = await fetch(SEARCH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ids: [], total: 0 };
  const data = await res.json();
  return {
    ids: (data.result_set || []).map((r: any) => r.identifier),
    total: data.total_count || 0,
  };
}

// ─── PDB fetch (간소화) ───
async function fetchPDB(pdbId: string) {
  const id = pdbId.toLowerCase();
  try {
    const [entryRes, entityRes] = await Promise.all([
      fetch(`${PDB_API}/entry/${id}`),
      fetch(`${PDB_API}/polymer_entity/${id}/1`),
    ]);
    if (!entryRes.ok) return null;
    const entry = await entryRes.json();
    const entity = entityRes.ok ? await entityRes.json() : null;

    const method = entry.exptl?.[0]?.method || 'Unknown';
    const crystalGrow = entry.exptl_crystal_grow?.[0];
    const srcDetails = entity?.rcsb_entity_source_organism?.[0];

    return {
      pdbId: pdbId.toUpperCase(),
      title: entry.struct?.title || '',
      method,
      resolution: entry.rcsb_entry_info?.resolution_combined?.[0] || null,
      organism: srcDetails?.scientific_name || null,
      crystallization: crystalGrow ? {
        ph: crystalGrow.pH != null ? parseFloat(crystalGrow.pH) : null,
        temperature: crystalGrow.temp != null ? Math.round((parseFloat(crystalGrow.temp) - 273.15) * 10) / 10 : null,
        details: crystalGrow.pdbx_details || null,
      } : null,
      expression: srcDetails?.expression_host_scientific_name ? {
        host: srcDetails.expression_host_scientific_name || null,
        strain: srcDetails.expression_host_strain || null,
      } : null,
      entityName: entity?.rcsb_polymer_entity?.pdbx_description || '',
      sequence: entity?.entity_poly?.pdbx_seq_one_letter_code_can || '',
      uniprotId: entity?.rcsb_polymer_entity_container_identifiers?.uniprot_ids?.[0] || null,
    };
  } catch {
    return null;
  }
}

// ─── DB import ───
async function importEntry(pdb: NonNullable<Awaited<ReturnType<typeof fetchPDB>>>) {
  const proteinName = pdb.entityName || pdb.title;
  if (!proteinName) return null;

  // Protein upsert
  const { data: existing } = await supabase
    .from('kbsi_protein').select('id').eq('full_name', proteinName).maybeSingle();

  let proteinId: number;
  if (existing) {
    proteinId = existing.id;
  } else {
    const { data: newP, error } = await supabase
      .from('kbsi_protein').insert({ full_name: proteinName, organism: pdb.organism }).select('id').single();
    if (error) throw new Error(`Protein: ${error.message}`);
    proteinId = newP.id;
  }

  // Construct
  const { data: newC, error: cErr } = await supabase
    .from('kbsi_construct')
    .insert({
      protein_id: proteinId, name: `${pdb.pdbId}-chain`,
      construct_type: 'full-length', expression_system: pdb.expression?.host || null,
      seq_final: pdb.sequence?.slice(0, 5000) || null,
    })
    .select('id').single();
  if (cErr) throw new Error(`Construct: ${cErr.message}`);
  const constructId = newC.id;

  // Expression
  if (pdb.expression?.host) {
    await supabase.from('kbsi_expression').insert({
      construct_id: constructId, host: pdb.expression.host,
      strain: pdb.expression.strain, source_type: 'database',
    });
  }

  // Crystallization
  if (pdb.crystallization) {
    await supabase.from('kbsi_crystallization').insert({
      construct_id: constructId,
      ph: pdb.crystallization.ph, temperature: pdb.crystallization.temperature,
      condition_detail: pdb.crystallization.details?.slice(0, 500) || null,
      outcome: pdb.crystallization.ph != null ? 'diffraction_quality' : null,
      source_type: 'database', notes: `PDB ${pdb.pdbId}`,
    });
  }

  // Structure
  const normalizedMethod = pdb.method.includes('RAY') ? 'X-ray'
    : pdb.method.includes('NMR') ? 'NMR'
    : pdb.method.includes('ELECTRON') ? 'Cryo-EM' : pdb.method;

  await supabase.from('kbsi_structure').insert({
    construct_id: constructId, method: normalizedMethod,
    resolution: pdb.resolution, pdb_id: pdb.pdbId, source_type: 'database',
  });

  // UniProt ID
  if (pdb.uniprotId) {
    await supabase.from('kbsi_database_id').insert({
      protein_id: proteinId, db_name: 'UniProt', db_id: pdb.uniprotId,
    }).then(() => {});
  }

  return { proteinId, constructId };
}

// ─── 병렬 처리 헬퍼 ───
async function processInParallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  const batchSize = parseInt(getArg('batch', '500'));
  const maxTotal = parseInt(getArg('max', '50000'));
  const startOffset = parseInt(getArg('offset', '0'));
  const resolution = getArg('resolution', '') ? parseFloat(getArg('resolution', '0')) : undefined;
  const concurrency = parseInt(getArg('concurrency', '5'));
  const dryRun = args.includes('--dry-run');

  // 기존 PDB ID 조회
  console.log('기존 PDB ID 조회 중...');
  const { data: existingStructures } = await supabase
    .from('kbsi_structure').select('pdb_id').not('pdb_id', 'is', null);
  const existingPdbIds = new Set(
    (existingStructures || []).map((s: any) => s.pdb_id?.toUpperCase())
  );
  console.log(`기존 DB: ${existingPdbIds.size}개 PDB 구조`);

  // 전체 검색 건수 확인
  const { total } = await searchPDBIds(0, 0, resolution);
  const targetTotal = Math.min(total, maxTotal);
  console.log(`PDB 검색 대상: ${total.toLocaleString()}건 (수집 목표: ${targetTotal.toLocaleString()}건)${resolution ? ` [≤${resolution}A]` : ''}\n`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  for (let offset = startOffset; offset < startOffset + targetTotal; offset += batchSize) {
    if (totalImported >= maxTotal) break;

    const { ids } = await searchPDBIds(offset, batchSize, resolution);
    if (ids.length === 0) break;

    const newIds = ids.filter(id => !existingPdbIds.has(id.toUpperCase()));
    const skipCount = ids.length - newIds.length;
    totalSkipped += skipCount;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = totalImported > 0 ? (totalImported / parseFloat(elapsed) * 60).toFixed(0) : '—';
    console.log(`[offset ${offset}] 검색: ${ids.length} | 신규: ${newIds.length} | skip: ${skipCount} | 누적: ${totalImported} | ${elapsed}s (${rate}/min)`);

    if (newIds.length === 0) continue;

    // 병렬 fetch + import
    const results = await processInParallel(newIds, async (pdbId) => {
      try {
        const entry = await fetchPDB(pdbId);
        if (!entry) return { pdbId, status: 'fetch_fail' as const };

        if (dryRun) {
          return { pdbId, status: 'ok' as const, resolution: entry.resolution, ph: entry.crystallization?.ph };
        }

        await importEntry(entry);
        existingPdbIds.add(pdbId.toUpperCase());
        return { pdbId, status: 'ok' as const };
      } catch (err: any) {
        return { pdbId, status: 'error' as const, message: err.message };
      }
    }, concurrency);

    const ok = results.filter(r => r.status === 'ok').length;
    const fail = results.filter(r => r.status !== 'ok').length;
    totalImported += ok;
    totalFailed += fail;

    // Rate limiting
    await sleep(100);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
  console.log(`Import: ${totalImported.toLocaleString()}건`);
  console.log(`Skip:   ${totalSkipped.toLocaleString()}건 (이미 존재)`);
  console.log(`실패:   ${totalFailed.toLocaleString()}건`);
  console.log(`소요:   ${elapsed}s (${(totalImported / (parseFloat(elapsed) || 1) * 60).toFixed(0)}건/분)`);
  console.log('═'.repeat(60));
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
