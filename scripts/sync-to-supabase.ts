/**
 * Lab PG → Supabase 증분 동기화 (Standby Backup)
 *
 * Usage:
 *   npx tsx scripts/sync-to-supabase.ts              # 전체 동기화
 *   npx tsx scripts/sync-to-supabase.ts --since=6h   # 최근 6시간
 *   npx tsx scripts/sync-to-supabase.ts --dry-run    # 미리보기
 *   npx tsx scripts/sync-to-supabase.ts --table=kbsi_protein  # 특정 테이블
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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

const STATE_FILE = resolve(__dirname, '..', 'data', 'sync-state.json');
const BATCH_SIZE = 500;

// Tables with updated_at (syncable)
const SYNC_TABLES = [
  'kbsi_protein',
  'kbsi_construct',
  'kbsi_expression',
  'kbsi_purification',
  'kbsi_characterization',
  'kbsi_storage',
  'kbsi_crystallization',
  'kbsi_diffraction',
  'kbsi_nmr_experiment',
  'kbsi_cryoem_session',
  'kbsi_structure',
];

// Tables without updated_at (full sync by id)
const STATIC_TABLES = [
  'kbsi_reference',
  'kbsi_database_id',
  'kbsi_mutation',
  'kbsi_ligand',
  'kbsi_construct_ligand',
  'kbsi_nmr_spectrum',
  'kbsi_nmr_chemical_shift',
  'kbsi_precipitant_lookup',
  'kbsi_screening_kit',
  'kbsi_featured_protein',
  'kbsi_search_keywords',
];

interface SyncState {
  [table: string]: {
    lastSyncAt: string;
    lastMaxId: number;
    rowsSynced: number;
  };
}

function loadState(): SyncState {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }
  return {};
}

function saveState(state: SyncState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function parseSince(since: string): Date {
  const match = since.match(/^(\d+)(h|d|m)$/);
  if (!match) return new Date(0);
  const [, num, unit] = match;
  const ms = unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : 60000;
  return new Date(Date.now() - parseInt(num) * ms);
}

async function syncTable(
  table: string,
  since: Date,
  hasUpdatedAt: boolean,
  dryRun: boolean
): Promise<number> {
  let synced = 0;

  if (hasUpdatedAt) {
    // Incremental: fetch rows updated after `since`
    let lastId = 0;
    while (true) {
      const res = await pgClient.query(
        `SELECT * FROM ${table} WHERE updated_at >= $1 AND id > $2 ORDER BY id LIMIT $3`,
        [since.toISOString(), lastId, BATCH_SIZE]
      );
      if (res.rows.length === 0) break;

      if (!dryRun) {
        // Upsert to Supabase
        const { error } = await supabase.from(table).upsert(res.rows, { onConflict: 'id' });
        if (error) {
          console.error(`  ERROR ${table}: ${error.message}`);
          break;
        }
      }

      synced += res.rows.length;
      lastId = res.rows[res.rows.length - 1].id;

      if (res.rows.length < BATCH_SIZE) break;
    }
  } else {
    // Static tables: sync by max id gap
    const sbCount = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true });
    const sbTotal = sbCount.count ?? 0;

    const pgCount = await pgClient.query(`SELECT COUNT(*) FROM ${table}`);
    const pgTotal = parseInt(pgCount.rows[0].count);

    if (pgTotal <= sbTotal) return 0; // Already synced

    // Fetch new rows (id > supabase max)
    const sbMax = await supabase
      .from(table)
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    const maxId = sbMax.data?.[0]?.id ?? 0;

    let lastId = maxId;
    while (true) {
      const res = await pgClient.query(
        `SELECT * FROM ${table} WHERE id > $1 ORDER BY id LIMIT $2`,
        [lastId, BATCH_SIZE]
      );
      if (res.rows.length === 0) break;

      if (!dryRun) {
        const { error } = await supabase.from(table).upsert(res.rows, { onConflict: 'id' });
        if (error) {
          console.error(`  ERROR ${table}: ${error.message}`);
          break;
        }
      }

      synced += res.rows.length;
      lastId = res.rows[res.rows.length - 1].id;

      if (synced % 5000 < BATCH_SIZE) {
        process.stdout.write(`  ${table}: ${synced.toLocaleString()} rows\r`);
      }

      if (res.rows.length < BATCH_SIZE) break;
    }
  }

  return synced;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sinceArg = args.find(a => a.startsWith('--since='))?.split('=')[1];
  const tableFilter = args.find(a => a.startsWith('--table='))?.split('=')[1];

  await pgClient.connect();
  console.log('Connected to Lab PG');

  const state = loadState();
  const since = sinceArg
    ? parseSince(sinceArg)
    : new Date(0); // Full sync if no --since

  if (dryRun) console.log('=== DRY RUN ===\n');
  console.log(`Since: ${since.toISOString()}\n`);

  const allTables = [
    ...SYNC_TABLES.map(t => ({ name: t, hasUpdatedAt: true })),
    ...STATIC_TABLES.map(t => ({ name: t, hasUpdatedAt: false })),
  ];

  const tables = tableFilter
    ? allTables.filter(t => t.name === tableFilter)
    : allTables;

  let totalSynced = 0;
  const start = Date.now();

  for (const { name, hasUpdatedAt } of tables) {
    const tableSince = hasUpdatedAt ? since : new Date(0);
    const count = await syncTable(name, tableSince, hasUpdatedAt, dryRun);

    if (count > 0) {
      console.log(`  ${name.padEnd(30)} ${count.toLocaleString().padStart(10)} rows synced`);
      state[name] = {
        lastSyncAt: new Date().toISOString(),
        lastMaxId: 0,
        rowsSynced: (state[name]?.rowsSynced ?? 0) + count,
      };
    } else {
      console.log(`  ${name.padEnd(30)}     up to date`);
    }

    totalSynced += count;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nTotal: ${totalSynced.toLocaleString()} rows in ${elapsed}s`);

  if (!dryRun) {
    saveState(state);
    console.log(`State saved: ${STATE_FILE}`);
  }

  await pgClient.end();
}

main().catch(e => { console.error(e); process.exit(1); });
