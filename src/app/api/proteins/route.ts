import { NextRequest, NextResponse } from 'next/server';
import { query, scalar } from '@/lib/db';
import { proteinCreateSchema } from '@/lib/validations/protein';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  try {
    const params: unknown[] = [];
    let whereClause = '';

    if (search) {
      whereClause = `WHERE p.full_name ILIKE $1 OR p.abbreviation ILIKE $1 OR p.gene_name ILIKE $1`;
      params.push(`%${search}%`);
    }

    const countSql = `SELECT COUNT(*) FROM kbsi_protein p ${whereClause}`;
    const total = await scalar<number>(countSql, params);

    const dataSql = `
      SELECT p.*,
        COALESCE(
          (SELECT json_agg(d.*) FROM kbsi_database_id d WHERE d.protein_id = p.id),
          '[]'::json
        ) AS kbsi_database_id,
        (SELECT COUNT(*) FROM kbsi_construct c WHERE c.protein_id = p.id) AS construct_count
      FROM kbsi_protein p
      ${whereClause}
      ORDER BY p.updated_at DESC
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

  const parsed = proteinCreateSchema.safeParse(body);
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
      `INSERT INTO kbsi_protein (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
