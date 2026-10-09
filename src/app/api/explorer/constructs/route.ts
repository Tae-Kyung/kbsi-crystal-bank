import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const proteinId = searchParams.get('protein_id');
  if (!proteinId) return NextResponse.json([]);

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('kbsi_construct')
    .select('id, name, construct_type, expression_system, theoretical_mw')
    .eq('protein_id', parseInt(proteinId))
    .order('id')
    .limit(100);

  return NextResponse.json(data || []);
}
