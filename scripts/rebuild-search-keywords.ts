/**
 * 통합 키워드 테이블 전체 재구축
 * gene_name, abbreviation, organism, precipitant_type, expression_system, pdb_id
 *
 * npx tsx scripts/rebuild-search-keywords.ts [--dry-run]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`=== 키워드 테이블 재구축 === (dry-run: ${dryRun})\n`);

  const keywords: Map<string, { keyword: string; type: string; entity_id: number | null }> = new Map();

  // 1. gene_name
  console.log('[1/6] gene_name...');
  let offset = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_protein').select('id, gene_name').not('gene_name', 'is', null).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((p: any) => {
      const key = `${p.gene_name}||gene_name`;
      if (!keywords.has(key)) keywords.set(key, { keyword: p.gene_name, type: 'gene_name', entity_id: p.id });
    });
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  ${[...keywords.values()].filter(k => k.type === 'gene_name').length}개`);

  // 2. abbreviation
  console.log('[2/6] abbreviation...');
  offset = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_protein').select('id, abbreviation').not('abbreviation', 'is', null).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((p: any) => {
      const key = `${p.abbreviation}||abbreviation`;
      if (!keywords.has(key)) keywords.set(key, { keyword: p.abbreviation, type: 'abbreviation', entity_id: p.id });
    });
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  ${[...keywords.values()].filter(k => k.type === 'abbreviation').length}개`);

  // 3. organism (고유값만)
  console.log('[3/6] organism...');
  const organisms = new Set<string>();
  offset = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_protein').select('organism').not('organism', 'is', null).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((p: any) => organisms.add(p.organism));
    if (data.length < 1000) break;
    offset += 1000;
  }
  organisms.forEach(org => {
    const key = `${org}||organism`;
    if (!keywords.has(key)) keywords.set(key, { keyword: org, type: 'organism', entity_id: null });
  });
  console.log(`  ${organisms.size}개`);

  // 4. precipitant_type (고유값만)
  console.log('[4/6] precipitant_type...');
  const precips = new Set<string>();
  offset = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_crystallization').select('precipitant_type').not('precipitant_type', 'is', null).neq('source_type', 'synthetic').range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((c: any) => precips.add(c.precipitant_type));
    if (data.length < 1000) break;
    offset += 1000;
  }
  precips.forEach(p => {
    const key = `${p}||precipitant`;
    if (!keywords.has(key)) keywords.set(key, { keyword: p, type: 'precipitant', entity_id: null });
  });
  console.log(`  ${precips.size}개`);

  // 5. expression_system (고유값만)
  console.log('[5/6] expression_system...');
  const hosts = new Set<string>();
  offset = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_construct').select('expression_system').not('expression_system', 'is', null).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((c: any) => hosts.add(c.expression_system));
    if (data.length < 1000) break;
    offset += 1000;
  }
  hosts.forEach(h => {
    const key = `${h}||host`;
    if (!keywords.has(key)) keywords.set(key, { keyword: h, type: 'host', entity_id: null });
  });
  console.log(`  ${hosts.size}개`);

  // 6. pdb_id
  console.log('[6/6] pdb_id...');
  offset = 0;
  let pdbCount = 0;
  while (true) {
    const { data } = await supabase.from('kbsi_structure').select('pdb_id, construct_id').not('pdb_id', 'is', null).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((s: any) => {
      const key = `${s.pdb_id}||pdb_id`;
      if (!keywords.has(key)) { keywords.set(key, { keyword: s.pdb_id, type: 'pdb_id', entity_id: null }); pdbCount++; }
    });
    if (data.length < 1000) break;
    offset += 1000;
    if (offset % 50000 === 0) console.log(`  ${offset} 스캔...`);
  }
  console.log(`  ${pdbCount}개`);

  console.log(`\n총 키워드: ${keywords.size}개`);

  if (dryRun) {
    console.log('(DRY-RUN — DB 변경 없음)');
    return;
  }

  // TRUNCATE + INSERT
  console.log('\n기존 키워드 삭제...');
  await supabase.from('kbsi_search_keywords').delete().gte('id', 0);

  console.log('키워드 삽입...');
  const allKeywords = [...keywords.values()];
  let inserted = 0;
  for (let i = 0; i < allKeywords.length; i += 100) {
    const batch = allKeywords.slice(i, i + 100);
    const { error } = await supabase.from('kbsi_search_keywords').insert(batch);
    if (!error) inserted += batch.length;
    if (inserted % 5000 === 0) console.log(`  ${inserted}/${allKeywords.length}`);
  }

  console.log(`\n완료: ${inserted}개 키워드 삽입`);
}

main().catch(console.error);
