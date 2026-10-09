import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const proteinId = searchParams.get('protein_id');
  if (!proteinId) return NextResponse.json(null);

  const supabase = createServiceClient();

  // construct IDs
  const { data: constructs } = await supabase
    .from('kbsi_construct')
    .select('id')
    .eq('protein_id', parseInt(proteinId))
    .limit(500);

  const cIds = (constructs || []).map((c: any) => c.id);
  if (cIds.length === 0) {
    return NextResponse.json({ expression: 0, purification: 0, characterization: 0, crystallization: 0, diffraction: 0, structure: 0, ligands: 0 });
  }

  const [expr, purif, char, cryst, diffr, struct, lig] = await Promise.all([
    supabase.from('kbsi_expression').select('id', { count: 'exact', head: true }).in('construct_id', cIds),
    supabase.from('kbsi_purification').select('id', { count: 'exact', head: true }).in('construct_id', cIds),
    supabase.from('kbsi_characterization').select('id', { count: 'exact', head: true }).in('construct_id', cIds),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).in('construct_id', cIds),
    supabase.from('kbsi_diffraction').select('id', { count: 'exact', head: true }).in('construct_id', cIds),
    supabase.from('kbsi_structure').select('id', { count: 'exact', head: true }).in('construct_id', cIds),
    supabase.from('kbsi_construct_ligand').select('id', { count: 'exact', head: true }).in('construct_id', cIds),
  ]);

  return NextResponse.json({
    expression: expr.count ?? 0,
    purification: purif.count ?? 0,
    characterization: char.count ?? 0,
    crystallization: cryst.count ?? 0,
    diffraction: diffr.count ?? 0,
    structure: struct.count ?? 0,
    ligands: lig.count ?? 0,
  });
}
