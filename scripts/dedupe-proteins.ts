/**
 * Protein 중복 병합 — full_name + organism 기준
 *
 * 안전 조치:
 * 1. organism NULL인 그룹은 병합하지 않음
 * 2. full_name 3글자 이하는 병합하지 않음
 * 3. 가장 오래된(smallest ID) protein을 대표로 유지
 * 4. construct.protein_id, database_id.protein_id 재지정
 * 5. 빈 중복 protein 삭제
 *
 * npx tsx scripts/dedupe-proteins.ts [--dry-run] [--limit N]
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
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

  console.log('=== Protein 중복 병합 ===');
  console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}\n`);

  // 1. 전체 protein 로드
  console.log('[1/5] 전체 protein 로드...');
  const proteins: { id: number; full_name: string; organism: string | null }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_protein')
      .select('id, full_name, organism')
      .order('id')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    proteins.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  총 ${proteins.length}건 로드\n`);

  // 2. 중복 그룹 생성
  console.log('[2/5] 중복 그룹 생성...');
  const groups: Record<string, number[]> = {};
  for (const p of proteins) {
    const key = (p.full_name || '').toLowerCase().trim() + '||' + (p.organism || '').toLowerCase().trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(p.id);
  }

  // 중복 그룹만 필터 + 안전 조치 적용
  const dupeGroups: { key: string; ids: number[]; canonical: number; duplicates: number[] }[] = [];
  let skippedNullOrg = 0;
  let skippedShortName = 0;

  for (const [key, ids] of Object.entries(groups)) {
    if (ids.length <= 1) continue;

    const [name, org] = key.split('||');

    // 안전 조치 1: organism NULL → 스킵
    if (!org || org === '') {
      skippedNullOrg++;
      continue;
    }

    // 안전 조치 2: full_name 3글자 이하 → 스킵
    if (name.length <= 3) {
      skippedShortName++;
      continue;
    }

    ids.sort((a, b) => a - b); // smallest ID = canonical
    dupeGroups.push({
      key,
      ids,
      canonical: ids[0],
      duplicates: ids.slice(1),
    });
  }

  const totalDuplicates = dupeGroups.reduce((sum, g) => sum + g.duplicates.length, 0);
  console.log(`  중복 그룹: ${dupeGroups.length}`);
  console.log(`  삭제 대상 protein: ${totalDuplicates}`);
  console.log(`  스킵 (organism NULL): ${skippedNullOrg}`);
  console.log(`  스킵 (이름 3자 이하): ${skippedShortName}\n`);

  // limit 적용
  const targetGroups = dupeGroups.slice(0, limit === Infinity ? dupeGroups.length : limit);

  // 3. construct.protein_id 재지정
  console.log('[3/5] construct.protein_id 재지정...');
  let constructsUpdated = 0;
  let dbIdsUpdated = 0;
  let proteinsDeleted = 0;
  let errors = 0;

  for (let i = 0; i < targetGroups.length; i++) {
    const group = targetGroups[i];

    for (const dupeId of group.duplicates) {
      if (!dryRun) {
        // construct 재지정
        const { error: cErr } = await supabase
          .from('kbsi_construct')
          .update({ protein_id: group.canonical })
          .eq('protein_id', dupeId);

        if (cErr) { errors++; continue; }
        constructsUpdated++;

        // database_id 재지정
        const { error: dErr } = await supabase
          .from('kbsi_database_id')
          .update({ protein_id: group.canonical })
          .eq('protein_id', dupeId);

        if (!dErr) dbIdsUpdated++;

        // 중복 protein 삭제
        const { error: delErr } = await supabase
          .from('kbsi_protein')
          .delete()
          .eq('id', dupeId);

        if (!delErr) proteinsDeleted++;
        else errors++;
      } else {
        constructsUpdated += group.ids.length > 1 ? 1 : 0; // 추정
        proteinsDeleted++;
      }
    }

    if ((i + 1) % 100 === 0 || i === targetGroups.length - 1) {
      console.log(`  [${i + 1}/${targetGroups.length}] constructs: ${constructsUpdated}, dbIds: ${dbIdsUpdated}, deleted: ${proteinsDeleted}, errors: ${errors}`);
    }
  }

  // 4. 결과 확인
  console.log('\n[4/5] 결과 확인...');
  if (!dryRun) {
    const { count: afterCount } = await supabase.from('kbsi_protein').select('id', { count: 'exact', head: true });
    console.log(`  병합 후 protein 수: ${afterCount}`);
  }

  // 5. 요약
  console.log(`\n[5/5] 완료 ${dryRun ? '(DRY-RUN)' : ''}`);
  console.log('═'.repeat(50));
  console.log(`  처리 그룹: ${targetGroups.length}`);
  console.log(`  construct 재지정: ${constructsUpdated}`);
  console.log(`  database_id 재지정: ${dbIdsUpdated}`);
  console.log(`  protein 삭제: ${proteinsDeleted}`);
  console.log(`  에러: ${errors}`);
  console.log(`  스킵 (organism NULL): ${skippedNullOrg}`);
  console.log(`  스킵 (이름 3자): ${skippedShortName}`);
  console.log('═'.repeat(50));
}

main().catch(console.error);
