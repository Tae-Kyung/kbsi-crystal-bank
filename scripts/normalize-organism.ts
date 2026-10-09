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
  let n = name.trim().replace(/\s+/g, ' ');

  // 1. 전체 대문자 → 속명 대문자 + 종명 소문자 + 나머지 원본
  if (n === n.toUpperCase() && n.length > 3) {
    const words = n.split(' ');
    if (words.length >= 2) {
      words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      words[1] = words[1].toLowerCase();
      // 3번째 이후는 원본 대문자 유지 (균주명)
      n = words.join(' ');
    } else {
      n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
    }
  }

  // 2. 전체 소문자 → 첫 글자만 대문자
  if (n === n.toLowerCase() && n.length > 3) {
    n = n.charAt(0).toUpperCase() + n.slice(1);
  }

  // 3. 약어 치환
  const lower = n.toLowerCase();
  for (const [abbr, full] of Object.entries(ABBREVIATION_MAP)) {
    if (lower === abbr) return full;
    if (lower.startsWith(abbr + ' ')) {
      return full + n.slice(abbr.length);
    }
  }

  // 4. 앞뒤 공백 제거 (다시)
  n = n.trim();

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
      .order('id')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach((p: any) => {
      if (!organisms.has(p.organism)) organisms.set(p.organism, []);
      organisms.get(p.organism)!.push(p.id);
    });
    if (data.length < 1000) break;
    offset += 1000;
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

  // UPDATE — organism_normalized에 저장 (원본 organism 보존)
  console.log(`\n업데이트 실행 (organism_normalized)...`);
  let updated = 0;

  // 먼저 변경 없는 것도 organism_normalized에 복사
  const { error: copyErr } = await supabase.rpc('', undefined).then(() => ({})).catch(() => ({})) as any;
  // 모든 protein에 대해 organism_normalized 설정
  let updateOffset = 0;
  while (true) {
    const { data } = await supabase
      .from('kbsi_protein')
      .select('id, organism')
      .not('organism', 'is', null)
      .is('organism_normalized', null)
      .order('id')
      .range(updateOffset, updateOffset + 999);
    if (!data || data.length === 0) break;
    for (const p of data) {
      const normalized = normalize(p.organism);
      await supabase.from('kbsi_protein').update({ organism_normalized: normalized }).eq('id', p.id);
      updated++;
    }
    if (data.length < 1000) break;
    updateOffset += 1000;
    if (updated % 5000 === 0) console.log(`  ${updated}건...`);
  }

  console.log(`\n완료: ${updated}건 organism_normalized 설정`);
  console.log(`원본 organism은 보존됨`);
}

main().catch(console.error);
