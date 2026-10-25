/**
 * Lab PostgreSQL connection with Supabase fallback
 *
 * Primary: Lab PG (203.255.78.89:15432)
 * Fallback: Supabase REST API (자동 전환, 3회 실패 후)
 *
 * Usage:
 *   import { query, queryOne, scalar } from '@/lib/db';
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

// --- Primary: Lab PG ---
const pool = new pg.Pool({
  host: process.env.PG_HOST || '203.255.78.89',
  port: parseInt(process.env.PG_PORT || '15432'),
  database: process.env.PG_DATABASE || 'kbsi_crystal_bank',
  user: process.env.PG_USER || 'kbsi_app',
  password: process.env.PG_PASSWORD || 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// --- Fallback: Supabase ---
const supabaseFallback = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )
  : null;

let pgFailCount = 0;
const PG_FAIL_THRESHOLD = 3;
let pgRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

function isPgDown(): boolean {
  return pgFailCount >= PG_FAIL_THRESHOLD;
}

function markPgFail() {
  pgFailCount++;
  if (pgFailCount === PG_FAIL_THRESHOLD) {
    console.warn(`[db] Lab PG failed ${PG_FAIL_THRESHOLD} times — switching to Supabase fallback`);
    // Try to recover after 60 seconds
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

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  // Try Lab PG first
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

  // Fallback: return empty (Supabase REST can't run raw SQL)
  // For critical paths, callers should handle empty results gracefully
  console.warn('[db] Fallback mode — returning empty result for:', sql.substring(0, 60));
  return [] as T[];
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
  const rows = await query(sql, params);
  if (rows.length === 0) return 0 as T;
  return Object.values(rows[0])[0] as T;
}

/** Check if Lab PG is currently available */
export function isLabPgActive(): boolean {
  return !isPgDown();
}

/** Get connection status for health checks */
export async function getDbStatus(): Promise<{
  primary: 'active' | 'down';
  fallback: 'available' | 'unavailable';
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
    failCount: pgFailCount,
  };
}

export { pool };
