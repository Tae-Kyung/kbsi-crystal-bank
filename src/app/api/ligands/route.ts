import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ligandCreateSchema } from '@/lib/validations/ligand';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const search = new URL(request.url).searchParams.get('search');

  let query = supabase.from('kbsi_ligand').select('*', { count: 'exact' });

  if (search) {
    query = query.or(`name.ilike.%${search}%,smiles.ilike.%${search}%`);
  }

  const { data, error, count } = await query.order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const parsed = ligandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('kbsi_ligand') as any)
    .insert(parsed.data)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
