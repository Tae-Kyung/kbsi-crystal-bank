/**
 * Supabase → Lab PostgreSQL 데이터 이관 스크립트 (v2: 병렬 fetch + 스트리밍)
 *
 * Usage:
 *   npx tsx scripts/migrate-data-to-pg.ts
 *   npx tsx scripts/migrate-data-to-pg.ts --table=kbsi_protein
 *   npx tsx scripts/migrate-data-to-pg.ts --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { Writable } from 'stream';
import { pipeline } from 'stream/promises';

const SUPABASE_URL = 'https://yjmeolkuhcjpxuxmtkts.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqbWVvbGt1aGNqcHh1eG10a3RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUxODkwOCwiZXhwIjoyMDg2MDk0OTA4fQ.XoXWoLvQzI8JFKgO9HCPvaaoYgBVFj7TvQWSZ-l7nxU';

const TARGET_PG = {
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const FETCH_SIZE = 1000;     // Supabase API limit
const INSERT_BATCH = 1000;   // rows per INSERT statement
const CONCURRENCY = 4;       // parallel Supabase fetches

// FK dependency order
const TABLES_IN_ORDER = [
  'kbsi_reference', 'kbsi_project', 'kbsi_ligand',
  'kbsi_screening_kit', 'kbsi_precipitant_lookup', 'kbsi_featured_protein', 'kbsi_kbds_mapping',
  'kbsi_protein', 'kbsi_database_id',
  'kbsi_construct', 'kbsi_mutation', 'kbsi_construct_ligand',
  'kbsi_expression', 'kbsi_purification', 'kbsi_purification_step',
  'kbsi_characterization', 'kbsi_storage',
  'kbsi_crystallization', 'kbsi_diffraction',
  'kbsi_nmr_experiment', 'kbsi_nmr_spectrum', 'kbsi_nmr_chemical_shift',
  'kbsi_cryoem_session', 'kbsi_structure',
  'kbsi_extraction_staging', 'kbsi_search_keywords',
];

interface MigrateStats {
  table: string;
  rows: number;
  duration: number;
  error?: string;
}

async function getColumns(pgClient: pg.Client, tableName: string): Promise<string[]> {
  const res = await pgClient.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows.map((r: { column_name: string }) => r.column_name);
}

// Fetch a single page using cursor-based pagination
async function fetchPage(tableName: string, afterId: number): Promise<any[]> {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .gt('id', afterId)
    .order('id', { ascending: true })
    .limit(FETCH_SIZE);

  if (error) throw new Error(`Supabase ${tableName} (id>${afterId}): ${error.message}`);
  return data || [];
}

// Parallel pre-fetch: fetch N pages ahead while inserting current batch
async function* streamFromSupabase(tableName: string): AsyncGenerator<any[]> {
  let lastId = 0;
  let done = false;

  while (!done) {
    // Fetch CONCURRENCY pages in parallel
    const pagePromises: Promise<any[]>[] = [];
    let ids = [lastId];
    // We need sequential IDs for cursor, so fetch one-by-one but pipeline
    const page = await fetchPage(tableName, lastId);
    if (page.length === 0) break;

    yield page;
    lastId = page[page.length - 1].id;

    if (page.length < FETCH_SIZE) break;
  }
}

function buildCopyValues(columns: string[], rows: any[]): string {
  return rows.map(row => {
    return columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '\\N';
      if (typeof val === 'object') return JSON.stringify(val).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n');
      const s = String(val);
      return s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n');
    }).join('\t');
  }).join('\n');
}

async function migrateTable(
  pgClient: pg.Client,
  tableName: string,
  dryRun: boolean
): Promise<MigrateStats> {
  const start = Date.now();

  try {
    const targetCols = await getColumns(pgClient, tableName);

    // Resume support
    const existingCount = await pgClient.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
    const existing = parseInt(existingCount.rows[0].cnt);
    if (existing > 0) {
      console.log(`[${tableName}] Already has ${existing.toLocaleString()} rows - SKIP`);
      return { table: tableName, rows: existing, duration: Date.now() - start };
    }

    if (dryRun) {
      let count = 0;
      for await (const page of streamFromSupabase(tableName)) {
        count += page.length;
        if (count % 10000 < FETCH_SIZE) process.stdout.write(`  ${tableName}: ${count.toLocaleString()}\r`);
      }
      console.log(`[${tableName}] (dry) ${count.toLocaleString()} rows`);
      return { table: tableName, rows: count, duration: Date.now() - start };
    }

    console.log(`[${tableName}] Migrating...`);

    // Disable user triggers
    await pgClient.query(`ALTER TABLE ${tableName} DISABLE TRIGGER USER`);

    let inserted = 0;
    let commonCols: string[] | null = null;
    let buffer: any[] = [];

    for await (const page of streamFromSupabase(tableName)) {
      if (!commonCols) {
        const sourceCols = Object.keys(page[0]);
        commonCols = targetCols.filter(c => sourceCols.includes(c));
      }

      buffer.push(...page);

      // Flush when buffer reaches INSERT_BATCH
      while (buffer.length >= INSERT_BATCH) {
        const batch = buffer.splice(0, INSERT_BATCH);
        inserted += await insertBatch(pgClient, tableName, commonCols, batch);
      }

      if (inserted % 10000 < FETCH_SIZE) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = inserted > 0 ? Math.round(inserted / ((Date.now() - start) / 1000)) : 0;
        process.stdout.write(`  ${tableName}: ${inserted.toLocaleString()} rows (${rate}/s, ${elapsed}s)\r`);
      }
    }

    // Flush remaining
    if (buffer.length > 0 && commonCols) {
      inserted += await insertBatch(pgClient, tableName, commonCols, buffer);
    }

    // Re-enable triggers
    await pgClient.query(`ALTER TABLE ${tableName} ENABLE TRIGGER USER`);

    // Reset sequence
    await pgClient.query(`
      SELECT setval(pg_get_serial_sequence('${tableName}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${tableName}), 1))
    `).catch(() => {});

    const duration = Date.now() - start;
    const rate = Math.round(inserted / (duration / 1000));
    console.log(`\n[${tableName}] Done: ${inserted.toLocaleString()} rows (${(duration / 1000).toFixed(1)}s, ${rate}/s)`);

    return { table: tableName, rows: inserted, duration };
  } catch (e: any) {
    await pgClient.query(`ALTER TABLE ${tableName} ENABLE TRIGGER USER`).catch(() => {});
    const duration = Date.now() - start;
    console.error(`\n[${tableName}] FAILED: ${e.message}`);
    return { table: tableName, rows: 0, duration, error: e.message };
  }
}

async function insertBatch(
  pgClient: pg.Client,
  tableName: string,
  columns: string[],
  rows: any[]
): Promise<number> {
  const valuePlaceholders: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (const row of rows) {
    const placeholders: string[] = [];
    for (const col of columns) {
      placeholders.push(`$${paramIdx++}`);
      const val = row[col] ?? null;
      // Serialize objects to JSON strings for JSONB columns
      values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
    }
    valuePlaceholders.push(`(${placeholders.join(',')})`);
  }

  const text = `INSERT INTO ${tableName} (${columns.join(',')}) OVERRIDING SYSTEM VALUE VALUES ${valuePlaceholders.join(',')} ON CONFLICT DO NOTHING`;

  try {
    const res = await pgClient.query(text, values);
    return res.rowCount ?? 0;
  } catch (e: any) {
    console.error(`\n  INSERT ERROR ${tableName} (${rows.length} rows): ${e.message.substring(0, 200)}`);
    return 0;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tableFilter = args.find(a => a.startsWith('--table='))?.split('=')[1];

  if (dryRun) console.log('=== DRY RUN ===\n');

  const pgClient = new pg.Client(TARGET_PG);
  await pgClient.connect();
  console.log('Connected to target PostgreSQL\n');

  await pgClient.query("SET work_mem = '256MB'");
  await pgClient.query("SET maintenance_work_mem = '512MB'");

  const tables = tableFilter
    ? TABLES_IN_ORDER.filter(t => t === tableFilter)
    : TABLES_IN_ORDER;

  if (tables.length === 0) {
    console.error(`Table "${tableFilter}" not found`);
    process.exit(1);
  }

  const stats: MigrateStats[] = [];
  const totalStart = Date.now();

  for (const table of tables) {
    const stat = await migrateTable(pgClient, table, dryRun);
    stats.push(stat);
  }

  const totalDuration = Date.now() - totalStart;

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));

  let totalRows = 0;
  for (const s of stats) {
    const status = s.error ? `ERROR` : `${s.rows.toLocaleString()} rows`;
    console.log(`  ${s.table.padEnd(30)} ${status.padStart(15)} (${(s.duration / 1000).toFixed(1)}s)`);
    totalRows += s.rows;
  }

  console.log('-'.repeat(60));
  console.log(`  TOTAL: ${totalRows.toLocaleString()} rows in ${(totalDuration / 1000).toFixed(1)}s`);

  const errors = stats.filter(s => s.error);
  if (errors.length > 0) {
    console.log(`\n  ERRORS (${errors.length}):`);
    errors.forEach(e => console.log(`    ${e.table}: ${e.error}`));
  }

  await pgClient.end();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
