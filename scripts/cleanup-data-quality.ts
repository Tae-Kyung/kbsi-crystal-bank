/**
 * 데이터 품질 정리 — 6가지 개선
 * 1. Characterization 오분류 삭제 (NMR, cryo-EM, ELISA 등)
 * 2. precipitant_type 정규화 (PEG-3350 → PEG 3350 등)
 * 3. pH 이상치 NULL 처리 (<2 또는 >12)
 * 4. temperature 이상치 NULL 처리 (<-5 또는 >50)
 * 5. abbreviation NULL → gene_name으로 채우기
 * 6. construct residues NULL → seq_final 길이로 채우기
 *
 * npx tsx scripts/cleanup-data-quality.ts [--dry-run]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`=== 데이터 품질 정리 === (dry-run: ${dryRun})\n`);

  // ─── 1. Characterization 오분류 삭제 ───
  console.log('[1/6] Characterization 오분류 삭제...');
  const VALID_METHODS = ['DLS', 'SEC', 'SEC-MALS', 'SDS-PAGE', 'Mass Spec', 'thermal_stability', 'CD', 'SPR', 'ITC', 'DSF', 'AUC', 'MALS'];
  let charDeleted = 0;
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_characterization')
      .select('id, method')
      .eq('source_db', 'PubMed')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    const toDelete = data.filter(d => !VALID_METHODS.includes(d.method)).map(d => d.id);
    if (toDelete.length > 0 && !dryRun) {
      for (let i = 0; i < toDelete.length; i += 100) {
        const batch = toDelete.slice(i, i + 100);
        await supabase.from('kbsi_characterization').delete().in('id', batch);
      }
    }
    charDeleted += toDelete.length;
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  삭제${dryRun ? '(예정)' : ''}: ${charDeleted}건\n`);

  // ─── 2. precipitant_type 정규화 ───
  console.log('[2/6] precipitant_type 정규화...');
  const PRECIP_NORMALIZE: Record<string, string> = {
    'PEG-3350': 'PEG 3350',
    'PEG-4000': 'PEG 4000',
    'PEG-6000': 'PEG 6000',
    'PEG-8000': 'PEG 8000',
    'PEG-400': 'PEG 400',
    'PEG-1500': 'PEG 1500',
    'PEG-2000': 'PEG 2000',
    'Peg 3350': 'PEG 3350',
    'Peg 4000': 'PEG 4000',
    'Peg 6000': 'PEG 6000',
    'Peg 8000': 'PEG 8000',
    'peg 3350': 'PEG 3350',
    'peg 4000': 'PEG 4000',
    'Polyethylene glycol 3350': 'PEG 3350',
    'Polyethylene glycol 4000': 'PEG 4000',
    'Polyethylene glycol 6000': 'PEG 6000',
    'Polyethylene glycol 8000': 'PEG 8000',
    'Polyethylene Glycol 3350': 'PEG 3350',
    'Polyethylene Glycol 4000': 'PEG 4000',
    'Polyethylene Glycol 6000': 'PEG 6000',
    'Polyethylene Glycol 8000': 'PEG 8000',
    'polyethylene glycol 3350': 'PEG 3350',
    'polyethylene glycol 4000': 'PEG 4000',
    'PEGMME 5000': 'PEG MME 5000',
    'PEG MME 2000': 'PEG MME 2000',
    'PEGMME 2000': 'PEG MME 2000',
    'Ammonium sulfate': 'Ammonium Sulfate',
    'ammonium sulfate': 'Ammonium Sulfate',
    '(NH4)2SO4': 'Ammonium Sulfate',
    'ammonium sulphate': 'Ammonium Sulfate',
    'Na citrate': 'Sodium Citrate',
    'sodium citrate': 'Sodium Citrate',
    'Na formate': 'Sodium Formate',
    'sodium formate': 'Sodium Formate',
    'Na malonate': 'Sodium Malonate',
    'sodium malonate': 'Sodium Malonate',
    'K phosphate': 'Potassium Phosphate',
    'potassium phosphate': 'Potassium Phosphate',
    'Li sulfate': 'Lithium Sulfate',
    'lithium sulfate': 'Lithium Sulfate',
    'Mpd': 'MPD',
    'mpd': 'MPD',
    '2-methyl-2,4-pentanediol': 'MPD',
    'isopropanol': 'Isopropanol',
    '2-propanol': 'Isopropanol',
  };
  let precipNormalized = 0;
  for (const [from, to] of Object.entries(PRECIP_NORMALIZE)) {
    if (!dryRun) {
      const { error } = await supabase
        .from('kbsi_crystallization')
        .update({ precipitant_type: to })
        .eq('precipitant_type', from);
      if (!error) precipNormalized++;
    } else {
      const { count } = await supabase
        .from('kbsi_crystallization')
        .select('id', { count: 'exact', head: true })
        .eq('precipitant_type', from);
      precipNormalized += count ?? 0;
    }
  }
  console.log(`  정규화${dryRun ? '(예정)' : ''}: ${precipNormalized}건\n`);

  // ─── 3. pH 이상치 NULL 처리 ───
  console.log('[3/6] pH 이상치 NULL 처리...');
  let phFixed = 0;
  if (!dryRun) {
    await supabase.from('kbsi_crystallization').update({ ph: null }).lt('ph', 2).neq('source_type', 'synthetic');
    await supabase.from('kbsi_crystallization').update({ ph: null }).gt('ph', 12).neq('source_type', 'synthetic');
    phFixed = 1; // already counted in dry-run
  } else {
    const { count: c1 } = await supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).lt('ph', 2).neq('source_type', 'synthetic');
    const { count: c2 } = await supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).gt('ph', 12).neq('source_type', 'synthetic');
    phFixed = (c1 ?? 0) + (c2 ?? 0);
  }
  console.log(`  NULL 처리${dryRun ? '(예정)' : ''}: ${phFixed}건\n`);

  // ─── 4. temperature 이상치 NULL 처리 ───
  console.log('[4/6] temperature 이상치 NULL 처리...');
  let tempFixed = 0;
  if (!dryRun) {
    await supabase.from('kbsi_crystallization').update({ temperature: null }).lt('temperature', -5).neq('source_type', 'synthetic');
    await supabase.from('kbsi_crystallization').update({ temperature: null }).gt('temperature', 50).neq('source_type', 'synthetic');
    tempFixed = 1;
  } else {
    const { count: c1 } = await supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).lt('temperature', -5).neq('source_type', 'synthetic');
    const { count: c2 } = await supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).gt('temperature', 50).neq('source_type', 'synthetic');
    tempFixed = (c1 ?? 0) + (c2 ?? 0);
  }
  console.log(`  NULL 처리${dryRun ? '(예정)' : ''}: ${tempFixed}건\n`);

  // ─── 5. abbreviation NULL → gene_name 채우기 ───
  console.log('[5/6] abbreviation NULL → gene_name 채우기...');
  let abbrFixed = 0;
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_protein')
      .select('id, gene_name')
      .is('abbreviation', null)
      .not('gene_name', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    if (!dryRun) {
      for (const p of data) {
        await supabase.from('kbsi_protein').update({ abbreviation: p.gene_name }).eq('id', p.id);
      }
    }
    abbrFixed += data.length;
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  업데이트${dryRun ? '(예정)' : ''}: ${abbrFixed}건\n`);

  // ─── 6. construct residues NULL → seq_final 길이 ───
  console.log('[6/6] construct residues → seq_final 길이...');
  let residuesFixed = 0;
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, seq_final')
      .is('residues', null)
      .not('seq_final', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    if (!dryRun) {
      const updates = data.map((c: any) => {
        const len = (c.seq_final || '').replace(/[^A-Za-z]/g, '').length;
        return supabase.from('kbsi_construct').update({ residues: `1-${len}` }).eq('id', c.id);
      });
      for (let i = 0; i < updates.length; i += 50) {
        await Promise.all(updates.slice(i, i + 50));
      }
    }
    residuesFixed += data.length;
    if (data.length < 1000) break;
    offset += 1000;
    if (residuesFixed % 5000 === 0) console.log(`  진행: ${residuesFixed}건...`);
  }
  console.log(`  업데이트${dryRun ? '(예정)' : ''}: ${residuesFixed}건\n`);

  // ─── 요약 ───
  console.log('═'.repeat(50));
  console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
  console.log(`  1. Characterization 오분류 삭제: ${charDeleted}건`);
  console.log(`  2. precipitant_type 정규화: ${precipNormalized}건`);
  console.log(`  3. pH 이상치 NULL: ${phFixed}건`);
  console.log(`  4. temp 이상치 NULL: ${tempFixed}건`);
  console.log(`  5. abbreviation 채움: ${abbrFixed}건`);
  console.log(`  6. residues 채움: ${residuesFixed}건`);
  console.log('═'.repeat(50));
}

main().catch(console.error);
