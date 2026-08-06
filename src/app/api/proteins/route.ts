import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { proteinCreateSchema } from '@/lib/validations/protein';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  let query = supabase
    .from('kbsi_protein')
    .select('*, kbsi_database_id(*), kbsi_construct(count)', { count: 'exact' });

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,abbreviation.ilike.%${search}%,gene_name.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    pagination: { page, limit, total: count },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const parsed = proteinCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('kbsi_protein') as any)
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
