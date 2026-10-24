import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { constructLigandCreateSchema } from '@/lib/validations/ligand';

export async function GET(request: NextRequest) {
  const constructId = new URL(request.url).searchParams.get('construct_id');

  try {
    const params: unknown[] = [];
    let whereClause = '';

    if (constructId) {
      whereClause = 'WHERE cl.construct_id = $1';
      params.push(parseInt(constructId));
    }

    const data = await query(
      `SELECT cl.*,
        (SELECT row_to_json(l.*) FROM kbsi_ligand l WHERE l.id = cl.ligand_id) AS kbsi_ligand
      FROM kbsi_construct_ligand cl
      ${whereClause}`,
      params
    );

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const parsed = constructLigandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const fields = Object.keys(parsed.data);
    const values = Object.values(parsed.data);
    const cols = fields.join(', ');
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

    const inserted = await queryOne(
      `INSERT INTO kbsi_construct_ligand (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    // Fetch with joined ligand data
    const data = await queryOne(
      `SELECT cl.*,
        (SELECT row_to_json(l.*) FROM kbsi_ligand l WHERE l.id = cl.ligand_id) AS kbsi_ligand
      FROM kbsi_construct_ligand cl
      WHERE cl.id = $1`,
      [(inserted as any).id]
    );

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
