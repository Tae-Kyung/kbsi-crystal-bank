/**
 * Lab PostgreSQL connection for data queries
 * Supabase Auth/Storage는 그대로 유지, 데이터 쿼리만 Lab PG 사용
 *
 * Usage (Server Components & API Routes):
 *   import { query, queryOne, scalar } from '@/lib/db';
 *   const proteins = await query('SELECT * FROM kbsi_protein LIMIT 10');
 *   const count = await scalar<number>('SELECT COUNT(*) FROM kbsi_protein');
 */
import pg from 'pg';

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

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
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
  return Object.values(rows[0])[0] as T;
}

export { pool };
