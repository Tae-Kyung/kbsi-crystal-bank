import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organism = searchParams.get('organism');
  if (!organism) return NextResponse.json([]);

  const data = await query(
    `SELECT id, full_name, full_name_normalized, abbreviation, gene_name
     FROM kbsi_protein
     WHERE organism = $1 OR organism_normalized = $1
     ORDER BY abbreviation
     LIMIT 200`,
    [organism]
  );

  // full_name_normalized 우선 사용
  const mapped = (data || []).map((p: any) => ({
    ...p,
    full_name: p.full_name_normalized || p.full_name,
  }));

  return NextResponse.json(mapped, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
