import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const EXPORTABLE_TABLES = [
  'kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification',
  'kbsi_crystallization', 'kbsi_characterization', 'kbsi_structure',
  'kbsi_diffraction', 'kbsi_storage',
] as const;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const table = searchParams.get('table');
  const format = searchParams.get('format') || 'json';
  const constructId = searchParams.get('construct_id');

  if (!table || !EXPORTABLE_TABLES.includes(table as any)) {
    return NextResponse.json({
      error: `Invalid table. Allowed: ${EXPORTABLE_TABLES.join(', ')}`,
    }, { status: 400 });
  }

  let query = supabase.from(table as any).select('*');

  if (constructId && table !== 'kbsi_protein') {
    query = query.eq('construct_id', parseInt(constructId));
  }

  const { data, error } = await query.order('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'No data found' }, { status: 404 });

  if (format === 'csv') {
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map((row: any) =>
        headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',')
      ),
    ];

    return new NextResponse(csvRows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${table}_export.csv"`,
      },
    });
  }

  return NextResponse.json({ data, table, count: data.length });
}
