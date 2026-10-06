import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const mwMax = searchParams.get('mw_max') ? parseFloat(searchParams.get('mw_max')!) : null;

  const supabase = createServiceClient();

  let query = supabase
    .from('kbsi_ligand')
    .select('name, smiles, inchi, mw, source_db, source_id')
    .order('id')
    .limit(10000) as any;

  if (search) query = query.or(`name.ilike.%${search}%,source_id.ilike.%${search}%`);
  if (mwMax) query = query.lte('mw', mwMax);

  const { data } = await query;
  if (!data || data.length === 0) {
    return new NextResponse('No data', { status: 404 });
  }

  const headers = ['name', 'smiles', 'inchi', 'mw', 'source_db', 'source_id'];
  const csv = [
    headers.join(','),
    ...data.map((row: any) =>
      headers.map(h => {
        const v = row[h] ?? '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    ),
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kbsi_ligands_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
