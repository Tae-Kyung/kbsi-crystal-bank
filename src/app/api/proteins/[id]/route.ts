import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { proteinUpdateSchema } from '@/lib/validations/protein';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const data = await queryOne(
      `SELECT p.*,
        COALESCE(
          (SELECT json_agg(d.*) FROM kbsi_database_id d WHERE d.protein_id = p.id),
          '[]'::json
        ) AS kbsi_database_id,
        COALESCE(
          (SELECT json_agg(c.*) FROM kbsi_construct c WHERE c.protein_id = p.id),
          '[]'::json
        ) AS kbsi_construct
      FROM kbsi_protein p
      WHERE p.id = $1`,
      [parseInt(id)]
    );

    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const parsed = proteinUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const fields = Object.keys(parsed.data);
    const values = Object.values(parsed.data);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const data = await queryOne(
      `UPDATE kbsi_protein SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, parseInt(id)]
    );

    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await query('DELETE FROM kbsi_protein WHERE id = $1', [parseInt(id)]);
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
