import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const IMPORTABLE_TABLES = [
  'kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification',
  'kbsi_crystallization', 'kbsi_characterization',
] as const;

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

function coerceValue(val: string): any {
  if (val === '' || val === 'null' || val === 'NULL') return null;
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^\d+$/.test(val)) return parseInt(val);
  if (/^\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const formData = await request.formData();
  const table = formData.get('table') as string;
  const file = formData.get('file') as File | null;

  if (!table || !IMPORTABLE_TABLES.includes(table as any)) {
    return NextResponse.json({ error: `Invalid table. Allowed: ${IMPORTABLE_TABLES.join(', ')}` }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'CSV file is required' }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 });
  }

  // Remove auto-generated columns
  const skipCols = new Set(['id', 'created_at', 'updated_at']);
  const cleanedRows = rows.map((row) => {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!skipCols.has(k)) {
        clean[k] = coerceValue(v);
      }
    }
    return clean;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from(table) as any)
    .insert(cleanedRows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message, hint: 'Check CSV column names match the table schema' }, { status: 500 });
  }

  return NextResponse.json({
    message: `Imported ${data.length} rows into ${table}`,
    count: data.length,
  }, { status: 201 });
}
