/**
 * Lab PG → Supabase CDC 기반 동기화 (Standby Backup)
 *
 * CDC (Change Data Capture): kbsi_sync_changelog 테이블에 기록된 변경사항을
 * Supabase에 재생 (replay)
 *
 * Usage:
 *   npx tsx scripts/sync-to-supabase.ts              # CDC 기반 동기화
 *   npx tsx scripts/sync-to-supabase.ts --dry-run    # 미리보기
 *   npx tsx scripts/sync-to-supabase.ts --full       # 전체 동기화 (CDC 무시)
 *   npx tsx scripts/sync-to-supabase.ts --table=kbsi_protein --full
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pgClient = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 500;

async function syncViaCDC(dryRun: boolean): Promise<number> {
  // Fetch unsynced changes
  const changes = await pgClient.query(
    `SELECT id, table_name, record_id, action, row_data
     FROM kbsi_sync_changelog
     WHERE synced_at IS NULL
     ORDER BY id
     LIMIT 10000`
  );

  if (changes.rows.length === 0) {
    console.log('No pending changes');
    return 0;
  }

  console.log(`Found ${changes.rows.length} pending changes`);

  // Group by table + action for batch processing
  let synced = 0;
  let failed = 0;
  const syncedIds: number[] = [];

  for (let i = 0; i < changes.rows.length; i += BATCH_SIZE) {
    const batch = changes.rows.slice(i, i + BATCH_SIZE);

    // Group by table
    const byTable: Record<string, typeof batch> = {};
    for (const row of batch) {
      if (!byTable[row.table_name]) byTable[row.table_name] = [];
      byTable[row.table_name].push(row);
    }

    for (const [table, rows] of Object.entries(byTable)) {
      const inserts = rows.filter(r => r.action === 'INSERT' || r.action === 'UPDATE');
      const deletes = rows.filter(r => r.action === 'DELETE');

      // Upsert inserts/updates — strip 'id' for GENERATED ALWAYS columns
      if (inserts.length > 0 && !dryRun) {
        const data = inserts.map(r => {
          const row = { ...r.row_data };
          delete row.id; // Supabase GENERATED ALWAYS rejects explicit id
          return row;
        });
        // Try without id first, fallback with id for tables that need it
        let { error } = await supabase.from(table).upsert(data, { onConflict: 'id', ignoreDuplicates: true });
        if (error?.message?.includes('non-DEFAULT')) {
          // Table doesn't allow id override — insert without conflict handling
          const result = await supabase.from(table).insert(data);
          error = result.error;
          if (error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
            // Already exists, skip
            error = null;
          }
        }
        if (error) {
          console.error(`  UPSERT ${table} (${inserts.length}): ${error.message}`);
          failed += inserts.length;
          continue;
        }
      }

      // Delete
      if (deletes.length > 0 && !dryRun) {
        const ids = deletes.map(r => r.record_id);
        const { error } = await supabase.from(table).delete().in('id', ids);
        if (error) {
          console.error(`  DELETE ${table} (${deletes.length}): ${error.message}`);
          failed += deletes.length;
          continue;
        }
      }

      synced += inserts.length + deletes.length;
      syncedIds.push(...rows.map(r => r.id));

      if (dryRun) {
        console.log(`  [DRY] ${table}: ${inserts.length} upsert, ${deletes.length} delete`);
      }
    }

    if ((i + BATCH_SIZE) % 2000 === 0) {
      process.stdout.write(`  Synced: ${synced} / ${changes.rows.length}\r`);
    }
  }

  // Mark as synced
  if (!dryRun && syncedIds.length > 0) {
    await pgClient.query(
      'UPDATE kbsi_sync_changelog SET synced_at = now() WHERE id = ANY($1)',
      [syncedIds]
    );
  }

  console.log(`\nResult: ${synced} synced, ${failed} failed`);
  return synced;
}

async function fullSync(tableFilter: string | null, dryRun: boolean): Promise<number> {
  const tables = tableFilter
    ? [tableFilter]
    : [
        'kbsi_reference', 'kbsi_protein', 'kbsi_database_id', 'kbsi_construct',
        'kbsi_mutation', 'kbsi_ligand', 'kbsi_construct_ligand',
        'kbsi_expression', 'kbsi_purification', 'kbsi_characterization',
        'kbsi_crystallization', 'kbsi_diffraction', 'kbsi_structure',
        'kbsi_nmr_experiment', 'kbsi_nmr_spectrum',
        'kbsi_precipitant_lookup', 'kbsi_screening_kit', 'kbsi_featured_protein',
      ];

  let totalSynced = 0;

  for (const table of tables) {
    // Compare counts
    const pgCount = parseInt((await pgClient.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count);
    const { count: sbCount } = await supabase.from(table).select('id', { count: 'exact', head: true });
    const sbTotal = sbCount ?? 0;

    if (pgCount === sbTotal) {
      console.log(`  ${table.padEnd(30)} up to date (${pgCount})`);
      continue;
    }

    console.log(`  ${table.padEnd(30)} PG=${pgCount} SB=${sbTotal} (diff=${pgCount - sbTotal})`);

    if (dryRun) {
      totalSynced += pgCount - sbTotal;
      continue;
    }

    // Find max id in Supabase
    const { data: maxRow } = await supabase.from(table).select('id').order('id', { ascending: false }).limit(1);
    const maxId = maxRow?.[0]?.id ?? 0;

    let lastId = maxId;
    let tableSynced = 0;

    while (true) {
      const res = await pgClient.query(
        `SELECT * FROM ${table} WHERE id > $1 ORDER BY id LIMIT $2`,
        [lastId, BATCH_SIZE]
      );
      if (res.rows.length === 0) break;

      // Strip id for GENERATED ALWAYS columns, then insert
      const rows = res.rows.map((r: any) => { const copy = { ...r }; delete copy.id; return copy; });
      let { error } = await supabase.from(table).insert(rows);
      if (error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
        // Already exists — try upsert without id
        error = null; // skip duplicates
      }
      if (error) {
        console.error(`  ERROR ${table}: ${error.message}`);
        break;
      }

      tableSynced += res.rows.length;
      lastId = res.rows[res.rows.length - 1].id;

      if (tableSynced % 5000 < BATCH_SIZE) {
        process.stdout.write(`    ${table}: ${tableSynced.toLocaleString()}\r`);
      }

      if (res.rows.length < BATCH_SIZE) break;
    }

    if (tableSynced > 0) console.log(`    ${table}: ${tableSynced.toLocaleString()} synced`);
    totalSynced += tableSynced;
  }

  return totalSynced;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fullMode = args.includes('--full');
  const tableFilter = args.find(a => a.startsWith('--table='))?.split('=')[1] || null;

  await pgClient.connect();
  console.log('Connected to Lab PG\n');

  if (dryRun) console.log('=== DRY RUN ===\n');

  const start = Date.now();
  let synced: number;

  if (fullMode) {
    console.log('Mode: Full Sync');
    synced = await fullSync(tableFilter, dryRun);
  } else {
    console.log('Mode: CDC (Change Data Capture)');
    synced = await syncViaCDC(dryRun);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone: ${synced.toLocaleString()} rows in ${elapsed}s`);

  await pgClient.end();
}

main().catch(e => { console.error(e); process.exit(1); });
