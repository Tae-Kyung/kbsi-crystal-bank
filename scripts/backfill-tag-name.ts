/**
 * tag_name Backfill — 서열 패턴 + 이름 패턴으로 태그 자동 감지
 *
 * seq_final에서 His-tag (HHHHHH), GST, MBP, SUMO 등의 서열 시그니처를 찾고,
 * construct/protein 이름에서도 태그 키워드를 감지하여 tag_name/tag_position 업데이트
 *
 * npx tsx scripts/backfill-tag-name.ts [--dry-run] [--limit N]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TagResult {
  tag: string;
  position: 'N-terminal' | 'C-terminal' | 'unknown';
}

// ─── 서열 패턴 기반 태그 감지 ───
function detectTagFromSequence(seq: string): TagResult | null {
  if (!seq || seq.length < 20) return null;

  const head = seq.slice(0, 60);
  const tail = seq.slice(-30);

  // His-tag: 6+ consecutive H
  if (/^M?[A-Z]{0,30}H{6,}/.test(head)) {
    const match = head.match(/H{6,}/);
    const len = match ? match[0].length : 6;
    return { tag: `His${len}`, position: 'N-terminal' };
  }
  if (/H{6,}[A-Z]{0,5}$/.test(tail)) {
    const match = tail.match(/H{6,}/);
    const len = match ? match[0].length : 6;
    return { tag: `His${len}`, position: 'C-terminal' };
  }

  // GST (Glutathione S-transferase) N-terminal signature
  // Schistosoma japonicum GST: starts with MSPILGYWKIKGLVQPTRLLLEYL
  if (seq.startsWith('MSPILGYWKIKGLVQPTR') || seq.startsWith('MSPILGYWKIKGL')) {
    return { tag: 'GST', position: 'N-terminal' };
  }

  // MBP (Maltose-Binding Protein) N-terminal signature
  // E. coli MBP: starts with MKIEEGKLVIWINGDKGYNGLAEV
  if (seq.startsWith('MKIEEGKLVIWIN') || seq.startsWith('MKIEEGKLVI')) {
    return { tag: 'MBP', position: 'N-terminal' };
  }

  // SUMO tag signature (human SUMO1): MSDQEAKPSTEDLGDKKEGEYIKLKVIGQDSSEIHFKVKMTTHLKKLKESYCQ
  if (seq.slice(0, 50).includes('SDQEAKPSTEDLG') || seq.slice(0, 50).includes('HINLKVAGQDGSVVQFKIKRHTPLSKLMK')) {
    return { tag: 'SUMO', position: 'N-terminal' };
  }

  // Thioredoxin (Trx) tag: MSDKIIHLTDDSFDTDVLKADGAILVDFWAEWCGPCKMIAPILDEIADEYQGK
  if (seq.startsWith('MSDKIIHLTDDSF') || seq.startsWith('MSDKIIHL')) {
    return { tag: 'Trx', position: 'N-terminal' };
  }

  // BRIL (apocytochrome b562): fusion for GPCR crystallization
  // Signature: ADLEDNMETLNDNLKVIEKADNAAQVKDALTKMRAAALDAQKATPPKLEDKS
  if (seq.includes('ADLEDNMETLNDNLKVIEK')) {
    return { tag: 'BRIL', position: 'unknown' };
  }

  // Strep-tag II: WSHPQFEK at C-terminal
  if (tail.includes('WSHPQFEK')) {
    return { tag: 'Strep-II', position: 'C-terminal' };
  }
  if (head.includes('WSHPQFEK')) {
    return { tag: 'Strep-II', position: 'N-terminal' };
  }

  // FLAG tag: DYKDDDDK
  if (head.includes('DYKDDDDK')) {
    return { tag: 'FLAG', position: 'N-terminal' };
  }
  if (tail.includes('DYKDDDDK')) {
    return { tag: 'FLAG', position: 'C-terminal' };
  }

  return null;
}

// ─── 이름 패턴 기반 태그 감지 (fallback) ───
function detectTagFromName(constructName: string, proteinName: string): TagResult | null {
  const text = `${constructName} ${proteinName}`.toLowerCase();

  const patterns: [RegExp, string, TagResult['position']][] = [
    [/his.?tag|his6|6.?his|hexahis|histidine.?tag|poly.?his|\bhis\b.{0,5}tag/, 'His6', 'N-terminal'],
    [/\bgst\b/, 'GST', 'N-terminal'],
    [/\bmbp\b/, 'MBP', 'N-terminal'],
    [/\bsumo\b/, 'SUMO', 'N-terminal'],
    [/\bstrep\b|strep.?tag|strep.?ii/, 'Strep', 'C-terminal'],
    [/\bflag\b/, 'FLAG', 'N-terminal'],
    [/\bgfp\b|green.fluoresc|egfp|sfgfp/, 'GFP', 'N-terminal'],
    [/\btrx\b|thioredoxin/, 'Trx', 'N-terminal'],
    [/\bbril\b/, 'BRIL', 'unknown'],
    [/\bmcherry\b/, 'mCherry', 'N-terminal'],
    [/\bt4.?lysozyme\b|t4l/, 'T4L', 'unknown'],
  ];

  for (const [regex, tag, position] of patterns) {
    if (regex.test(text)) return { tag, position };
  }

  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;

  console.log(`=== tag_name Backfill (서열+이름 패턴) ===`);
  console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}\n`);

  // tag_name NULL인 construct 로드
  let constructs: any[] = [];
  let offset = 0;
  while (constructs.length < (limit === Infinity ? 999999 : limit)) {
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, name, seq_final, kbsi_protein(full_name)')
      .is('tag_name', null)
      .order('id')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    constructs.push(...data);
    if (offset % 50000 === 0 && offset > 0) console.log(`  로딩: ${constructs.length}건...`);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (limit !== Infinity) constructs = constructs.slice(0, limit);
  console.log(`대상 construct: ${constructs.length}건\n`);

  const tagDist: Record<string, number> = {};
  const methodDist = { sequence: 0, name: 0 };
  let updated = 0;

  for (let i = 0; i < constructs.length; i++) {
    const c = constructs[i];
    const seq = c.seq_final || '';
    const cName = c.name || '';
    const pName = c.kbsi_protein?.full_name || '';

    // 서열 패턴 우선, 이름 패턴 fallback
    let result = detectTagFromSequence(seq);
    if (result) {
      methodDist.sequence++;
    } else {
      result = detectTagFromName(cName, pName);
      if (result) methodDist.name++;
    }

    if (!result) continue;

    tagDist[result.tag] = (tagDist[result.tag] || 0) + 1;

    if (!dryRun) {
      await supabase
        .from('kbsi_construct')
        .update({ tag_name: result.tag, tag_position: result.position })
        .eq('id', c.id);
    }
    updated++;

    if ((i + 1) % 50000 === 0) {
      console.log(`  [${i + 1}/${constructs.length}] updated: ${updated}`);
    }
  }

  console.log(`\n${'='.repeat(55)}`);
  console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
  console.log(`  태그 감지: ${updated}건 / ${constructs.length}건 (${(updated / constructs.length * 100).toFixed(1)}%)`);
  console.log(`  감지 방법: 서열 ${methodDist.sequence}건, 이름 ${methodDist.name}건`);
  console.log(`  태그 분포:`);
  for (const [tag, count] of Object.entries(tagDist).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${tag}: ${count.toLocaleString()}`);
  }
  console.log('='.repeat(55));
}

main().catch(console.error);
