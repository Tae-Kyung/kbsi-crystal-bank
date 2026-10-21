/**
 * Provenance Backfill — source_id + DOI 커버리지 개선
 *
 * 1. Synthetic 결정화 레코드: notes에서 전략 ID 추출 → source_id 설정
 * 2. References: PMID → CrossRef API로 DOI 변환
 *
 * npx tsx scripts/backfill-provenance.ts              # 전체 실행
 * npx tsx scripts/backfill-provenance.ts --dry-run    # 미리보기만
 * npx tsx scripts/backfill-provenance.ts --doi-only   # DOI만
 * npx tsx scripts/backfill-provenance.ts --source-only # source_id만
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const doiOnly = args.includes('--doi-only');
const sourceOnly = args.includes('--source-only');

// ═══════════════════════════════════════════════════════
// 1. Synthetic source_id backfill
// ═══════════════════════════════════════════════════════
async function backfillSyntheticSourceId() {
  console.log('\n=== Synthetic source_id backfill ===');

  const BATCH = 1000;
  let total = 0;
  let updated = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('kbsi_crystallization')
      .select('id, notes')
      .eq('source_type', 'synthetic')
      .is('source_id', null)
      .range(offset, offset + BATCH - 1);

    if (error) { console.error('Query error:', error.message); break; }
    if (!data || data.length === 0) { hasMore = false; break; }

    total += data.length;

    // Parse notes to extract strategy ID
    const updates: { id: number; source_id: string }[] = [];
    for (const row of data) {
      const notes = row.notes || '';
      let sourceId = '';

      // Pattern: "RC: pH-1~2 (src 46154)"
      const srcMatch = notes.match(/\(src\s+(\d+)\)/);
      // Pattern: "Negative control: extreme low pH (원본 ID 5, pH 5.6)"
      const origMatch = notes.match(/원본\s*ID\s+(\d+)/);
      // Pattern: "NC strategy: ..."
      const stratMatch = notes.match(/^(RC|NC|Negative control):\s*(.+?)(?:\s*\(|$)/);

      if (srcMatch) {
        const strategy = notes.match(/^(RC|NC):\s*([^(]+)/)?.[2]?.trim() || 'synthetic';
        sourceId = `synth:${strategy.replace(/\s+/g, '_')}:src${srcMatch[1]}`;
      } else if (origMatch) {
        const strategy = notes.match(/Negative control:\s*(.+?)(?:\s*\(|$)/)?.[1]?.trim() || 'nc';
        sourceId = `synth:${strategy.replace(/\s+/g, '_')}:orig${origMatch[1]}`;
      } else if (stratMatch) {
        sourceId = `synth:${stratMatch[2].trim().replace(/\s+/g, '_')}:id${row.id}`;
      } else if (notes) {
        sourceId = `synth:unclassified:id${row.id}`;
      } else {
        sourceId = `synth:no_notes:id${row.id}`;
      }

      updates.push({ id: row.id, source_id: sourceId });
    }

    if (!dryRun && updates.length > 0) {
      // Batch update in chunks of 200
      for (let i = 0; i < updates.length; i += 200) {
        const chunk = updates.slice(i, i + 200);
        for (const u of chunk) {
          await supabase
            .from('kbsi_crystallization')
            .update({ source_id: u.source_id })
            .eq('id', u.id);
        }
        updated += chunk.length;
      }
    } else {
      updated += updates.length;
    }

    if (data.length < BATCH) { hasMore = false; }
    else { offset += BATCH; }

    if (total % 10000 === 0) {
      console.log(`  Progress: ${total.toLocaleString()} processed...`);
    }
  }

  console.log(`  Total synthetic without source_id: ${total.toLocaleString()}`);
  console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${updated.toLocaleString()}`);
}

// ═══════════════════════════════════════════════════════
// 2. DOI backfill via CrossRef
// ═══════════════════════════════════════════════════════
async function backfillDOI() {
  console.log('\n=== DOI backfill (PMID → CrossRef) ===');

  const { data: refs, error } = await supabase
    .from('kbsi_reference')
    .select('id, pmid, title')
    .not('pmid', 'is', null)
    .is('doi', null)
    .limit(1000);

  if (error) { console.error('Query error:', error.message); return; }
  if (!refs || refs.length === 0) {
    console.log('  No PMID-without-DOI records found.');
    return;
  }

  console.log(`  Found ${refs.length} references with PMID but no DOI`);

  let resolved = 0;
  let failed = 0;

  for (const ref of refs) {
    try {
      // Use NCBI E-utilities to get DOI from PMID
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ref.pmid}&retmode=json`;
      const res = await fetch(url);

      if (!res.ok) { failed++; continue; }

      const data = await res.json();
      const article = data?.result?.[ref.pmid];
      if (!article) { failed++; continue; }

      // Extract DOI from articleids
      const doiEntry = article.articleids?.find((a: any) => a.idtype === 'doi');
      if (!doiEntry?.value) { failed++; continue; }

      const doi = doiEntry.value;

      if (!dryRun) {
        await supabase
          .from('kbsi_reference')
          .update({ doi })
          .eq('id', ref.id);
      }

      resolved++;

      if (resolved % 50 === 0) {
        console.log(`  Progress: ${resolved} resolved...`);
      }

      // Rate limit: NCBI allows 3 req/sec without API key
      await new Promise(r => setTimeout(r, 350));

    } catch (err: any) {
      failed++;
    }
  }

  console.log(`  ${dryRun ? 'Would resolve' : 'Resolved'}: ${resolved} DOIs`);
  console.log(`  Failed/no DOI: ${failed}`);
}

// ═══════════════════════════════════════════════════════
// 3. DOI backfill via CrossRef title search
// ═══════════════════════════════════════════════════════
async function backfillDOIByTitle() {
  console.log('\n=== DOI backfill (Title → CrossRef) ===');

  const { data: refs, error } = await supabase
    .from('kbsi_reference')
    .select('id, title, journal, year')
    .is('doi', null)
    .is('pmid', null)
    .not('title', 'is', null)
    .not('journal', 'eq', 'To be published')
    .limit(1000);

  if (error) { console.error('Query error:', error.message); return; }
  if (!refs || refs.length === 0) {
    console.log('  No title-without-DOI records found.');
    return;
  }

  console.log(`  Found ${refs.length} references for title search`);

  let resolved = 0;
  let failed = 0;

  for (const ref of refs) {
    try {
      const title = encodeURIComponent(ref.title.substring(0, 200));
      const url = `https://api.crossref.org/works?query.title=${title}&rows=1&select=DOI,title`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'KBSI-CrystalBank/1.0 (mailto:admin@kbsi.re.kr)' }
      });

      if (!res.ok) { failed++; continue; }

      const data = await res.json();
      const items = data?.message?.items;
      if (!items || items.length === 0) { failed++; continue; }

      // Verify title similarity (simple check)
      const foundTitle = (items[0].title?.[0] || '').toLowerCase();
      const queryTitle = ref.title.toLowerCase();
      if (foundTitle.length > 10 && queryTitle.includes(foundTitle.substring(0, 30))) {
        const doi = items[0].DOI;
        if (!dryRun) {
          await supabase.from('kbsi_reference').update({ doi }).eq('id', ref.id);
        }
        resolved++;
      } else {
        failed++;
      }

      if (resolved % 50 === 0 && resolved > 0) {
        console.log(`  Progress: ${resolved} resolved...`);
      }

      // CrossRef rate limit: be polite
      await new Promise(r => setTimeout(r, 500));

    } catch {
      failed++;
    }
  }

  console.log(`  ${dryRun ? 'Would resolve' : 'Resolved'}: ${resolved} DOIs`);
  console.log(`  Failed/no match: ${failed}`);
}

// ═══════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════
async function main() {
  console.log('Provenance Backfill' + (dryRun ? ' (DRY RUN)' : ''));

  if (!doiOnly) await backfillSyntheticSourceId();
  if (!sourceOnly) {
    await backfillDOI();
    await backfillDOIByTitle();
  }

  console.log('\nDone.');
}

main().catch(console.error);
