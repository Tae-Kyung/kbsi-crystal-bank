import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Table name -> DB table name + selected columns
const TABLE_CONFIG: Record<string, { dbTable: string; columns: string[] }> = {
  proteins: {
    dbTable: 'kbsi_protein',
    columns: ['id', 'full_name', 'abbreviation', 'gene_name', 'organism'],
  },
  constructs: {
    dbTable: 'kbsi_construct',
    columns: [
      'id', 'protein_id', 'name', 'construct_type', 'expression_system',
      'theoretical_mw', 'theoretical_pi', 'residues',
    ],
  },
  crystallization: {
    dbTable: 'kbsi_crystallization',
    columns: [
      'id', 'construct_id', 'ph', 'temperature', 'precipitant_type',
      'precipitant_conc', 'buffer_type', 'outcome', 'source_type', 'source_db',
    ],
  },
  expression: {
    dbTable: 'kbsi_expression',
    columns: [
      'id', 'construct_id', 'host', 'strain', 'induction_temp',
      'yield_mg_l', 'result_level', 'source_db', 'source_id',
    ],
  },
  purification: {
    dbTable: 'kbsi_purification',
    columns: [
      'id', 'construct_id', 'method_summary', 'final_purity',
      'final_yield', 'result_level', 'source_db',
    ],
  },
  characterization: {
    dbTable: 'kbsi_characterization',
    columns: [
      'id', 'construct_id', 'method', 'value_num', 'value_text',
      'unit_normalized', 'source_db',
    ],
  },
  diffraction: {
    dbTable: 'kbsi_diffraction',
    columns: [
      'id', 'construct_id', 'resolution', 'space_group', 'beamline',
      'phasing', 'source_db',
    ],
  },
  structure: {
    dbTable: 'kbsi_structure',
    columns: [
      'id', 'construct_id', 'method', 'resolution', 'pdb_id',
      'emdb_id', 'performed_on', 'source_db',
    ],
  },
};

function escapeCSVValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params;

  const config = TABLE_CONFIG[table];
  if (!config) {
    return NextResponse.json(
      {
        error: `Unsupported table: "${table}". Supported: ${Object.keys(TABLE_CONFIG).join(', ')}`,
      },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const limitParam = parseInt(searchParams.get('limit') || '10000', 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 10000 : limitParam), 50000);

  const supabase = createServiceClient();
  const selectColumns = config.columns.join(',');

  let query = supabase
    .from(config.dbTable)
    .select(selectColumns)
    .order('id')
    .limit(limit);

  // Apply text search if provided
  if (search) {
    // Search across text-like columns (skip id and numeric-only fields)
    const textColumns = config.columns.filter(
      (c) => !['id', 'protein_id', 'construct_id', 'ph', 'temperature',
        'precipitant_conc', 'theoretical_mw', 'theoretical_pi', 'residues',
        'induction_temp', 'yield_mg_l', 'final_purity', 'final_yield',
        'value_num', 'resolution'].includes(c)
    );

    if (textColumns.length > 0) {
      const orFilter = textColumns
        .map((col) => `${col}.ilike.%${search}%`)
        .join(',');
      query = query.or(orFilter);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    // Return CSV with header only
    const csvContent = config.columns.join(',') + '\n';
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${table}_export.csv"`,
      },
    });
  }

  // Build CSV
  const headerRow = config.columns.join(',');
  const dataRows = (data as any[]).map((row: any) =>
    config.columns.map((col: string) => escapeCSVValue(row[col])).join(',')
  );
  const csvContent = [headerRow, ...dataRows].join('\n') + '\n';

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${table}_export.csv"`,
    },
  });
}
