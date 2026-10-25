/**
 * PDB 대규모 수집 스크립트
 * RCSB Search API를 사용하여 카테고리별 X-ray 결정 구조를 자동 수집
 *
 * npx tsx scripts/bulk-pdb-harvest.ts [옵션]
 *   --category kinase      특정 카테고리만 수집
 *   --limit 100            카테고리당 최대 수집 수
 *   --total 500            전체 최대 수집 수
 *   --dry-run              실제 DB에 넣지 않고 미리보기만
 *   --skip-existing        이미 DB에 있는 PDB ID는 건너뛰기 (기본: true)
 *   --resolution 3.0       해상도 필터 (기본: 3.5 A 이하)
 *   --min-ph               pH 정보 있는 것만 수집
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

// ─── 카테고리 정의 ───
const CATEGORIES: Record<string, { keyword: string; description: string }> = {
  kinase: { keyword: 'kinase', description: '인산화 효소 (EGFR, CDK, ABL 등)' },
  protease: { keyword: 'protease', description: '단백질 분해 효소 (HIV protease, Caspase 등)' },
  polymerase: { keyword: 'polymerase', description: 'DNA/RNA 중합효소' },
  transferase: { keyword: 'transferase', description: '전이효소' },
  oxidoreductase: { keyword: 'oxidoreductase', description: '산화환원효소' },
  hydrolase: { keyword: 'hydrolase', description: '가수분해효소' },
  lyase: { keyword: 'lyase', description: '분해효소' },
  isomerase: { keyword: 'isomerase', description: '이성화효소' },
  ligase: { keyword: 'ligase', description: '합성효소' },
  receptor: { keyword: 'receptor', description: '수용체 (GPCR, 핵 수용체 등)' },
  antibody: { keyword: 'antibody OR immunoglobulin', description: '항체/면역글로불린' },
  chaperone: { keyword: 'chaperone OR heat shock', description: '샤페론/열충격 단백질' },
  nuclease: { keyword: 'nuclease OR restriction enzyme', description: '핵산 분해효소' },
  dehydrogenase: { keyword: 'dehydrogenase', description: '탈수소효소' },
  phosphatase: { keyword: 'phosphatase', description: '탈인산화효소' },
  synthase: { keyword: 'synthase OR synthetase', description: '합성효소' },
  transporter: { keyword: 'transporter OR channel', description: '수송 단백질/이온 채널' },
  transcription: { keyword: 'transcription factor', description: '전사 인자' },
  cytochrome: { keyword: 'cytochrome', description: '시토크롬' },
  ribosome: { keyword: 'ribosomal protein', description: '리보솜 단백질' },
  viral: { keyword: 'viral OR virus', description: '바이러스 유래 단백질' },
  membrane: { keyword: 'membrane protein', description: '막 단백질' },
};

// ─── RCSB 검색 ───
async function searchPDBAdvanced(
  keyword: string,
  maxResolution: number,
  rows: number,
  requirePH: boolean,
): Promise<string[]> {
  const queryNodes: any[] = [
    {
      type: 'terminal',
      service: 'full_text',
      parameters: { value: keyword },
    },
    {
      type: 'terminal',
      service: 'text',
      parameters: {
        attribute: 'exptl.method',
        operator: 'exact_match',
        value: 'X-RAY DIFFRACTION',
      },
    },
    {
      type: 'terminal',
      service: 'text',
      parameters: {
        attribute: 'rcsb_entry_info.resolution_combined',
        operator: 'less_or_equal',
        value: maxResolution,
      },
    },
  ];

  if (requirePH) {
    queryNodes.push({
      type: 'terminal',
      service: 'text',
      parameters: {
        attribute: 'exptl_crystal_grow.pH',
        operator: 'exists',
      },
    });
  }

  const body = {
    query: {
      type: 'group',
      logical_operator: 'and',
      nodes: queryNodes,
    },
    return_type: 'entry',
    request_options: {
      paginate: { start: 0, rows },
      results_content_type: ['experimental'],
      sort: [{ sort_by: 'rcsb_entry_info.resolution_combined', direction: 'asc' }],
    },
  };

  try {
    const res = await fetch(SEARCH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result_set || []).map((r: any) => r.identifier);
  } catch {
    return [];
  }
}

// ─── PDB 엔트리 상세 조회 (간소화) ───
async function fetchPDBForImport(pdbId: string) {
  const id = pdbId.toLowerCase();
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
    spaceGroup: entry.symmetry?.space_group_name_H_M || null,
    crystallization: crystalGrow ? {
      method: crystalGrow.method || null,
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
}

// ─── DB에 import ───
async function importEntry(pdb: NonNullable<Awaited<ReturnType<typeof fetchPDBForImport>>>) {
  const proteinName = pdb.entityName || pdb.title;

  // 1. Protein upsert
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

  // 2. Construct
  const { rows: cRows } = await client.query(
    `INSERT INTO kbsi_construct (protein_id, name, construct_type, expression_system, seq_final)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [proteinId, `${pdb.pdbId}-chain`, 'full-length', pdb.expression?.host || null, pdb.sequence || null]
  );
  const constructId = cRows[0].id;

  // 3. Expression (있는 경우)
  if (pdb.expression?.host) {
    await client.query(
      `INSERT INTO kbsi_expression (construct_id, host, strain, source_type, source_db, source_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [constructId, pdb.expression.host, pdb.expression.strain, 'database', 'PDB', pdb.pdbId]
    );
  }

  // 4. Crystallization (있는 경우)
  if (pdb.crystallization) {
    const c = pdb.crystallization;
    const outcome = c.ph != null ? 'diffraction_quality' : null;
    await client.query(
      `INSERT INTO kbsi_crystallization (construct_id, ph, temperature, condition_detail, outcome, source_type, source_db, source_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [constructId, c.ph, c.temperature, c.details?.slice(0, 500) || null, outcome, 'database', 'PDB', pdb.pdbId, `PDB ${pdb.pdbId}`]
    );
  }

  // 5. Structure
  const normalizedMethod = pdb.method.includes('RAY') ? 'X-ray'
    : pdb.method.includes('NMR') ? 'NMR'
    : pdb.method.includes('ELECTRON') ? 'Cryo-EM'
    : pdb.method;

  await client.query(
    `INSERT INTO kbsi_structure (construct_id, method, resolution, pdb_id, source_type, source_db, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [constructId, normalizedMethod, pdb.resolution, pdb.pdbId, 'database', 'PDB', pdb.pdbId]
  );

  // 6. Database ID (UniProt)
  if (pdb.uniprotId) {
    await client.query(
      `INSERT INTO kbsi_database_id (protein_id, db_name, db_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [proteinId, 'UniProt', pdb.uniprotId]
    ).catch(() => {});
  }

  return { proteinId, constructId };
}

// ─── 메인 실행 ───
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  const categoryFilter = getArg('category', '');
  const limitPerCategory = parseInt(getArg('limit', '50'));
  const totalLimit = parseInt(getArg('total', '1000'));
  const maxResolution = parseFloat(getArg('resolution', '3.5'));
  const dryRun = args.includes('--dry-run');
  const requirePH = args.includes('--min-ph');

  const categories = categoryFilter
    ? { [categoryFilter]: CATEGORIES[categoryFilter] }
    : CATEGORIES;

  if (categoryFilter && !CATEGORIES[categoryFilter]) {
    console.error(`알 수 없는 카테고리: ${categoryFilter}`);
    console.error(`사용 가능: ${Object.keys(CATEGORIES).join(', ')}`);
    process.exit(1);
  }

  await client.connect();
  try {
    // 이미 DB에 있는 PDB ID 조회
    console.log('기존 PDB ID 조회 중...');
    const { rows: existingStructures } = await client.query(
      `SELECT pdb_id FROM kbsi_structure WHERE pdb_id IS NOT NULL`
    );
    const existingPdbIds = new Set(
      existingStructures.map((s: any) => s.pdb_id?.toUpperCase())
    );
    console.log(`기존 DB: ${existingPdbIds.size}개 PDB 구조\n`);

    let totalImported = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const categoryStats: Record<string, { found: number; imported: number; skipped: number }> = {};

    for (const [catKey, cat] of Object.entries(categories)) {
      if (totalImported >= totalLimit) break;

      console.log(`\n${'═'.repeat(60)}`);
      console.log(`[${catKey}] ${cat.description}`);
      console.log(`  검색: "${cat.keyword}" (해상도 ≤ ${maxResolution}A, X-ray)${requirePH ? ' + pH 필수' : ''}`);

      const remaining = totalLimit - totalImported;
      const batchSize = Math.min(limitPerCategory, remaining);

      const pdbIds = await searchPDBAdvanced(cat.keyword, maxResolution, batchSize, requirePH);
      console.log(`  검색 결과: ${pdbIds.length}건`);

      const newIds = pdbIds.filter(id => !existingPdbIds.has(id.toUpperCase()));
      console.log(`  신규 (미등록): ${newIds.length}건\n`);

      categoryStats[catKey] = { found: pdbIds.length, imported: 0, skipped: pdbIds.length - newIds.length };

      for (let i = 0; i < newIds.length; i++) {
        if (totalImported >= totalLimit) break;
        const pdbId = newIds[i];

        try {
          const entry = await fetchPDBForImport(pdbId);
          if (!entry) {
            console.log(`  [${i + 1}/${newIds.length}] ${pdbId} — fetch 실패`);
            totalFailed++;
            continue;
          }

          const hascryst = entry.crystallization?.ph != null || entry.crystallization?.details;
          const tag = hascryst ? '●' : '○';

          if (dryRun) {
            console.log(`  ${tag} ${pdbId} | ${entry.resolution?.toFixed(1) || '?'}A | pH ${entry.crystallization?.ph || '?'} | ${entry.crystallization?.temperature || '?'}°C | ${entry.entityName?.slice(0, 50)}`);
            totalImported++;
            categoryStats[catKey].imported++;
            continue;
          }

          const result = await importEntry(entry);
          existingPdbIds.add(pdbId.toUpperCase());

          console.log(`  ${tag} ${pdbId} | ${entry.resolution?.toFixed(1) || '?'}A | pH ${entry.crystallization?.ph || '?'} | ${entry.crystallization?.temperature || '?'}°C | P:${result.proteinId} C:${result.constructId}`);
          totalImported++;
          categoryStats[catKey].imported++;
        } catch (err: any) {
          console.log(`  FAIL ${pdbId}: ${err.message}`);
          totalFailed++;
        }

        // Rate limiting: PDB API 부하 방지
        await sleep(200);
      }

      totalSkipped += categoryStats[catKey].skipped;
    }

    // ─── 요약 ───
    console.log(`\n${'═'.repeat(60)}`);
    console.log('수집 요약');
    console.log(`${'═'.repeat(60)}`);
    console.log(`총 Import: ${totalImported}건 ${dryRun ? '(dry-run)' : ''}`);
    console.log(`건너뛰기 (이미 존재): ${totalSkipped}건`);
    console.log(`실패: ${totalFailed}건`);
    console.log(`\n카테고리별:`);
    for (const [cat, stats] of Object.entries(categoryStats)) {
      console.log(`  ${cat.padEnd(20)} 검색: ${String(stats.found).padStart(4)}  import: ${String(stats.imported).padStart(4)}  skip: ${String(stats.skipped).padStart(4)}`);
    }
  } finally {
    await client.end();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
