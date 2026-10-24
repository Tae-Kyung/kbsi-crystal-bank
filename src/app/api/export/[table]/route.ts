import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

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
      { error: `Unsupported table: "${table}". Supported: ${Object.keys(TABLE_CONFIG).join(', ')}` },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const limitParam = parseInt(searchParams.get('limit') || '10000', 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 10000 : limitParam), 50000);

  const selectColumns = config.columns.join(', ');

  let sql = `SELECT ${selectColumns} FROM ${config.dbTable}`;
  const params_arr: unknown[] = [];
  let paramIdx = 1;

  if (search) {
    const textColumns = config.columns.filter(
      (c) => !['id', 'protein_id', 'construct_id', 'ph', 'temperature',
        'precipitant_conc', 'theoretical_mw', 'theoretical_pi', 'residues',
        'induction_temp', 'yield_mg_l', 'final_purity', 'final_yield',
        'value_num', 'resolution'].includes(c)
    );

    if (textColumns.length > 0) {
      const orClauses = textColumns.map(col => {
        params_arr.push(`%${search}%`);
        return `${col} ILIKE $${paramIdx++}`;
      });
      sql += ` WHERE (${orClauses.join(' OR ')})`;
    }
  }

  sql += ` ORDER BY id LIMIT $${paramIdx}`;
  params_arr.push(limit);

  try {
    const data = await query(sql, params_arr);

    if (!data || data.length === 0) {
      const csvContent = config.columns.join(',') + '\n';
      return new Response(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${table}_export.csv"`,
        },
      });
    }

    const headerRow = config.columns.join(',');
    const dataRows = data.map((row: any) =>
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
