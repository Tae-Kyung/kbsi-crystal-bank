import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const proteinId = searchParams.get('protein_id');
  if (!proteinId) return NextResponse.json([]);

  const data = await query(
    `SELECT id, name, construct_type, expression_system, theoretical_mw
     FROM kbsi_construct
     WHERE protein_id = $1
     ORDER BY id
     LIMIT 100`,
    [parseInt(proteinId)]
  );

  return NextResponse.json(data || []);
}
