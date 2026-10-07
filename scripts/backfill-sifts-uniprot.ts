/**
 * SIFTS 매핑으로 UniProt ID 대량 보강 + gene_name 확보
 *
 * 1. SIFTS CSV (PDB→UniProt) 다운로드/파싱
 * 2. kbsi_structure.pdb_id → SIFTS → UniProt accession
 * 3. kbsi_database_id에 UniProt 등록 (중복 스킵)
 * 4. UniProt API → gene_name + abbreviation 보강
 *
 * npx tsx scripts/backfill-sifts-uniprot.ts [--dry-run] [--limit N]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;

  console.log(`=== SIFTS UniProt + gene_name 보강 ===`);
  console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}\n`);

  // 1. SIFTS CSV
  const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
  const siftsPath = `${tmpDir}/sifts.csv`;
  if (!existsSync(siftsPath)) {
    console.log('[1] SIFTS CSV 다운로드...');
    console.log('다운로드: curl -o sifts.csv.gz https://ftp.ebi.ac.uk/pub/databases/msd/sifts/flatfiles/csv/pdb_chain_uniprot.csv.gz && gunzip sifts.csv.gz');
    console.log('파일을 ' + siftsPath + '에 저장해주세요.');
    process.exit(1);
  }
  console.log('[1] SIFTS CSV 로드...');
  const siftsRaw = readFileSync(siftsPath, 'utf-8');
  const siftsLines = siftsRaw.split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('PDB'));

  // PDB ID → UniProt 매핑 (고유 PDB당 첫 UniProt만)
  const pdbToUniprot: Record<string, string> = {};
  for (const line of siftsLines) {
    const parts = line.split(',');
    const pdbId = parts[0]?.toUpperCase().trim();
    const uniprot = parts[2]?.trim();
    if (pdbId && uniprot && pdbId.length === 4 && !pdbToUniprot[pdbId]) {
      pdbToUniprot[pdbId] = uniprot;
    }
  }
  console.log(`  SIFTS 매핑: ${Object.keys(pdbToUniprot).length}개 PDB → UniProt\n`);

  // 2. 기존 UniProt 연결 로드
  console.log('[2] 기존 UniProt 연결 로드...');
  const existingUniprot = new Set<number>(); // protein_id
  let offset = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_database_id').select('protein_id').eq('db_name', 'UniProt').range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((d: any) => existingUniprot.add(d.protein_id));
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  기존 UniProt: ${existingUniprot.size}개\n`);

  // 3. kbsi_structure에서 pdb_id → protein_id 매핑
  console.log('[3] PDB → Protein 매핑 로드...');
  const pdbToProtein: Record<string, number> = {};
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_structure')
      .select('pdb_id, construct_id')
      .not('pdb_id', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((s: any) => {
      if (s.pdb_id && !pdbToProtein[s.pdb_id.toUpperCase()]) {
        pdbToProtein[s.pdb_id.toUpperCase()] = s.construct_id;
      }
    });
    if (data.length < 1000) break;
    offset += 1000;
  }

  // construct_id → protein_id
  const constructToProtein: Record<number, number> = {};
  offset = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_construct').select('id, protein_id').range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((c: any) => { constructToProtein[c.id] = c.protein_id; });
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  PDB→Construct: ${Object.keys(pdbToProtein).length}, Construct→Protein: ${Object.keys(constructToProtein).length}\n`);

  // 4. 새 UniProt 매핑 찾기
  console.log('[4] 신규 UniProt 매핑 탐색...');
  const newMappings: { protein_id: number; uniprot: string }[] = [];

  for (const [pdbId, uniprot] of Object.entries(pdbToUniprot)) {
    const constructId = pdbToProtein[pdbId];
    if (!constructId) continue;
    const proteinId = constructToProtein[constructId];
    if (!proteinId) continue;
    if (existingUniprot.has(proteinId)) continue;

    newMappings.push({ protein_id: proteinId, uniprot });
    existingUniprot.add(proteinId); // 중복 방지
  }

  // protein_id당 하나만
  const uniqueMappings = new Map<number, string>();
  for (const m of newMappings) {
    if (!uniqueMappings.has(m.protein_id)) uniqueMappings.set(m.protein_id, m.uniprot);
  }

  console.log(`  신규 매핑: ${uniqueMappings.size}개\n`);

  const targets = [...uniqueMappings.entries()].slice(0, limit === Infinity ? uniqueMappings.size : limit);

  // 5. DB 등록 + gene_name 보강
  console.log(`[5] DB 등록 + gene_name (${targets.length}건)...\n`);
  let uniprotInserted = 0;
  let geneUpdated = 0;
  let errors = 0;

  for (let i = 0; i < targets.length; i++) {
    const [proteinId, uniprot] = targets[i];

    if (!dryRun) {
      // UniProt database_id 등록
      const { error } = await supabase.from('kbsi_database_id').insert({
        protein_id: proteinId,
        db_name: 'UniProt',
        db_value: uniprot,
      });
      if (!error) uniprotInserted++;
      else { errors++; continue; }

      // UniProt API → gene_name
      try {
        const res = await fetch(`https://rest.uniprot.org/uniprotkb/${uniprot}.json`, {
          headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
        });
        if (res.ok) {
          const data = await res.json();
          const geneName = data?.genes?.[0]?.geneName?.value;
          if (geneName) {
            await supabase.from('kbsi_protein').update({ gene_name: geneName, abbreviation: geneName }).eq('id', proteinId).is('gene_name', null);
            geneUpdated++;
          }
        }
      } catch {}

      await sleep(300);
    } else {
      uniprotInserted++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  [${i + 1}/${targets.length}] uniprot: ${uniprotInserted}, gene: ${geneUpdated}, err: ${errors}`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
  console.log(`  SIFTS 매핑: ${Object.keys(pdbToUniprot).length}`);
  console.log(`  신규 UniProt: ${uniprotInserted}`);
  console.log(`  gene_name 업데이트: ${geneUpdated}`);
  console.log(`  에러: ${errors}`);
  console.log('═'.repeat(50));
}

main().catch(console.error);
