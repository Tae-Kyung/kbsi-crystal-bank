import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { constructUpdateSchema } from '@/lib/validations/protein';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const data = await queryOne(
      `SELECT c.*,
        (SELECT row_to_json(sub) FROM (SELECT full_name, abbreviation FROM kbsi_protein WHERE id = c.protein_id) sub) AS kbsi_protein,
        COALESCE(
          (SELECT json_agg(m.*) FROM kbsi_mutation m WHERE m.construct_id = c.id),
          '[]'::json
        ) AS kbsi_mutation
      FROM kbsi_construct c
      WHERE c.id = $1`,
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

  const parsed = constructUpdateSchema.safeParse(body);
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
      `UPDATE kbsi_construct SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
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
    await query('DELETE FROM kbsi_construct WHERE id = $1', [parseInt(id)]);
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
