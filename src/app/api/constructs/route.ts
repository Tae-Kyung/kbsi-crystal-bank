import { NextRequest, NextResponse } from 'next/server';
import { query, scalar } from '@/lib/db';
import { constructCreateSchema } from '@/lib/validations/protein';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const proteinId = searchParams.get('protein_id');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    const params: unknown[] = [];
    let whereClause = '';

    if (proteinId) {
      whereClause = 'WHERE c.protein_id = $1';
      params.push(parseInt(proteinId));
    }

    const countSql = `SELECT COUNT(*) FROM kbsi_construct c ${whereClause}`;
    const total = await scalar<number>(countSql, params);

    const dataSql = `
      SELECT c.*,
        (SELECT row_to_json(sub) FROM (SELECT full_name, abbreviation FROM kbsi_protein WHERE id = c.protein_id) sub) AS kbsi_protein,
        COALESCE(
          (SELECT json_agg(m.*) FROM kbsi_mutation m WHERE m.construct_id = c.id),
          '[]'::json
        ) AS kbsi_mutation
      FROM kbsi_construct c
      ${whereClause}
      ORDER BY c.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const data = await query(dataSql, [...params, limit, offset]);

    return NextResponse.json({
      data,
      pagination: { page, limit, total: Number(total) },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const parsed = constructCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const fields = Object.keys(parsed.data);
    const values = Object.values(parsed.data);
    const cols = fields.join(', ');
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

    const data = await query(
      `INSERT INTO kbsi_construct (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
