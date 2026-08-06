import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const nmrCreateSchema = z.object({
  construct_id: z.number().int().positive(),
  attempt_number: z.number().int().positive().nullish(),
  source_type: z.enum(['experimental', 'literature', 'database']).default('experimental'),
  reference_id: z.number().int().positive().nullish(),
  labelling: z.string().nullish(),
  spectrometer: z.string().nullish(),
  magnetic_field: z.number().positive().nullish(),
  temperature: z.number().nullish(),
  bmrb_id: z.string().nullish(),
  notes: z.string().nullish(),
  performed_by: z.string().max(100).nullish(),
  performed_on: z.string().date().nullish(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const constructId = new URL(request.url).searchParams.get('construct_id');

  let query = supabase
    .from('kbsi_nmr_experiment')
    .select('*, kbsi_nmr_spectrum(*)');

  if (constructId) {
    query = query.eq('construct_id', parseInt(constructId));
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const parsed = nmrCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('kbsi_nmr_experiment')
    .insert(parsed.data as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
