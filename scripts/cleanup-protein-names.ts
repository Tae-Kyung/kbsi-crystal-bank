/**
 * Protein 이름 품질 정리
 * 1. full_name ALL_CAPS → Title Case (5,279건)
 * 2. organism 앞뒤 공백 제거
 * 3. D-amino acid 펩타이드 표기 (유지, 경고만)
 *
 * npx tsx scripts/cleanup-protein-names.ts [--dry-run]
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

// ALL CAPS → Title Case (단, 약어/로마숫자/화학식은 유지)
function toTitleCase(name: string): string {
  const KEEP_UPPER = new Set(['DNA', 'RNA', 'ATP', 'ADP', 'GTP', 'GDP', 'NAD', 'NADP', 'FAD', 'FMN', 'CoA',
    'HIV', 'HCV', 'SARS', 'COVID', 'NMR', 'PDB', 'MHC', 'HLA', 'TCR', 'BCR',
    'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
    'A', 'B', 'C', 'D', 'E', 'I',
    'SH2', 'SH3', 'PH', 'PDZ', 'WD40', 'EGF', 'IGF', 'TNF', 'TGF', 'VEGF',
    'CDK', 'MAP', 'ERK', 'JNK', 'JAK', 'STAT', 'NF', 'AP',
  ]);

  return name.split(' ').map((word, i) => {
    // 약어/로마숫자 유지
    if (KEEP_UPPER.has(word)) return word;
    // 괄호 안 내용 유지 (OXY), (ALPHA)
    if (word.startsWith('(') && word.endsWith(')')) {
      const inner = word.slice(1, -1);
      if (inner.length <= 5) return `(${inner.charAt(0).toUpperCase()}${inner.slice(1).toLowerCase()})`;
      return `(${inner.charAt(0).toUpperCase()}${inner.slice(1).toLowerCase()})`;
    }
    // 하이픈 포함 단어
    if (word.includes('-')) {
      return word.split('-').map(part => {
        if (KEEP_UPPER.has(part)) return part;
        if (part.length <= 1) return part.toUpperCase();
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }).join('-');
    }
    // 첫 단어 또는 일반 단어
    if (word.length <= 1) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`=== Protein 이름 품질 정리 === (dry-run: ${dryRun})\n`);

  await client.connect();
  try {
    // 1. ALL_CAPS full_name 수정
    console.log('[1/2] ALL_CAPS full_name → Title Case...');
    let capsFixed = 0;
    let offset = 0;
    while (true) {
      const { rows: data } = await client.query(
        'SELECT id, full_name FROM kbsi_protein WHERE full_name IS NOT NULL ORDER BY id OFFSET $1 LIMIT 1000',
        [offset]
      );
      if (!data || data.length === 0) break;

      for (const p of data) {
        const n = p.full_name;
        // ALL CAPS 감지 (5글자 이상, 숫자 없음)
        const isAllCaps = n === n.toUpperCase() && n.length > 5 && !/^\d/.test(n) && !/^\(D[A-Z]{2}\)/.test(n);
        const normalized = isAllCaps ? toTitleCase(n) : n;
        if (!dryRun) {
          await client.query('UPDATE kbsi_protein SET full_name_normalized = $1 WHERE id = $2', [normalized, p.id]);
        }
        if (isAllCaps) {
          capsFixed++;
          if (capsFixed <= 5) console.log(`  "${n}" → "${normalized}"`);
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
      if (capsFixed % 1000 === 0 && capsFixed > 0) console.log(`  ${capsFixed}건...`);
    }
    console.log(`  ALL_CAPS 수정: ${capsFixed}건\n`);

    // 2. organism 앞뒤 공백 제거
    console.log('[2/2] organism 앞뒤 공백 제거...');
    let spaceFixed = 0;
    offset = 0;
    while (true) {
      const { rows: data } = await client.query(
        'SELECT id, organism FROM kbsi_protein WHERE organism IS NOT NULL ORDER BY id OFFSET $1 LIMIT 1000',
        [offset]
      );
      if (!data || data.length === 0) break;

      for (const p of data) {
        const trimmed = p.organism.trim().replace(/\s+/g, ' ');
        if (trimmed !== p.organism) {
          if (!dryRun) {
            await client.query('UPDATE kbsi_protein SET organism = $1 WHERE id = $2', [trimmed, p.id]);
          }
          spaceFixed++;
          if (spaceFixed <= 5) console.log(`  "${p.organism}" → "${trimmed}"`);
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
    console.log(`  공백 수정: ${spaceFixed}건\n`);

    console.log('═'.repeat(50));
    console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
    console.log(`  ALL_CAPS 수정: ${capsFixed}건`);
    console.log(`  organism 공백: ${spaceFixed}건`);
    console.log('═'.repeat(50));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
