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

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

// ── Fetch all unique gene_names from kbsi_protein (paginated) ──
async function fetchAllGeneNames(): Promise<string[]> {
  const PAGE_SIZE = 1000;
  const geneSet = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('kbsi_protein')
      .select('gene_name')
      .not('gene_name', 'is', null)
      .neq('gene_name', '')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`DB 조회 에러 (offset ${from}):`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.gene_name) geneSet.add(row.gene_name.trim());
    }
    from += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  return Array.from(geneSet).sort();
}

// ── Check if a gene already has ChEMBL bindings ──
async function hasExistingChemblBindings(geneName: string): Promise<boolean> {
  // Find protein ids for this gene
  const { data: proteins } = await supabase
    .from('kbsi_protein')
    .select('id')
    .eq('gene_name', geneName)
    .limit(5);

  if (!proteins || proteins.length === 0) return false;

  for (const p of proteins) {
    const { data: constructs } = await supabase
      .from('kbsi_construct')
      .select('id')
      .eq('protein_id', p.id)
      .limit(1);

    if (!constructs || constructs.length === 0) continue;

    const { count } = await supabase
      .from('kbsi_construct_ligand')
      .select('id', { count: 'exact', head: true })
      .eq('construct_id', constructs[0].id)
      .eq('source_db', 'ChEMBL');

    if (count && count > 0) return true;
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
  const { data: proteins } = await supabase
    .from('kbsi_protein')
    .select('id')
    .eq('gene_name', geneName)
    .limit(1);

  if (!proteins || proteins.length === 0) return null;

  const { data: constructs } = await supabase
    .from('kbsi_construct')
    .select('id')
    .eq('protein_id', proteins[0].id)
    .limit(1);

  return constructs?.[0]?.id || null;
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
      const { data: existingLigand } = await supabase
        .from('kbsi_ligand')
        .select('id')
        .eq('smiles', smiles)
        .maybeSingle();

      let ligandId: number;
      if (existingLigand) {
        ligandId = existingLigand.id;
      } else {
        const { data: newL, error } = await supabase
          .from('kbsi_ligand')
          .insert({
            name: ligandName,
            smiles,
            source: `ChEMBL ${activity.molecule_chembl_id}`,
            source_db: 'ChEMBL',
            source_id: activity.molecule_chembl_id,
          })
          .select('id')
          .single();

        if (error) {
          stats.errors++;
          continue;
        }
        ligandId = newL.id;
        ligands++;
      }

      // Construct-Ligand binding
      const bindingData: Record<string, unknown> = {
        construct_id: constructId,
        ligand_id: ligandId,
        source_db: 'ChEMBL',
        source_id: String(activity.activity_id),
        notes: `${activity.standard_type}: ${activity.standard_value} ${activity.standard_units || ''} (pChEMBL: ${activity.pchembl_value}) [${activity.molecule_chembl_id}]`,
      };
      if (activity.standard_type === 'Kd') bindingData.binding_kd = activity.standard_value;
      if (activity.standard_type === 'IC50') bindingData.binding_ic50 = activity.standard_value;

      const { error: bErr } = await supabase
        .from('kbsi_construct_ligand')
        .upsert(bindingData, { onConflict: 'construct_id,ligand_id' });

      if (!bErr) {
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
