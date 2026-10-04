/**
 * ChEMBL 약물-타겟 바인딩 데이터 수집
 * 기존 DB의 단백질에 대한 ChEMBL 활성 데이터 (IC50, Kd, Ki)를 수집하여
 * kbsi_ligand + kbsi_construct_ligand 테이블에 저장
 *
 * npx tsx scripts/harvest-chembl.ts [옵션]
 *   --limit 1000      최대 수집 건수 (기본: 1000)
 *   --dry-run         미리보기
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CHEMBL_API = 'https://www.ebi.ac.uk/chembl/api/data';

// 주요 신약 타겟 단백질 → ChEMBL target ID 매핑
const TARGET_MAP: Record<string, { chembl_id: string; gene: string }> = {
  'EGFR': { chembl_id: 'CHEMBL203', gene: 'EGFR' },
  'KRAS': { chembl_id: 'CHEMBL6175', gene: 'KRAS' },
  'BRAF': { chembl_id: 'CHEMBL5145', gene: 'BRAF' },
  'ABL1': { chembl_id: 'CHEMBL1862', gene: 'ABL1' },
  'ALK': { chembl_id: 'CHEMBL4247', gene: 'ALK' },
  'JAK2': { chembl_id: 'CHEMBL2971', gene: 'JAK2' },
  'CDK2': { chembl_id: 'CHEMBL301', gene: 'CDK2' },
  'CDK4': { chembl_id: 'CHEMBL3769', gene: 'CDK4' },
  'HER2': { chembl_id: 'CHEMBL1824', gene: 'ERBB2' },
  'p38': { chembl_id: 'CHEMBL260', gene: 'MAPK14' },
  'AKT1': { chembl_id: 'CHEMBL4282', gene: 'AKT1' },
  'PI3K': { chembl_id: 'CHEMBL3267', gene: 'PIK3CA' },
  'mTOR': { chembl_id: 'CHEMBL2842', gene: 'MTOR' },
  'VEGFR2': { chembl_id: 'CHEMBL279', gene: 'KDR' },
  'HIV-1 protease': { chembl_id: 'CHEMBL243', gene: 'HIV-1 PR' },
  'SARS-CoV-2 Mpro': { chembl_id: 'CHEMBL3927', gene: '3CLpro' },
  'Acetylcholinesterase': { chembl_id: 'CHEMBL220', gene: 'ACHE' },
  'COX-2': { chembl_id: 'CHEMBL230', gene: 'PTGS2' },
  'Thrombin': { chembl_id: 'CHEMBL204', gene: 'F2' },
  'Factor Xa': { chembl_id: 'CHEMBL244', gene: 'F10' },
};

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

async function fetchActivities(targetChemblId: string, limit: number): Promise<ChEMBLActivity[]> {
  const url = `${CHEMBL_API}/activity?target_chembl_id=${targetChemblId}&standard_type__in=IC50,Kd,Ki&pchembl_value__isnull=false&limit=${limit}&format=json`;
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

async function main() {
  const args = process.argv.slice(2);
  const limitPerTarget = parseInt(args[args.indexOf('--limit') + 1] || '50');
  const dryRun = args.includes('--dry-run');

  console.log(`ChEMBL 약물-타겟 바인딩 데이터 수집`);
  console.log(`타겟: ${Object.keys(TARGET_MAP).length}개, 타겟당 최대: ${limitPerTarget}건\n`);

  let totalLigands = 0;
  let totalBindings = 0;

  for (const [name, target] of Object.entries(TARGET_MAP)) {
    console.log(`[${name}] ${target.chembl_id} (${target.gene})`);

    // DB에서 해당 단백질의 construct 찾기
    const { data: proteins } = await supabase
      .from('kbsi_protein')
      .select('id')
      .or(`gene_name.ilike.%${target.gene}%,abbreviation.ilike.%${name}%,full_name.ilike.%${name}%`)
      .limit(1);

    let constructId: number | null = null;
    if (proteins && proteins.length > 0) {
      const { data: constructs } = await supabase
        .from('kbsi_construct')
        .select('id')
        .eq('protein_id', proteins[0].id)
        .limit(1);
      constructId = constructs?.[0]?.id || null;
    }

    if (!constructId) {
      console.log(`  → DB에 해당 단백질 없음, 건너뜀`);
      continue;
    }

    // ChEMBL에서 활성 데이터 fetch
    const activities = await fetchActivities(target.chembl_id, limitPerTarget);
    console.log(`  → ${activities.length}건 활성 데이터`);

    if (activities.length === 0) continue;

    // 고유 분자만 (SMILES 기준 중복 제거)
    const uniqueMolecules = new Map<string, ChEMBLActivity>();
    for (const a of activities) {
      if (a.canonical_smiles && !uniqueMolecules.has(a.canonical_smiles)) {
        uniqueMolecules.set(a.canonical_smiles, a);
      }
    }

    let imported = 0;
    for (const [smiles, activity] of uniqueMolecules) {
      const ligandName = activity.molecule_pref_name || activity.molecule_chembl_id;

      if (dryRun) {
        console.log(`    ${ligandName} | ${activity.standard_type}: ${activity.standard_value} ${activity.standard_units} | pChEMBL: ${activity.pchembl_value}`);
        imported++;
        continue;
      }

      try {
        // Ligand upsert
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
            .insert({ name: ligandName, smiles, source: `ChEMBL ${activity.molecule_chembl_id}` })
            .select('id')
            .single();
          if (error) continue;
          ligandId = newL.id;
          totalLigands++;
        }

        // Construct-Ligand 바인딩
        const bindingData: any = {
          construct_id: constructId,
          ligand_id: ligandId,
          notes: `${activity.standard_type}: ${activity.standard_value} ${activity.standard_units || ''} (pChEMBL: ${activity.pchembl_value}) [${activity.molecule_chembl_id}]`,
        };
        if (activity.standard_type === 'Kd') bindingData.binding_kd = activity.standard_value;
        if (activity.standard_type === 'IC50') bindingData.binding_ic50 = activity.standard_value;

        const { error: bErr } = await supabase
          .from('kbsi_construct_ligand')
          .upsert(bindingData, { onConflict: 'construct_id,ligand_id' });

        if (!bErr) {
          imported++;
          totalBindings++;
        }
      } catch {}
    }

    console.log(`  → ${imported}건 import ${dryRun ? '(dry-run)' : ''}`);
    await sleep(300);
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
  console.log(`신규 리간드: ${totalLigands}건`);
  console.log(`바인딩 데이터: ${totalBindings}건`);
  console.log('═'.repeat(50));
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
