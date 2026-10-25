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

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

  console.log('=== Protein 중복 병합 ===');
  console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}\n`);

  await client.connect();
  try {
    // 1. 전체 protein 로드
    console.log('[1/5] 전체 protein 로드...');
    const proteins: { id: number; full_name: string; organism: string | null }[] = [];
    let offset = 0;
    while (true) {
      const { rows: data } = await client.query(
        'SELECT id, full_name, organism FROM kbsi_protein ORDER BY id OFFSET $1 LIMIT 1000',
        [offset]
      );
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
          try {
            await client.query(
              'UPDATE kbsi_construct SET protein_id = $1 WHERE protein_id = $2',
              [group.canonical, dupeId]
            );
            constructsUpdated++;
          } catch (e: any) {
            errors++;
            continue;
          }

          // database_id 재지정
          try {
            await client.query(
              'UPDATE kbsi_database_id SET protein_id = $1 WHERE protein_id = $2',
              [group.canonical, dupeId]
            );
            dbIdsUpdated++;
          } catch {}

          // 중복 protein 삭제
          try {
            await client.query('DELETE FROM kbsi_protein WHERE id = $1', [dupeId]);
            proteinsDeleted++;
          } catch (e: any) {
            errors++;
          }
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
      const { rows } = await client.query('SELECT COUNT(*) as cnt FROM kbsi_protein');
      console.log(`  병합 후 protein 수: ${rows[0].cnt}`);
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
  } finally {
    await client.end();
  }
}

main().catch(console.error);
