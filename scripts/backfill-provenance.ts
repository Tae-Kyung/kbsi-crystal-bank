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

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const doiOnly = args.includes('--doi-only');
const sourceOnly = args.includes('--source-only');

async function backfillSyntheticSourceId() {
  console.log('\n=== Synthetic source_id backfill ===');

  const BATCH = 1000;
  let total = 0;
  let updated = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { rows: data } = await client.query(
      `SELECT id, notes FROM kbsi_crystallization
       WHERE source_type = $1 AND source_id IS NULL
       ORDER BY id OFFSET $2 LIMIT $3`,
      ['synthetic', offset, BATCH]
    );

    if (!data || data.length === 0) { hasMore = false; break; }

    total += data.length;

    const updates: { id: number; source_id: string }[] = [];
    for (const row of data) {
      const notes = row.notes || '';
      let sourceId = '';

      const srcMatch = notes.match(/\(src\s+(\d+)\)/);
      const origMatch = notes.match(/원본\s*ID\s+(\d+)/);

      if (srcMatch) {
        const strategy = notes.match(/^(RC|NC):\s*([^(]+)/)?.[2]?.trim() || 'synthetic';
        sourceId = `synth:${strategy.replace(/\s+/g, '_')}:src${srcMatch[1]}`;
      } else if (origMatch) {
        const strategy = notes.match(/Negative control:\s*(.+?)(?:\s*\(|$)/)?.[1]?.trim() || 'nc';
        sourceId = `synth:${strategy.replace(/\s+/g, '_')}:orig${origMatch[1]}`;
      } else if (notes) {
        sourceId = `synth:unclassified:id${row.id}`;
      } else {
        sourceId = `synth:no_notes:id${row.id}`;
      }

      updates.push({ id: row.id, source_id: sourceId });
    }

    if (!dryRun && updates.length > 0) {
      for (let i = 0; i < updates.length; i += 200) {
        const chunk = updates.slice(i, i + 200);
        for (const u of chunk) {
          await client.query(
            'UPDATE kbsi_crystallization SET source_id = $1 WHERE id = $2',
            [u.source_id, u.id]
          );
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

async function backfillDOI() {
  console.log('\n=== DOI backfill (PMID → CrossRef) ===');

  const { rows: refs } = await client.query(
    `SELECT id, pmid, title FROM kbsi_reference
     WHERE pmid IS NOT NULL AND doi IS NULL LIMIT 1000`
  );

  if (!refs || refs.length === 0) {
    console.log('  No PMID-without-DOI records found.');
    return;
  }

  console.log(`  Found ${refs.length} references with PMID but no DOI`);

  let resolved = 0;
  let failed = 0;

  for (const ref of refs) {
    try {
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ref.pmid}&retmode=json`;
      const res = await fetch(url);

      if (!res.ok) { failed++; continue; }

      const data = await res.json();
      const article = data?.result?.[ref.pmid];
      if (!article) { failed++; continue; }

      const doiEntry = article.articleids?.find((a: any) => a.idtype === 'doi');
      if (!doiEntry?.value) { failed++; continue; }

      const doi = doiEntry.value;

      if (!dryRun) {
        await client.query('UPDATE kbsi_reference SET doi = $1 WHERE id = $2', [doi, ref.id]);
      }

      resolved++;

      if (resolved % 50 === 0) {
        console.log(`  Progress: ${resolved} resolved...`);
      }

      await new Promise(r => setTimeout(r, 350));

    } catch (err: any) {
      failed++;
    }
  }

  console.log(`  ${dryRun ? 'Would resolve' : 'Resolved'}: ${resolved} DOIs`);
  console.log(`  Failed/no DOI: ${failed}`);
}

async function backfillDOIByTitle() {
  console.log('\n=== DOI backfill (Title → CrossRef) ===');

  const { rows: refs } = await client.query(
    `SELECT id, title, journal, year FROM kbsi_reference
     WHERE doi IS NULL AND pmid IS NULL AND title IS NOT NULL AND journal != $1
     LIMIT 1000`,
    ['To be published']
  );

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

      const foundTitle = (items[0].title?.[0] || '').toLowerCase();
      const queryTitle = ref.title.toLowerCase();
      if (foundTitle.length > 10 && queryTitle.includes(foundTitle.substring(0, 30))) {
        const doi = items[0].DOI;
        if (!dryRun) {
          await client.query('UPDATE kbsi_reference SET doi = $1 WHERE id = $2', [doi, ref.id]);
        }
        resolved++;
      } else {
        failed++;
      }

      if (resolved % 50 === 0 && resolved > 0) {
        console.log(`  Progress: ${resolved} resolved...`);
      }

      await new Promise(r => setTimeout(r, 500));

    } catch {
      failed++;
    }
  }

  console.log(`  ${dryRun ? 'Would resolve' : 'Resolved'}: ${resolved} DOIs`);
  console.log(`  Failed/no match: ${failed}`);
}

async function main() {
  await client.connect();
  try {
    console.log('Provenance Backfill' + (dryRun ? ' (DRY RUN)' : ''));

    if (!doiOnly) await backfillSyntheticSourceId();
    if (!sourceOnly) {
      await backfillDOI();
      await backfillDOIByTitle();
    }

    console.log('\nDone.');
  } finally {
    await client.end();
  }
}

main().catch(console.error);
