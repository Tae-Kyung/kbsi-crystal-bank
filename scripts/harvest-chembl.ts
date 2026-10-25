/**
 * ChEMBL 약물-타겟 바인딩 데이터 수집
 * 기존 DB의 단백질에 대한 ChEMBL 활성 데이터 (IC50, Kd, Ki)를 수집하여
 * kbsi_ligand + kbsi_construct_ligand 테이블에 저장
 *
 * npx tsx scripts/harvest-chembl.ts [옵션]
 *   --limit 1000      최대 수집 건수 (기본: 1000)
 *   --dry-run         미리보기
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

  await client.connect();
  try {
    console.log(`ChEMBL 약물-타겟 바인딩 데이터 수집`);
    console.log(`타겟: ${Object.keys(TARGET_MAP).length}개, 타겟당 최대: ${limitPerTarget}건\n`);

    let totalLigands = 0;
    let totalBindings = 0;

    for (const [name, target] of Object.entries(TARGET_MAP)) {
      console.log(`[${name}] ${target.chembl_id} (${target.gene})`);

      // DB에서 해당 단백질의 construct 찾기
      const { rows: proteins } = await client.query(
        `SELECT id FROM kbsi_protein
         WHERE gene_name ILIKE $1 OR abbreviation ILIKE $2 OR full_name ILIKE $3
         LIMIT 1`,
        [`%${target.gene}%`, `%${name}%`, `%${name}%`]
      );

      let constructId: number | null = null;
      if (proteins.length > 0) {
        const { rows: constructs } = await client.query(
          `SELECT id FROM kbsi_construct WHERE protein_id = $1 LIMIT 1`,
          [proteins[0].id]
        );
        constructId = constructs.length > 0 ? constructs[0].id : null;
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
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [ligandName, smiles, `ChEMBL ${activity.molecule_chembl_id}`, 'ChEMBL', activity.molecule_chembl_id]
            );
            if (newRows.length === 0) continue;
            ligandId = newRows[0].id;
            totalLigands++;
          }

          // Construct-Ligand 바인딩
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
  } finally {
    await client.end();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
