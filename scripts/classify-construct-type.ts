/**
 * construct_type 자동 분류 — full_name 패턴 분석
 * + tag_name 추출 (이름에서 His, GST 등 감지)
 *
 * npx tsx scripts/classify-construct-type.ts [--dry-run] [--limit N]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// construct_type 분류 규칙
function classifyType(name: string, fullName: string): string | null {
  const text = `${name} ${fullName}`.toLowerCase();
  if (text.includes('mutant') || text.includes('variant') || text.includes('mutation') || /[A-Z]\d+[A-Z]/.test(name)) return 'mutant';
  if (text.includes('domain') || text.includes('catalytic') || text.includes('kinase domain') || text.includes('binding domain')) return 'domain';
  if (text.includes('truncat') || text.includes('fragment') || text.includes('n-terminal') || text.includes('c-terminal')) return 'truncation';
  if (text.includes('fusion') || text.includes('chimera') || text.includes('hybrid')) return 'fusion';
  return 'full-length';
}

// tag_name 추출
function extractTag(name: string, fullName: string): { tag: string; position: string } | null {
  const text = `${name} ${fullName}`.toLowerCase();
  if (text.includes('his6') || text.includes('his-tag') || text.includes('6xhis') || text.includes('hexahis') || text.includes('his tag')) return { tag: 'His6', position: 'N-terminal' };
  if (text.includes('gst')) return { tag: 'GST', position: 'N-terminal' };
  if (text.includes('mbp')) return { tag: 'MBP', position: 'N-terminal' };
  if (text.includes('sumo')) return { tag: 'SUMO', position: 'N-terminal' };
  if (text.includes('strep')) return { tag: 'Strep', position: 'C-terminal' };
  if (text.includes('flag')) return { tag: 'FLAG', position: 'N-terminal' };
  if (text.includes('thioredoxin') || text.includes('trx')) return { tag: 'Trx', position: 'N-terminal' };
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;

  console.log(`=== Construct Type 자동 분류 + Tag 추출 ===`);
  console.log(`dry-run: ${dryRun}, limit: ${limit === Infinity ? '전체' : limit}\n`);

  // construct_type이 NULL이거나 full-length인 것 대상
  let constructs: any[] = [];
  let offset = 0;
  while (constructs.length < limit) {
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, name, protein_id, construct_type, tag_name, kbsi_protein(full_name)')
      .or('construct_type.is.null,construct_type.eq.full-length')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    constructs.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (limit !== Infinity) constructs = constructs.slice(0, limit);
  console.log(`대상: ${constructs.length}건\n`);

  let typeUpdated = 0;
  let tagUpdated = 0;
  const typeDist: Record<string, number> = {};

  for (let i = 0; i < constructs.length; i++) {
    const c = constructs[i];
    const cName = c.name || '';
    const pName = c.kbsi_protein?.full_name || '';

    const cType = classifyType(cName, pName);
    const tagInfo = c.tag_name ? null : extractTag(cName, pName);

    if (cType) typeDist[cType] = (typeDist[cType] || 0) + 1;

    if (!dryRun && (cType || tagInfo)) {
      const update: any = {};
      if (cType) update.construct_type = cType;
      if (tagInfo) { update.tag_name = tagInfo.tag; update.tag_position = tagInfo.position; }
      await supabase.from('kbsi_construct').update(update).eq('id', c.id);
      if (cType) typeUpdated++;
      if (tagInfo) tagUpdated++;
    } else {
      if (cType) typeUpdated++;
      if (tagInfo) tagUpdated++;
    }

    if ((i + 1) % 10000 === 0) {
      console.log(`  [${i + 1}/${constructs.length}] type: ${typeUpdated}, tag: ${tagUpdated}`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료 ${dryRun ? '(DRY-RUN)' : ''}`);
  console.log(`  construct_type 분류: ${typeUpdated}건`);
  console.log(`  tag_name 추출: ${tagUpdated}건`);
  console.log(`  타입 분포:`, typeDist);
  console.log('═'.repeat(50));
}

main().catch(console.error);
