/**
 * 공통 DB 연결 유틸리티
 *
 * Usage:
 *   import { pg, supabase } from './lib/db';
 *
 * - pg: Lab PostgreSQL 직접 연결 (데이터 작업용, timeout 무제한)
 * - supabase: Supabase JS Client (Auth/Storage/embedding 전용)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

dotenv.config({ path: '.env.local' });

// Lab PostgreSQL (primary for data scripts)
export function createPgClient(): pg.Client {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  return client;
}

// Pool for concurrent operations
let _pool: pg.Pool | null = null;
export function getPgPool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }
  return _pool;
}

// Supabase (Auth, Storage, embeddings until pgvector on Lab PG)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Helper: run a query and return rows
export async function pgQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const pool = getPgPool();
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

// Helper: run a query and return single value
export async function pgScalar<T = any>(sql: string, params?: any[]): Promise<T> {
  const rows = await pgQuery(sql, params);
  return Object.values(rows[0])[0] as T;
}

// Cleanup
export async function closePg(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
