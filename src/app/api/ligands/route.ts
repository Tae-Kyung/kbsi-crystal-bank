import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, scalar } from '@/lib/db';
import { ligandCreateSchema } from '@/lib/validations/ligand';

export async function GET(request: NextRequest) {
  const search = new URL(request.url).searchParams.get('search');

  try {
    const params: unknown[] = [];
    let whereClause = '';

    if (search) {
      whereClause = 'WHERE name ILIKE $1 OR smiles ILIKE $1';
      params.push(`%${search}%`);
    }

    const total = await scalar<number>(`SELECT COUNT(*) FROM kbsi_ligand ${whereClause}`, params);
    const data = await query(
      `SELECT * FROM kbsi_ligand ${whereClause} ORDER BY created_at DESC`,
      params
    );

    return NextResponse.json({ data, total: Number(total) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const parsed = ligandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const fields = Object.keys(parsed.data);
    const values = Object.values(parsed.data);
    const cols = fields.join(', ');
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

    const data = await queryOne(
      `INSERT INTO kbsi_ligand (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
