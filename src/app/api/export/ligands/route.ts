import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const mwMax = searchParams.get('mw_max') ? parseFloat(searchParams.get('mw_max')!) : null;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (search) {
    conditions.push(`(name ILIKE $${paramIdx} OR source_id ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }
  if (mwMax) {
    conditions.push(`mw <= $${paramIdx}`);
    params.push(mwMax);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const data = await query(
    `SELECT name, smiles, inchi, mw, source_db, source_id
     FROM kbsi_ligand
     ${whereClause}
     ORDER BY id
     LIMIT 10000`,
    params.length > 0 ? params : undefined
  );

  if (!data || data.length === 0) {
    return new NextResponse('No data', { status: 404 });
  }

  const headers = ['name', 'smiles', 'inchi', 'mw', 'source_db', 'source_id'];
  const csv = [
    headers.join(','),
    ...data.map((row: any) =>
      headers.map(h => {
        const v = row[h] ?? '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    ),
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kbsi_ligands_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
