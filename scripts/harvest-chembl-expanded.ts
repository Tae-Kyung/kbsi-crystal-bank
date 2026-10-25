/**
 * ChEMBL Expanded: DB의 모든 gene_name 보유 단백질에 대해 ChEMBL 바인딩 수집
 *
 * 기존 harvest-chembl.ts는 20개 하드코딩 타겟만 처리.
 * 이 스크립트는 kbsi_protein 테이블의 모든 gene_name을 대상으로
 * ChEMBL target 검색 → activity 수집 → ligand/binding 저장.
 *
 * npx tsx scripts/harvest-chembl-expanded.ts [옵션]
 *   --limit 100       최대 처리할 단백질 수 (기본: 전체)
 *   --offset 0        시작 오프셋 (기본: 0)
 *   --dry-run         미리보기 (DB 쓰기 없음)
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

const CHEMBL_API = 'https://www.ebi.ac.uk/chembl/api/data';
const DELAY_MS = 500; // ChEMBL rate limit 준수
const ACTIVITIES_PER_TARGET = 100;

// ── Stats ──────────────────────────────────────────────
const stats = {
  proteinsProcessed: 0,
  proteinsSkippedNoTarget: 0,
  proteinsSkippedExisting: 0,
  targetsFound: 0,
  newLigands: 0,
  newBindings: 0,
  errors: 0,
};

// ── Helpers ────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(name);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };
  return {
    limit: getArg('--limit', '0'), // 0 = no limit
    offset: parseInt(getArg('--offset', '0')),
    dryRun: args.includes('--dry-run'),
  };
}

// ── Fetch all unique gene_names from kbsi_protein ──
async function fetchAllGeneNames(): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT DISTINCT gene_name FROM kbsi_protein
     WHERE gene_name IS NOT NULL AND gene_name != ''
     ORDER BY gene_name`
  );
  return rows.map((r: any) => r.gene_name.trim());
}

// ── Check if a gene already has ChEMBL bindings ──
async function hasExistingChemblBindings(geneName: string): Promise<boolean> {
  const { rows: proteins } = await client.query(
    `SELECT id FROM kbsi_protein WHERE gene_name = $1 LIMIT 5`,
    [geneName]
  );
  if (proteins.length === 0) return false;

  for (const p of proteins) {
    const { rows: constructs } = await client.query(
      `SELECT id FROM kbsi_construct WHERE protein_id = $1 LIMIT 1`,
      [p.id]
    );
    if (constructs.length === 0) continue;

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int as cnt FROM kbsi_construct_ligand
       WHERE construct_id = $1 AND source_db = $2`,
      [constructs[0].id, 'ChEMBL']
    );
    if (countRows[0].cnt > 0) return true;
  }
  return false;
}

// ── Search ChEMBL for a target by gene name ──
interface ChEMBLTarget {
  target_chembl_id: string;
  pref_name: string;
  organism: string;
  target_type: string;
}

async function searchChemblTarget(geneName: string): Promise<ChEMBLTarget | null> {
  const url = `${CHEMBL_API}/target/search?q=${encodeURIComponent(geneName)}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const targets: any[] = data.targets || [];

    if (targets.length === 0) return null;

    // Filter to SINGLE PROTEIN only
    const singleProteins = targets.filter(
      (t: any) => t.target_type === 'SINGLE PROTEIN'
    );
    if (singleProteins.length === 0) return null;

    // Prefer Homo sapiens
    const human = singleProteins.find(
      (t: any) => t.organism === 'Homo sapiens'
    );
    const best = human || singleProteins[0];

    return {
      target_chembl_id: best.target_chembl_id,
      pref_name: best.pref_name,
      organism: best.organism,
      target_type: best.target_type,
    };
  } catch {
    return null;
  }
}

// ── Fetch activities for a target ──
interface ChEMBLActivity {
  activity_id: number;
  molecule_chembl_id: string;
  canonical_smiles: string;
  pchembl_value: number | null;
  standard_type: string;
  standard_value: number | null;
  standard_units: string | null;
  molecule_pref_name: string | null;
  target_chembl_id: string;
}

async function fetchActivities(targetChemblId: string): Promise<ChEMBLActivity[]> {
  const url = `${CHEMBL_API}/activity?target_chembl_id=${targetChemblId}&standard_type__in=IC50,Kd,Ki&pchembl_value__isnull=false&limit=${ACTIVITIES_PER_TARGET}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.activities || []).map((a: any) => ({
      activity_id: a.activity_id,
      molecule_chembl_id: a.molecule_chembl_id,
      canonical_smiles: a.canonical_smiles,
      pchembl_value: a.pchembl_value ? parseFloat(a.pchembl_value) : null,
      standard_type: a.standard_type,
      standard_value: a.standard_value ? parseFloat(a.standard_value) : null,
      standard_units: a.standard_units,
      molecule_pref_name: a.molecule_pref_name,
      target_chembl_id: a.target_chembl_id,
    }));
  } catch {
    return [];
  }
}

// ── Find construct_id for a gene_name ──
async function findConstructId(geneName: string): Promise<number | null> {
  const { rows: proteins } = await client.query(
    `SELECT id FROM kbsi_protein WHERE gene_name = $1 LIMIT 1`,
    [geneName]
  );
  if (proteins.length === 0) return null;

  const { rows: constructs } = await client.query(
    `SELECT id FROM kbsi_construct WHERE protein_id = $1 LIMIT 1`,
    [proteins[0].id]
  );
  return constructs.length > 0 ? constructs[0].id : null;
}

// ── Process one gene ──
async function processGene(
  geneName: string,
  dryRun: boolean
): Promise<{ ligands: number; bindings: number }> {
  let ligands = 0;
  let bindings = 0;

  // 1. Search ChEMBL for target
  const target = await searchChemblTarget(geneName);
  await sleep(DELAY_MS);

  if (!target) {
    stats.proteinsSkippedNoTarget++;
    return { ligands, bindings };
  }

  stats.targetsFound++;

  // 2. Find construct_id in DB
  const constructId = await findConstructId(geneName);
  if (!constructId) {
    return { ligands, bindings };
  }

  // 3. Fetch activities
  const activities = await fetchActivities(target.target_chembl_id);
  await sleep(DELAY_MS);

  if (activities.length === 0) return { ligands, bindings };

  // 4. Dedupe by SMILES
  const uniqueMolecules = new Map<string, ChEMBLActivity>();
  for (const a of activities) {
    if (a.canonical_smiles && !uniqueMolecules.has(a.canonical_smiles)) {
      uniqueMolecules.set(a.canonical_smiles, a);
    }
  }

  // 5. Upsert ligands and bindings
  for (const [smiles, activity] of uniqueMolecules) {
    const ligandName = activity.molecule_pref_name || activity.molecule_chembl_id;

    if (dryRun) {
      bindings++;
      continue;
    }

    try {
      // Ligand upsert by SMILES
      const { rows: existingRows } = await client.query(
        `SELECT id FROM kbsi_ligand WHERE smiles = $1 LIMIT 1`,
        [smiles]
      );

      let ligandId: number;
      if (existingRows.length > 0) {
        ligandId = existingRows[0].id;
      } else {
        const { rows: newRows } = await client.query(
          `INSERT INTO kbsi_ligand (name, smiles, source, source_db, source_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [ligandName, smiles, `ChEMBL ${activity.molecule_chembl_id}`, 'ChEMBL', activity.molecule_chembl_id]
        );

        if (newRows.length === 0) {
          stats.errors++;
          continue;
        }
        ligandId = newRows[0].id;
        ligands++;
      }

      // Construct-Ligand binding
      const notes = `${activity.standard_type}: ${activity.standard_value} ${activity.standard_units || ''} (pChEMBL: ${activity.pchembl_value}) [${activity.molecule_chembl_id}]`;
      const bindingKd = activity.standard_type === 'Kd' ? activity.standard_value : null;
      const bindingIc50 = activity.standard_type === 'IC50' ? activity.standard_value : null;

      const upsertQuery = bindingKd != null
        ? `INSERT INTO kbsi_construct_ligand (construct_id, ligand_id, source_db, source_id, notes, binding_kd)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (construct_id, ligand_id) DO UPDATE SET
             source_db = EXCLUDED.source_db, source_id = EXCLUDED.source_id,
             notes = EXCLUDED.notes, binding_kd = EXCLUDED.binding_kd`
        : bindingIc50 != null
        ? `INSERT INTO kbsi_construct_ligand (construct_id, ligand_id, source_db, source_id, notes, binding_ic50)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (construct_id, ligand_id) DO UPDATE SET
             source_db = EXCLUDED.source_db, source_id = EXCLUDED.source_id,
             notes = EXCLUDED.notes, binding_ic50 = EXCLUDED.binding_ic50`
        : `INSERT INTO kbsi_construct_ligand (construct_id, ligand_id, source_db, source_id, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (construct_id, ligand_id) DO UPDATE SET
             source_db = EXCLUDED.source_db, source_id = EXCLUDED.source_id,
             notes = EXCLUDED.notes`;

      const bindingVal = bindingKd ?? bindingIc50;
      const params = bindingVal != null
        ? [constructId, ligandId, 'ChEMBL', String(activity.activity_id), notes, bindingVal]
        : [constructId, ligandId, 'ChEMBL', String(activity.activity_id), notes];

      const { rowCount } = await client.query(upsertQuery, params);

      if (rowCount && rowCount > 0) {
        bindings++;
      } else {
        stats.errors++;
      }
    } catch {
      stats.errors++;
    }
  }

  return { ligands, bindings };
}

// ── Main ───────────────────────────────────────────────
async function main() {
  const { limit: limitStr, offset, dryRun } = parseArgs();
  const limit = parseInt(limitStr);

  await client.connect();
  try {
    console.log('═'.repeat(60));
    console.log('ChEMBL Expanded: 전체 gene_name 대상 바인딩 수집');
    console.log(`옵션: limit=${limit || 'ALL'}, offset=${offset}, dry-run=${dryRun}`);
    console.log('═'.repeat(60));

    // 1. Fetch all unique gene names
    console.log('\n[1/3] DB에서 gene_name 목록 조회...');
    const allGenes = await fetchAllGeneNames();
    console.log(`  총 ${allGenes.length}개 고유 gene_name 발견`);

    // 2. Apply offset and limit
    let genesToProcess = allGenes.slice(offset);
    if (limit > 0) genesToProcess = genesToProcess.slice(0, limit);
    console.log(`  처리 대상: ${genesToProcess.length}개 (offset=${offset})\n`);

    // 3. Process each gene
    console.log('[2/3] ChEMBL 타겟 검색 + activity 수집...\n');
    const startTime = Date.now();

    for (let i = 0; i < genesToProcess.length; i++) {
      const geneName = genesToProcess[i];
      stats.proteinsProcessed++;

      // Check if already has ChEMBL bindings
      const alreadyCovered = await hasExistingChemblBindings(geneName);
      if (alreadyCovered) {
        stats.proteinsSkippedExisting++;
        if ((i + 1) % 20 === 0) printProgress(i + 1, genesToProcess.length);
        continue;
      }

      const result = await processGene(geneName, dryRun);
      stats.newLigands += result.ligands;
      stats.newBindings += result.bindings;

      if (result.bindings > 0) {
        console.log(
          `  [${i + 1}/${genesToProcess.length}] ${geneName} → ${result.bindings} bindings` +
            (result.ligands > 0 ? `, ${result.ligands} new ligands` : '') +
            (dryRun ? ' (dry-run)' : '')
        );
      }

      // Progress report every 20 proteins
      if ((i + 1) % 20 === 0) {
        printProgress(i + 1, genesToProcess.length);
      }
    }

    // 4. Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '═'.repeat(60));
    console.log(`[3/3] 완료 ${dryRun ? '(DRY-RUN)' : ''}`);
    console.log('═'.repeat(60));
    console.log(`소요 시간:              ${elapsed}s`);
    console.log(`처리 단백질:            ${stats.proteinsProcessed}`);
    console.log(`  ChEMBL 타겟 발견:     ${stats.targetsFound}`);
    console.log(`  타겟 미발견 (skip):   ${stats.proteinsSkippedNoTarget}`);
    console.log(`  기존 데이터 (skip):   ${stats.proteinsSkippedExisting}`);
    console.log(`신규 리간드:            ${stats.newLigands}`);
    console.log(`신규 바인딩:            ${stats.newBindings}`);
    console.log(`에러:                   ${stats.errors}`);
    console.log('═'.repeat(60));
  } finally {
    await client.end();
  }
}

function printProgress(current: number, total: number) {
  const pct = ((current / total) * 100).toFixed(1);
  console.log(
    `  --- 진행: ${current}/${total} (${pct}%) | ` +
      `targets=${stats.targetsFound} ligands=${stats.newLigands} bindings=${stats.newBindings} ` +
      `skip_existing=${stats.proteinsSkippedExisting} skip_noTarget=${stats.proteinsSkippedNoTarget} ---`
  );
}

main().catch(console.error);
