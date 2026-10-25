/**
 * Batch source_id backfill — Promise.all 병렬 처리
 */
import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  try {
    console.log('Batch source_id backfill\n');

    let totalUpdated = 0;
    let round = 0;

    while (true) {
      round++;
      const { rows: batch } = await client.query(
        `SELECT id, notes FROM kbsi_crystallization
         WHERE source_type = $1 AND source_id IS NULL
         ORDER BY id LIMIT 2000`,
        ['synthetic']
      );

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
          client.query('UPDATE kbsi_crystallization SET source_id = $1 WHERE id = $2', [u.source_id, u.id])
        ));
      }

      totalUpdated += batch.length;
      if (round % 5 === 0 || batch.length < 2000) {
        console.log(`  Round ${round}: ${totalUpdated.toLocaleString()} total`);
      }
    }

    console.log(`\nDone. Total updated: ${totalUpdated.toLocaleString()}`);

    const { rows: [{ count }] } = await client.query(
      `SELECT COUNT(*) as count FROM kbsi_crystallization WHERE source_type = $1 AND source_id IS NULL`,
      ['synthetic']
    );
    console.log(`Remaining: ${parseInt(count).toLocaleString()}`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
