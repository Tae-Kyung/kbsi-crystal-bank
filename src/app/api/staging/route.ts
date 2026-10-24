import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  const status = new URL(request.url).searchParams.get('status') || 'pending';

  try {
    const data = await query(
      `SELECT s.*,
        (SELECT row_to_json(r.*) FROM (SELECT title, doi, year FROM kbsi_reference WHERE id = s.reference_id) r) AS kbsi_reference
      FROM kbsi_extraction_staging s
      WHERE s.review_status = $1
      ORDER BY s.extraction_date DESC`,
      [status]
    );

    return NextResponse.json({ data, total: data.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();

  const { ids, action, reviewed_by } = body as {
    ids: number[];
    action: 'approved' | 'rejected';
    reviewed_by: string;
  };

  if (!ids?.length || !action || !reviewed_by) {
    return NextResponse.json({ error: 'ids, action, reviewed_by required' }, { status: 400 });
  }

  try {
    // Update staging records
    await query(
      `UPDATE kbsi_extraction_staging
       SET review_status = $1, reviewed_by = $2, reviewed_at = $3
       WHERE id = ANY($4)`,
      [action, reviewed_by, new Date().toISOString(), ids]
    );

    // If approved, migrate data to main tables
    if (action === 'approved') {
      const approved = await query(
        'SELECT * FROM kbsi_extraction_staging WHERE id = ANY($1)',
        [ids]
      );

      if (approved) {
        for (const rec of approved) {
          const record = rec as any;
          // TODO: Map extracted_payload fields to the target table and insert
          // The payload is already structured by the LLM prompt to match the table schema
          void record.extracted_payload;
        }
      }
    }

    return NextResponse.json({ message: `${ids.length} records ${action}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
