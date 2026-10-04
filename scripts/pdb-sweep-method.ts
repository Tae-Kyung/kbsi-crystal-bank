/**
 * PDB 전체 Sweep — 실험 방법별 (Cryo-EM, NMR, X-ray pH 없음)
 *
 * npx tsx scripts/pdb-sweep-method.ts [옵션]
 *   --method "ELECTRON MICROSCOPY"   실험 방법
 *   --method "SOLUTION NMR"
 *   --method "X-RAY DIFFRACTION"
 *   --no-ph                          pH 필터 제거 (X-ray pH 없는 것 수집)
 *   --max 50000
 *   --offset 0
 *   --batch 500
 *   --concurrency 8
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

async function searchPDBIds(method: string, requirePH: boolean, start: number, rows: number): Promise<{ ids: string[]; total: number }> {
  const nodes: any[] = [
    { type: 'terminal', service: 'text', parameters: { attribute: 'exptl.method', operator: 'exact_match', value: method } },
  ];
  if (requirePH) {
    nodes.push({ type: 'terminal', service: 'text', parameters: { attribute: 'exptl_crystal_grow.pH', operator: 'exists' } });
  }

  const body = {
    query: nodes.length > 1 ? { type: 'group', logical_operator: 'and', nodes } : nodes[0],
    return_type: 'entry',
    request_options: {
      paginate: { start, rows },
      results_content_type: ['experimental'],
      sort: [{ sort_by: 'rcsb_entry_info.resolution_combined', direction: 'asc' }],
    },
  };

  try {
    const res = await fetch(SEARCH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return { ids: [], total: 0 };
    const data = await res.json();
    return { ids: (data.result_set || []).map((r: any) => r.identifier), total: data.total_count || 0 };
  } catch { return { ids: [], total: 0 }; }
}

async function fetchPDB(pdbId: string) {
  const id = pdbId.toLowerCase();
  try {
    const [entryRes, entityRes] = await Promise.all([
      fetch(`${PDB_API}/entry/${id}`), fetch(`${PDB_API}/polymer_entity/${id}/1`),
    ]);
    if (!entryRes.ok) return null;
    const entry = await entryRes.json();
    const entity = entityRes.ok ? await entityRes.json() : null;
    const m = entry.exptl?.[0]?.method || 'Unknown';
    const crystalGrow = entry.exptl_crystal_grow?.[0];
    const srcDetails = entity?.rcsb_entity_source_organism?.[0];

    return {
      pdbId: pdbId.toUpperCase(), title: entry.struct?.title || '', method: m,
      resolution: entry.rcsb_entry_info?.resolution_combined?.[0] || null,
      organism: srcDetails?.scientific_name || null,
      crystallization: crystalGrow ? {
        ph: crystalGrow.pH != null ? parseFloat(crystalGrow.pH) : null,
        temperature: crystalGrow.temp != null ? Math.round((parseFloat(crystalGrow.temp) - 273.15) * 10) / 10 : null,
        details: crystalGrow.pdbx_details || null,
      } : null,
      expression: srcDetails?.expression_host_scientific_name ? {
        host: srcDetails.expression_host_scientific_name, strain: srcDetails.expression_host_strain || null,
      } : null,
      entityName: entity?.rcsb_polymer_entity?.pdbx_description || '',
      sequence: entity?.entity_poly?.pdbx_seq_one_letter_code_can || '',
      uniprotId: entity?.rcsb_polymer_entity_container_identifiers?.uniprot_ids?.[0] || null,
    };
  } catch { return null; }
}

async function importEntry(pdb: NonNullable<Awaited<ReturnType<typeof fetchPDB>>>) {
  const proteinName = pdb.entityName || pdb.title;
  if (!proteinName) return null;

  const { data: existing } = await supabase.from('kbsi_protein').select('id').eq('full_name', proteinName).maybeSingle();
  let proteinId: number;
  if (existing) { proteinId = existing.id; }
  else {
    const { data: newP, error } = await supabase.from('kbsi_protein').insert({ full_name: proteinName, organism: pdb.organism }).select('id').single();
    if (error) throw new Error(`Protein: ${error.message}`);
    proteinId = newP.id;
  }

  const { data: newC, error: cErr } = await supabase.from('kbsi_construct').insert({
    protein_id: proteinId, name: `${pdb.pdbId}-chain`, construct_type: 'full-length',
    expression_system: pdb.expression?.host || null, seq_final: pdb.sequence?.slice(0, 5000) || null,
  }).select('id').single();
  if (cErr) throw new Error(`Construct: ${cErr.message}`);
  const constructId = newC.id;

  if (pdb.expression?.host) {
    await supabase.from('kbsi_expression').insert({
      construct_id: constructId, host: pdb.expression.host, strain: pdb.expression.strain,
      source_type: 'database', source_db: 'PDB', source_id: pdb.pdbId,
    });
  }

  if (pdb.crystallization) {
    await supabase.from('kbsi_crystallization').insert({
      construct_id: constructId, ph: pdb.crystallization.ph, temperature: pdb.crystallization.temperature,
      condition_detail: pdb.crystallization.details?.slice(0, 500) || null,
      outcome: pdb.crystallization.ph != null ? 'diffraction_quality' : null,
      source_type: 'database', source_db: 'PDB', source_id: pdb.pdbId, notes: `PDB ${pdb.pdbId}`,
    });
  }

  const normalizedMethod = pdb.method.includes('RAY') ? 'X-ray'
    : pdb.method.includes('NMR') ? 'NMR'
    : pdb.method.includes('ELECTRON') ? 'Cryo-EM' : pdb.method;

  await supabase.from('kbsi_structure').insert({
    construct_id: constructId, method: normalizedMethod, resolution: pdb.resolution,
    pdb_id: pdb.pdbId, source_type: 'database', source_db: 'PDB', source_id: pdb.pdbId,
  });

  if (pdb.uniprotId) {
    await supabase.from('kbsi_database_id').insert({ protein_id: proteinId, db_name: 'UniProt', db_id: pdb.uniprotId }).catch(() => {});
  }
  return { proteinId, constructId };
}

async function processInParallel<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => { const idx = args.indexOf(`--${name}`); return idx >= 0 && args[idx + 1] ? args[idx + 1] : def; };

  const method = getArg('method', 'ELECTRON MICROSCOPY');
  const requirePH = !args.includes('--no-ph');
  const batchSize = parseInt(getArg('batch', '500'));
  const maxTotal = parseInt(getArg('max', '50000'));
  const startOffset = parseInt(getArg('offset', '0'));
  const concurrency = parseInt(getArg('concurrency', '8'));

  console.log(`PDB Sweep: ${method} | pH ${requirePH ? '필수' : '불필요'} | max ${maxTotal}`);

  // 기존 PDB ID (전량 조회)
  console.log('기존 PDB ID 조회 중...');
  let existingIds = new Set<string>();
  let off = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_structure').select('pdb_id').not('pdb_id', 'is', null).range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const s of data) existingIds.add((s as any).pdb_id?.toUpperCase());
    if (data.length < 1000) break;
    off += 1000;
  }
  console.log(`기존 DB: ${existingIds.size}개 PDB 구조`);

  const { total } = await searchPDBIds(method, requirePH, 0, 0);
  console.log(`검색 대상: ${total.toLocaleString()}건\n`);

  let totalImported = 0, totalSkipped = 0, totalFailed = 0;
  const startTime = Date.now();

  for (let offset = startOffset; offset < startOffset + maxTotal; offset += batchSize) {
    if (totalImported >= maxTotal) break;
    const { ids } = await searchPDBIds(method, requirePH, offset, batchSize);
    if (ids.length === 0) break;

    const newIds = ids.filter(id => !existingIds.has(id.toUpperCase()));
    totalSkipped += ids.length - newIds.length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = totalImported > 0 ? (totalImported / parseFloat(elapsed) * 60).toFixed(0) : '—';
    console.log(`[offset ${offset}] 검색: ${ids.length} | 신규: ${newIds.length} | skip: ${ids.length - newIds.length} | 누적: ${totalImported} | ${elapsed}s (${rate}/min)`);

    if (newIds.length === 0) continue;

    const results = await processInParallel(newIds, async (pdbId) => {
      try {
        const entry = await fetchPDB(pdbId);
        if (!entry) return 'fail';
        await importEntry(entry);
        existingIds.add(pdbId.toUpperCase());
        return 'ok';
      } catch { return 'fail'; }
    }, concurrency);

    totalImported += results.filter(r => r === 'ok').length;
    totalFailed += results.filter(r => r === 'fail').length;
    await sleep(100);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`완료: ${method}`);
  console.log(`Import: ${totalImported.toLocaleString()} | Skip: ${totalSkipped.toLocaleString()} | 실패: ${totalFailed.toLocaleString()}`);
  console.log(`소요: ${elapsed}s (${(totalImported / (parseFloat(elapsed) || 1) * 60).toFixed(0)}건/분)`);
  console.log('═'.repeat(60));
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
main().catch(console.error);
