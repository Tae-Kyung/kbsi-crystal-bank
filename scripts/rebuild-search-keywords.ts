/**
 * 통합 키워드 테이블 전체 재구축
 * gene_name, abbreviation, organism, precipitant_type, expression_system, pdb_id
 *
 * npx tsx scripts/rebuild-search-keywords.ts [--dry-run]
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

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`=== 키워드 테이블 재구축 === (dry-run: ${dryRun})\n`);

  await client.connect();
  try {
    const keywords: Map<string, { keyword: string; type: string; entity_id: number | null }> = new Map();

    // 1. gene_name
    console.log('[1/6] gene_name...');
    let offset = 0;
    while (true) {
      const { rows: data } = await client.query(
        'SELECT id, gene_name FROM kbsi_protein WHERE gene_name IS NOT NULL OFFSET $1 LIMIT 1000',
        [offset]
      );
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
      const { rows: data } = await client.query(
        'SELECT id, abbreviation FROM kbsi_protein WHERE abbreviation IS NOT NULL OFFSET $1 LIMIT 1000',
        [offset]
      );
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
      const { rows: data } = await client.query(
        'SELECT organism FROM kbsi_protein WHERE organism IS NOT NULL OFFSET $1 LIMIT 1000',
        [offset]
      );
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
      const { rows: data } = await client.query(
        "SELECT precipitant_type FROM kbsi_crystallization WHERE precipitant_type IS NOT NULL AND source_type != 'synthetic' OFFSET $1 LIMIT 1000",
        [offset]
      );
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
      const { rows: data } = await client.query(
        'SELECT expression_system FROM kbsi_construct WHERE expression_system IS NOT NULL OFFSET $1 LIMIT 1000',
        [offset]
      );
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
      const { rows: data } = await client.query(
        'SELECT pdb_id, construct_id FROM kbsi_structure WHERE pdb_id IS NOT NULL OFFSET $1 LIMIT 1000',
        [offset]
      );
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
    await client.query('DELETE FROM kbsi_search_keywords WHERE id >= 0');

    console.log('키워드 삽입...');
    const allKeywords = [...keywords.values()];
    let inserted = 0;
    for (let i = 0; i < allKeywords.length; i += 100) {
      const batch = allKeywords.slice(i, i + 100);
      const values: any[] = [];
      const placeholders: string[] = [];
      batch.forEach((kw, idx) => {
        const base = idx * 3;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        values.push(kw.keyword, kw.type, kw.entity_id);
      });
      try {
        await client.query(
          `INSERT INTO kbsi_search_keywords (keyword, type, entity_id) VALUES ${placeholders.join(', ')}`,
          values
        );
        inserted += batch.length;
      } catch (e: any) {
        console.error(`  INSERT 에러: ${e.message}`);
      }
      if (inserted % 5000 === 0) console.log(`  ${inserted}/${allKeywords.length}`);
    }

    console.log(`\n완료: ${inserted}개 키워드 삽입`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
