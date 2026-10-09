/**
 * organism 이름 정규화
 * - 대소문자 통일 (HOMO SAPIENS → Homo sapiens)
 * - 약어 통일 (E. coli, E.coli → Escherichia coli)
 * - 균주 구분 유지 (E. coli K12 ≠ E. coli O157:H7)
 *
 * npx tsx scripts/normalize-organism.ts [--dry-run]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 약어 → 정식 이름 매핑
const ABBREVIATION_MAP: Record<string, string> = {
  'e. coli': 'Escherichia coli',
  'e.coli': 'Escherichia coli',
  's. cerevisiae': 'Saccharomyces cerevisiae',
  's.cerevisiae': 'Saccharomyces cerevisiae',
  'h. sapiens': 'Homo sapiens',
  'h.sapiens': 'Homo sapiens',
  'm. musculus': 'Mus musculus',
  'm.musculus': 'Mus musculus',
  'b. subtilis': 'Bacillus subtilis',
  'b.subtilis': 'Bacillus subtilis',
  'd. melanogaster': 'Drosophila melanogaster',
  'c. elegans': 'Caenorhabditis elegans',
  's. aureus': 'Staphylococcus aureus',
  's. pneumoniae': 'Streptococcus pneumoniae',
  'p. aeruginosa': 'Pseudomonas aeruginosa',
  'm. tuberculosis': 'Mycobacterium tuberculosis',
  'a. thaliana': 'Arabidopsis thaliana',
  't. thermophilus': 'Thermus thermophilus',
  'r. norvegicus': 'Rattus norvegicus',
  'b. taurus': 'Bos taurus',
  'g. gallus': 'Gallus gallus',
  'x. laevis': 'Xenopus laevis',
  'k. pneumoniae': 'Klebsiella pneumoniae',
};

function normalize(name: string): string {
  let n = name.trim();

  // 1. 전체 대문자 → Capitalized (HOMO SAPIENS → Homo sapiens)
  if (n === n.toUpperCase() && n.length > 3) {
    n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  }

  // 2. 약어 치환 (전체가 약어인 경우)
  const lower = n.toLowerCase();
  for (const [abbr, full] of Object.entries(ABBREVIATION_MAP)) {
    if (lower === abbr) return full;
    // "E. coli K12" → "Escherichia coli K12"
    if (lower.startsWith(abbr + ' ')) {
      return full + n.slice(abbr.length);
    }
  }

  return n;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`=== Organism 정규화 === (dry-run: ${dryRun})\n`);

  // 모든 고유 organism 조회
  const organisms = new Map<string, number[]>(); // organism → protein IDs
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_protein')
      .select('id, organism')
      .not('organism', 'is', null)
      .range(offset, offset + 4999);
    if (!data || data.length === 0) break;
    data.forEach((p: any) => {
      if (!organisms.has(p.organism)) organisms.set(p.organism, []);
      organisms.get(p.organism)!.push(p.id);
    });
    if (data.length < 5000) break;
    offset += 5000;
  }

  console.log(`고유 organism: ${organisms.size}개\n`);

  // 정규화 매핑 생성
  const changes: { from: string; to: string; count: number }[] = [];
  for (const [original, ids] of organisms) {
    const normalized = normalize(original);
    if (normalized !== original) {
      changes.push({ from: original, to: normalized, count: ids.length });
    }
  }

  console.log(`변경 대상: ${changes.length}개\n`);
  changes.sort((a, b) => b.count - a.count);
  changes.forEach(c => {
    console.log(`  "${c.from}" → "${c.to}" (${c.count}건)`);
  });

  if (dryRun) {
    console.log(`\n(DRY-RUN — DB 변경 없음)`);
    return;
  }

  // UPDATE 실행
  console.log(`\n업데이트 실행...`);
  let updated = 0;
  for (const c of changes) {
    const { error } = await supabase
      .from('kbsi_protein')
      .update({ organism: c.to })
      .eq('organism', c.from);
    if (!error) updated += c.count;
    else console.log(`  에러: "${c.from}" →`, error.message);
  }

  console.log(`\n완료: ${updated}건 업데이트`);
  console.log(`키워드 테이블 재구축이 필요합니다: npx tsx scripts/rebuild-search-keywords.ts`);
}

main().catch(console.error);
