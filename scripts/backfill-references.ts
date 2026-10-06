/**
 * PDB primary citation → kbsi_reference 등록 + kbsi_structure.reference_id 연결
 *
 * npx tsx scripts/backfill-references.ts [옵션]
 *   --limit 1000     처리 건수 (기본: 전체)
 *   --offset 0       시작 오프셋 (기본: 0)
 *   --dry-run        미리보기
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
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const offsetIdx = args.indexOf('--offset');
  const startOffset = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) : 0;
  const dryRun = args.includes('--dry-run');

  console.log(`=== reference backfill (PDB primary citation) ===`);
  console.log(`limit: ${limit === Infinity ? '전체' : limit}, offset: ${startOffset}, dry-run: ${dryRun}\n`);

  // 1. reference_id가 NULL인 PDB structure 조회 (paginate)
  let records: { id: number; pdb_id: string }[] = [];
  let offset = startOffset;
  while (records.length < limit) {
    const { data, error } = await supabase
      .from('kbsi_structure')
      .select('id, pdb_id')
      .not('pdb_id', 'is', null)
      .is('reference_id', null)
      .order('id')
      .range(offset, offset + 999);
    if (error) { console.error('조회 에러:', error.message); break; }
    if (!data || data.length === 0) break;
    records = records.concat(data as any);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (limit !== Infinity) records = records.slice(0, limit);
  console.log(`대상: ${records.length}건\n`);

  // DOI → reference_id 캐시 (중복 방지)
  const doiCache = new Map<string, number>();

  let created = 0, linked = 0, skipped = 0, failed = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      // 2. PDB API에서 primary citation 가져오기
      const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${r.pdb_id}`, {
        headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
      });
      if (!res.ok) { skipped++; await sleep(200); continue; }
      const entry = await res.json();
      const cit = entry.rcsb_primary_citation;
      if (!cit) { skipped++; await sleep(200); continue; }

      const title = cit.title || null;
      const authors = Array.isArray(cit.rcsb_authors) ? cit.rcsb_authors.join(', ') : null;
      const year = cit.year || null;
      const doi = cit.pdbx_database_id_DOI || null;
      const pmid = cit.pdbx_database_id_PubMed ? String(cit.pdbx_database_id_PubMed) : null;
      const journal = cit.rcsb_journal_abbrev || null;

      // title도 없고 doi도 없으면 skip
      if (!title && !doi) { skipped++; await sleep(200); continue; }

      let refId: number | null = null;

      if (dryRun) {
        console.log(`  [DRY] ${r.pdb_id}: "${(title || '').substring(0, 60)}..." doi=${doi}`);
        created++;
        linked++;
      } else {
        // 3. DOI로 중복 체크 (캐시 → DB)
        if (doi && doiCache.has(doi)) {
          refId = doiCache.get(doi)!;
        } else if (doi) {
          const { data: existing } = await supabase
            .from('kbsi_reference')
            .select('id')
            .eq('doi', doi)
            .limit(1)
            .maybeSingle();
          if (existing) {
            refId = existing.id as number;
            doiCache.set(doi, refId);
          }
        }

        // 4. INSERT 새 reference
        if (!refId) {
          const { data: inserted, error: insErr } = await supabase
            .from('kbsi_reference')
            .insert({ title, authors, year, doi, pmid, journal })
            .select('id')
            .single();
          if (insErr) {
            console.error(`  INSERT 에러 (${r.pdb_id}):`, insErr.message);
            failed++;
            await sleep(200);
            continue;
          }
          refId = inserted.id as number;
          if (doi) doiCache.set(doi, refId);
          created++;
        }

        // 5. UPDATE structure
        const { error: updErr } = await supabase
          .from('kbsi_structure')
          .update({ reference_id: refId })
          .eq('id', r.id);
        if (updErr) {
          console.error(`  UPDATE 에러 (structure ${r.id}):`, updErr.message);
          failed++;
        } else {
          linked++;
        }
      }
    } catch (e: any) {
      console.error(`  예외 (${r.pdb_id}):`, e.message);
      failed++;
    }

    await sleep(200);

    if ((i + 1) % 100 === 0) {
      console.log(`[${i + 1}/${records.length}] created: ${created}, linked: ${linked}, skipped: ${skipped}, failed: ${failed}`);
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`created: ${created}, linked: ${linked}, skipped: ${skipped}, failed: ${failed}`);
}

main().catch(console.error);
