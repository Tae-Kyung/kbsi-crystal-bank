import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { constructLigandCreateSchema } from '@/lib/validations/ligand';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const constructId = new URL(request.url).searchParams.get('construct_id');

  let query = supabase.from('kbsi_construct_ligand').select('*, kbsi_ligand(*)');

  if (constructId) {
    query = query.eq('construct_id', parseInt(constructId));
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const parsed = constructLigandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('kbsi_construct_ligand') as any)
    .insert(parsed.data)
    .select('*, kbsi_ligand(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
