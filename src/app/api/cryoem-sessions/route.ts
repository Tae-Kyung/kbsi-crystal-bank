import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { z } from 'zod';

const cryoemCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: z.enum(['experimental', 'literature', 'database']).default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  microscope: z.string().nullish(),
  detector: z.string().nullish(),
  voltage_kv: z.number().positive().nullish(),
  pixel_size: z.number().positive().nullish(),
  num_particles: z.number().int().positive().nullish(),
  resolution: z.number().positive().nullish(),
  refinement_software: z.string().nullish(),
  processing_detail: z.string().nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

export async function GET(request: NextRequest) {
  const constructId = new URL(request.url).searchParams.get('construct_id');

  try {
    const params: unknown[] = [];
    let whereClause = '';

    if (constructId) {
      whereClause = 'WHERE construct_id = $1';
      params.push(parseInt(constructId));
    }

    const data = await query(
      `SELECT * FROM kbsi_cryoem_session ${whereClause} ORDER BY created_at DESC`,
      params
    );

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const parsed = cryoemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const obj = parsed.data as Record<string, unknown>;
    const fields = Object.keys(obj).filter(k => obj[k] !== undefined);
    const values = fields.map(k => obj[k]);
    const cols = fields.join(', ');
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

    const data = await queryOne(
      `INSERT INTO kbsi_cryoem_session (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
