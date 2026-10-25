import { NextResponse } from 'next/server';
import { query, queryOne, getDbStatus } from '@/lib/db';

export async function GET() {
  try {
    const [connStatus, dbHealth, syncStatus, recentChanges] = await Promise.all([
      getDbStatus(),
      queryOne<{
        db_size: string; total_tables: number; total_rows: number;
        total_indexes: number; cache_hit_ratio: number;
        active_connections: number; uptime: any;
      }>('SELECT * FROM db_health()'),
      queryOne<{
        total_pending: number; oldest_pending: string;
        by_table: Record<string, number>; by_action: Record<string, number>;
        last_synced: string;
      }>('SELECT * FROM sync_status()'),
      query<{
        table_name: string; action: string; record_id: number; changed_at: string;
      }>(
        `SELECT table_name, action, record_id, changed_at
         FROM kbsi_sync_changelog
         ORDER BY id DESC LIMIT 20`
      ),
    ]);

    return NextResponse.json({
      connection: connStatus,
      health: dbHealth,
      sync: syncStatus,
      recentChanges,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
