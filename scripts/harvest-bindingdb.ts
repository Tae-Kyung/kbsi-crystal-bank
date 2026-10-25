/**
 * BindingDB에서 바인딩 데이터 수집
 * UniProt ID → BindingDB API → Ligand + Binding
 *
 * npx tsx scripts/harvest-bindingdb.ts [--limit N] [--offset N] [--dry-run]
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

const BINDINGDB_API = 'https://bindingdb.org/rest';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface BindingEntry {
  monomerid: string;
  smiles: string;
  name: string;
  ki?: number;
  kd?: number;
  ic50?: number;
  ec50?: number;
}

async function fetchBindingDB(uniprotId: string): Promise<BindingEntry[]> {
  try {
    const url = `${BINDINGDB_API}/getLigandsByUniprot?uniprot=${uniprotId};10000&response=application/json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.trim() === '' || text.length < 10) return [];

    let data: any;
    try { data = JSON.parse(text); } catch { return []; }

    const entries: BindingEntry[] = [];
    // 응답 구조: getLindsByUniprotResponse.bdb.affinities
    const affinities = data?.getLindsByUniprotResponse?.['bdb.affinities'];
    if (!affinities) return [];

    const list = Array.isArray(affinities) ? affinities : [affinities];
    for (const a of list) {
      const smiles = a?.['bdb.smile'] || a?.smile;
      if (!smiles) continue;

      const entry: BindingEntry = {
        monomerid: String(a?.['bdb.monomerid'] || a?.monomerid || ''),
        smiles,
        name: a?.['bdb.compound_name'] || a?.['bdb.monomerid'] || 'Unknown',
      };

      const parseAffinity = (val: string | number | undefined): number | undefined => {
        if (val === undefined || val === null || val === '' || val === 'NA') return undefined;
        const num = typeof val === 'string' ? parseFloat(val.replace(/[<>~=]/g, '')) : val;
        return isNaN(num) ? undefined : num;
      };

      // 친화도 타입별 파싱
      const affType = a?.['bdb.affinity_type'] || a?.affinity_type || '';
      const affVal = parseAffinity(a?.['bdb.affinity'] || a?.affinity);

      if (affType.includes('Ki')) entry.ki = affVal;
      else if (affType.includes('Kd')) entry.kd = affVal;
      else if (affType.includes('IC50')) entry.ic50 = affVal;
      else if (affType.includes('EC50')) entry.ec50 = affVal;

      if (entry.ki || entry.kd || entry.ic50 || entry.ec50) {
        entries.push(entry);
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const offsetIdx = args.indexOf('--offset');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const startOffset = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) : 0;
  const dryRun = args.includes('--dry-run');

  console.log('=== BindingDB 바인딩 데이터 수집 (Lab PostgreSQL) ===');
  console.log(`limit: ${limit === Infinity ? '전체' : limit}, offset: ${startOffset}, dry-run: ${dryRun}\n`);

  await client.connect();
  console.log('  DB 연결 완료\n');

  try {
    // UniProt ID + protein_id 조회
    console.log('[1] UniProt ID 목록 로드...');
    const uniprotRes = await client.query(
      `SELECT protein_id, db_value FROM kbsi_database_id WHERE db_name = $1`,
      ['UniProt']
    );
    const uniprotEntries = uniprotRes.rows.map((d: any) => ({
      protein_id: d.protein_id,
      uniprot_id: d.db_value,
    }));
    console.log(`  UniProt: ${uniprotEntries.length}개\n`);

    // protein_id → construct_id 매핑
    console.log('[2] Construct 매핑 로드...');
    const constructRes = await client.query(
      `SELECT DISTINCT ON (protein_id) id, protein_id FROM kbsi_construct ORDER BY protein_id, id`
    );
    const proteinToConstruct: Record<number, number> = {};
    for (const c of constructRes.rows) {
      proteinToConstruct[c.protein_id] = c.id;
    }
    console.log(`  Construct 매핑: ${Object.keys(proteinToConstruct).length}개\n`);

    // 처리 대상
    const targets = uniprotEntries.slice(startOffset, startOffset + (limit === Infinity ? uniprotEntries.length : limit));
    console.log(`[3] 처리 대상: ${targets.length}개\n`);

    let totalLigands = 0;
    let totalBindings = 0;
    let noData = 0;
    let errors = 0;

    for (let i = 0; i < targets.length; i++) {
      const { protein_id, uniprot_id } = targets[i];
      const constructId = proteinToConstruct[protein_id];
      if (!constructId) { noData++; continue; }

      const entries = await fetchBindingDB(uniprot_id);
      if (entries.length === 0) { noData++; await sleep(500); continue; }

      if (dryRun) {
        if (entries.length > 0) {
          console.log(`  [DRY] ${uniprot_id}: ${entries.length} bindings (예: ${entries[0].name}, IC50=${entries[0].ic50})`);
          totalBindings += entries.length;
        }
        await sleep(500);
        if ((i + 1) % 20 === 0) console.log(`  [${i + 1}/${targets.length}] bindings: ${totalBindings}`);
        continue;
      }

      // DB 삽입
      for (const entry of entries) {
        try {
          // Ligand: check existing by SMILES
          const existingRes = await client.query(
            `SELECT id FROM kbsi_ligand WHERE smiles = $1 LIMIT 1`,
            [entry.smiles]
          );

          let ligandId: number;
          if (existingRes.rows.length > 0) {
            ligandId = existingRes.rows[0].id;
          } else {
            const insertRes = await client.query(
              `INSERT INTO kbsi_ligand (name, smiles, source, source_db, source_id)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id`,
              [entry.name, entry.smiles, `BindingDB ${entry.monomerid}`, 'BindingDB', entry.monomerid]
            );
            ligandId = insertRes.rows[0].id;
            totalLigands++;
          }

          // Binding upsert
          const columns = ['construct_id', 'ligand_id', 'source_db', 'source_id'];
          const values: any[] = [constructId, ligandId, 'BindingDB', entry.monomerid];
          let paramIdx = 5;

          if (entry.kd) {
            columns.push('binding_kd');
            values.push(entry.kd);
            paramIdx++;
          }
          if (entry.ic50) {
            columns.push('binding_ic50');
            values.push(entry.ic50);
            paramIdx++;
          }

          const notes: string[] = [];
          if (entry.ki) notes.push(`Ki: ${entry.ki} nM`);
          if (entry.ec50) notes.push(`EC50: ${entry.ec50} nM`);
          if (notes.length > 0) {
            columns.push('notes');
            values.push(notes.join(', '));
          }

          const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
          const updateSet = columns
            .filter(c => c !== 'construct_id' && c !== 'ligand_id')
            .map(c => `${c} = EXCLUDED.${c}`)
            .join(', ');

          await client.query(
            `INSERT INTO kbsi_construct_ligand (${columns.join(', ')})
             VALUES (${placeholders})
             ON CONFLICT (construct_id, ligand_id) DO UPDATE SET ${updateSet}`,
            values
          );
          totalBindings++;
        } catch { errors++; }
      }

      await sleep(500);

      if ((i + 1) % 20 === 0) {
        console.log(`  [${i + 1}/${targets.length}] ligands: ${totalLigands}, bindings: ${totalBindings}, noData: ${noData}, errors: ${errors}`);
      }
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
    console.log(`  처리: ${targets.length}`);
    console.log(`  신규 리간드: ${totalLigands}`);
    console.log(`  바인딩: ${totalBindings}`);
    console.log(`  데이터 없음: ${noData}`);
    console.log(`  에러: ${errors}`);
    console.log('═'.repeat(50));
  } finally {
    await client.end();
    console.log('DB 연결 종료');
  }
}

main().catch(console.error);
