/**
 * Lab PostgreSQL connection with Supabase fallback + manual switchover
 *
 * Primary: Lab PG (203.255.78.89:15432)
 * Fallback: Supabase REST API (자동/수동 전환)
 *
 * Usage:
 *   import { query, queryOne, scalar } from '@/lib/db';
 */
import pg from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- Primary: Lab PG ---
const pool = new pg.Pool({
  host: process.env.PG_HOST || '203.255.78.89',
  port: parseInt(process.env.PG_PORT || '15432'),
  database: process.env.PG_DATABASE || 'kbsi_crystal_bank',
  user: process.env.PG_USER || 'kbsi_app',
  password: process.env.PG_PASSWORD || 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
});

// --- Fallback: Supabase ---
const supabaseFallback: SupabaseClient | null = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )
  : null;

// --- State ---
let pgFailCount = 0;
const PG_FAIL_THRESHOLD = 3;
let pgRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let forceMode: 'pg' | 'supabase' | null = null; // manual override

function isPgDown(): boolean {
  if (forceMode === 'pg') return false;
  if (forceMode === 'supabase') return true;
  return pgFailCount >= PG_FAIL_THRESHOLD;
}

function markPgFail() {
  pgFailCount++;
  if (pgFailCount === PG_FAIL_THRESHOLD) {
    console.warn(`[db] Lab PG failed ${PG_FAIL_THRESHOLD} times — switching to Supabase fallback`);
    if (!pgRecoveryTimer) {
      pgRecoveryTimer = setTimeout(() => {
        pgFailCount = 0;
        pgRecoveryTimer = null;
        console.info('[db] Attempting Lab PG recovery...');
      }, 60_000);
    }
  }
}

function markPgSuccess() {
  if (pgFailCount > 0) {
    pgFailCount = 0;
    if (pgRecoveryTimer) {
      clearTimeout(pgRecoveryTimer);
      pgRecoveryTimer = null;
    }
  }
}

// --- Supabase SQL-like query via REST (limited but functional) ---
async function supabaseQuery<T>(sql: string, params?: unknown[]): Promise<T[]> {
  if (!supabaseFallback) return [];

  // Parse simple SELECT queries for Supabase REST fallback
  // Supports: SELECT * FROM table [WHERE col = val] [ORDER BY col] [LIMIT n]
  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
  if (!selectMatch) return [];

  const tableName = selectMatch[2];
  let q = supabaseFallback.from(tableName).select(selectMatch[1] === '*' ? '*' : selectMatch[1]);

  // Basic WHERE parsing
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
  if (whereMatch && params && params.length > 0) {
    // Simple col = $1 pattern
    const eqMatch = whereMatch[1].match(/(\w+)\s*=\s*\$1/);
    if (eqMatch) {
      q = q.eq(eqMatch[1], params[0] as string);
    }
  }

  // LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\$?\d+)/i);
  if (limitMatch) {
    const lim = limitMatch[1].startsWith('$')
      ? (params?.[parseInt(limitMatch[1].slice(1)) - 1] as number)
      : parseInt(limitMatch[1]);
    if (lim) q = q.limit(lim);
  }

  // ORDER BY
  const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
  if (orderMatch) {
    q = q.order(orderMatch[1], { ascending: orderMatch[2]?.toUpperCase() !== 'DESC' });
  }

  const { data, error } = await q;
  if (error) {
    console.error('[db:supabase] Fallback query error:', error.message);
    return [];
  }
  return (data || []) as T[];
}

async function supabaseScalar(sql: string, params?: unknown[]): Promise<number> {
  if (!supabaseFallback) return 0;

  const countMatch = sql.match(/SELECT\s+COUNT\(\*\)\s+FROM\s+(\w+)/i);
  if (countMatch) {
    const tableName = countMatch[1];
    let q = supabaseFallback.from(tableName).select('id', { count: 'exact', head: true });

    const whereMatch = sql.match(/WHERE\s+(.+?)$/i);
    if (whereMatch && params && params.length > 0) {
      const eqMatch = whereMatch[1].match(/(\w+)\s*=\s*\$1/);
      if (eqMatch) q = q.eq(eqMatch[1], params[0] as string);
    }

    const { count } = await q;
    return count ?? 0;
  }
  return 0;
}

// --- Public API ---
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  if (!isPgDown()) {
    try {
      const res = await pool.query(sql, params);
      markPgSuccess();
      return res.rows as T[];
    } catch (err) {
      markPgFail();
      console.error('[db] Lab PG query failed:', (err as Error).message?.substring(0, 100));
    }
  }

  // Supabase fallback
  console.warn('[db] Using Supabase fallback for:', sql.substring(0, 60));
  return supabaseQuery<T>(sql, params);
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function scalar<T = number>(
  sql: string,
  params?: unknown[]
): Promise<T> {
  if (!isPgDown()) {
    try {
      const res = await pool.query(sql, params);
      markPgSuccess();
      if (res.rows.length === 0) return 0 as T;
      return Object.values(res.rows[0])[0] as T;
    } catch (err) {
      markPgFail();
    }
  }

  // Supabase fallback for COUNT
  return (await supabaseScalar(sql, params)) as T;
}

// --- Switchover API ---

/** Force switch to Lab PG (active) */
export function switchToPg() {
  forceMode = 'pg';
  pgFailCount = 0;
  if (pgRecoveryTimer) {
    clearTimeout(pgRecoveryTimer);
    pgRecoveryTimer = null;
  }
  console.info('[db] Manual switchover → Lab PG (active)');
}

/** Force switch to Supabase (standby) */
export function switchToSupabase() {
  forceMode = 'supabase';
  console.info('[db] Manual switchover → Supabase (standby)');
}

/** Reset to auto mode */
export function switchToAuto() {
  forceMode = null;
  pgFailCount = 0;
  console.info('[db] Switchover mode → auto');
}

/** Check Lab PG availability */
export function isLabPgActive(): boolean {
  return !isPgDown();
}

/** Get connection status */
export async function getDbStatus(): Promise<{
  primary: 'active' | 'down';
  fallback: 'available' | 'unavailable';
  mode: 'auto' | 'force-pg' | 'force-supabase';
  failCount: number;
}> {
  let primary: 'active' | 'down' = 'down';
  try {
    await pool.query('SELECT 1');
    primary = 'active';
  } catch { /* down */ }

  return {
    primary,
    fallback: supabaseFallback ? 'available' : 'unavailable',
    mode: forceMode === 'pg' ? 'force-pg' : forceMode === 'supabase' ? 'force-supabase' : 'auto',
    failCount: pgFailCount,
  };
}

export { pool };
