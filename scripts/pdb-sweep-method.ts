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

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

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

  // Protein upsert
  const { rows: existingRows } = await client.query(
    `SELECT id FROM kbsi_protein WHERE full_name = $1 LIMIT 1`,
    [proteinName]
  );

  let proteinId: number;
  if (existingRows.length > 0) {
    proteinId = existingRows[0].id;
  } else {
    const { rows: newRows } = await client.query(
      `INSERT INTO kbsi_protein (full_name, organism) VALUES ($1, $2) RETURNING id`,
      [proteinName, pdb.organism]
    );
    proteinId = newRows[0].id;
  }

  // Construct
  const { rows: cRows } = await client.query(
    `INSERT INTO kbsi_construct (protein_id, name, construct_type, expression_system, seq_final)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [proteinId, `${pdb.pdbId}-chain`, 'full-length', pdb.expression?.host || null, pdb.sequence?.slice(0, 5000) || null]
  );
  const constructId = cRows[0].id;

  // Expression
  if (pdb.expression?.host) {
    await client.query(
      `INSERT INTO kbsi_expression (construct_id, host, strain, source_type, source_db, source_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [constructId, pdb.expression.host, pdb.expression.strain, 'database', 'PDB', pdb.pdbId]
    );
  }

  // Crystallization
  if (pdb.crystallization) {
    await client.query(
      `INSERT INTO kbsi_crystallization (construct_id, ph, temperature, condition_detail, outcome, source_type, source_db, source_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [constructId, pdb.crystallization.ph, pdb.crystallization.temperature,
       pdb.crystallization.details?.slice(0, 500) || null,
       pdb.crystallization.ph != null ? 'diffraction_quality' : null,
       'database', 'PDB', pdb.pdbId, `PDB ${pdb.pdbId}`]
    );
  }

  // Structure
  const normalizedMethod = pdb.method.includes('RAY') ? 'X-ray'
    : pdb.method.includes('NMR') ? 'NMR'
    : pdb.method.includes('ELECTRON') ? 'Cryo-EM' : pdb.method;

  await client.query(
    `INSERT INTO kbsi_structure (construct_id, method, resolution, pdb_id, source_type, source_db, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [constructId, normalizedMethod, pdb.resolution, pdb.pdbId, 'database', 'PDB', pdb.pdbId]
  );

  // UniProt
  if (pdb.uniprotId) {
    await client.query(
      `INSERT INTO kbsi_database_id (protein_id, db_name, db_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [proteinId, 'UniProt', pdb.uniprotId]
    ).catch(() => {});
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

  await client.connect();
  try {
    console.log(`PDB Sweep: ${method} | pH ${requirePH ? '필수' : '불필요'} | max ${maxTotal}`);

    // 기존 PDB ID (전량 조회)
    console.log('기존 PDB ID 조회 중...');
    const { rows: existingData } = await client.query(
      `SELECT pdb_id FROM kbsi_structure WHERE pdb_id IS NOT NULL`
    );
    const existingIds = new Set<string>(existingData.map((s: any) => s.pdb_id?.toUpperCase()));
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
  } finally {
    await client.end();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
main().catch(console.error);
