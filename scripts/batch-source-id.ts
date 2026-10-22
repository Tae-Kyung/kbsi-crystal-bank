/**
 * Batch source_id backfill — Promise.all 병렬 처리
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  console.log('Batch source_id backfill\n');

  let totalUpdated = 0;
  let round = 0;

  while (true) {
    round++;
    const { data: batch } = await supabase
      .from('kbsi_crystallization')
      .select('id, notes')
      .eq('source_type', 'synthetic')
      .is('source_id', null)
      .limit(2000)
      .order('id');

    if (!batch || batch.length === 0) break;

    // Parse and prepare updates
    const updates = batch.map(row => {
      const notes = row.notes || '';
      const srcMatch = notes.match(/\(src\s+(\d+)\)/);
      const origMatch = notes.match(/원본\s*ID\s+(\d+)/);

      let strategy = notes
        .replace(/\(src\s+\d+\)/, '')
        .replace(/\(원본\s*ID\s+\d+.*?\)/, '')
        .replace(/^RC:\s*/, '')
        .replace(/^NC:\s*/, '')
        .replace(/^Negative control:\s*/i, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[,.'°→]/g, '')
        .substring(0, 40) || 'unclassified';

      const ref = srcMatch ? `src${srcMatch[1]}` : origMatch ? `orig${origMatch[1]}` : `id${row.id}`;
      return { id: row.id, source_id: `synth:${strategy}:${ref}` };
    });

    // Fire 200 concurrent updates
    const CONCURRENCY = 200;
    for (let i = 0; i < updates.length; i += CONCURRENCY) {
      const chunk = updates.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(u =>
        supabase.from('kbsi_crystallization').update({ source_id: u.source_id }).eq('id', u.id)
      ));
    }

    totalUpdated += batch.length;
    if (round % 5 === 0 || batch.length < 2000) {
      console.log(`  Round ${round}: ${totalUpdated.toLocaleString()} total`);
    }
  }

  console.log(`\nDone. Total updated: ${totalUpdated.toLocaleString()}`);

  const { count } = await supabase
    .from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'synthetic')
    .is('source_id', null);
  console.log(`Remaining: ${count?.toLocaleString()}`);
}

main().catch(console.error);
