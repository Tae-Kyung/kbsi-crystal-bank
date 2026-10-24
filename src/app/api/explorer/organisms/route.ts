import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  // organism_normalized 우선, 없으면 organism
  // PostgreSQL에서 집계 처리
  const data = await query<{ organism: string; count: number }>(
    `SELECT COALESCE(organism_normalized, organism) AS organism, COUNT(*) AS count
     FROM kbsi_protein
     WHERE organism IS NOT NULL
     GROUP BY COALESCE(organism_normalized, organism)
     ORDER BY count DESC
     LIMIT 500`
  );

  return NextResponse.json(data || [], {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
