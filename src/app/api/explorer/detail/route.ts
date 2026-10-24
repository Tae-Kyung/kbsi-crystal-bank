import { NextResponse } from 'next/server';
import { query, scalar } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constructId = searchParams.get('construct_id');
  const proteinId = searchParams.get('protein_id');

  let cIds: number[] = [];
  if (constructId) {
    cIds = [parseInt(constructId)];
  } else if (proteinId) {
    const rows = await query<{ id: number }>(
      'SELECT id FROM kbsi_construct WHERE protein_id = $1 LIMIT 500',
      [parseInt(proteinId)]
    );
    cIds = rows.map((c) => c.id);
  }

  if (cIds.length === 0) {
    return NextResponse.json({ expression: 0, purification: 0, characterization: 0, crystallization: 0, diffraction: 0, structure: 0, nmr: 0, ligands: 0 });
  }

  const [expr, purif, char, cryst, diffr, struct, nmr, lig] = await Promise.all([
    scalar<number>('SELECT COUNT(*) FROM kbsi_expression WHERE construct_id = ANY($1)', [cIds]),
    scalar<number>('SELECT COUNT(*) FROM kbsi_purification WHERE construct_id = ANY($1)', [cIds]),
    scalar<number>('SELECT COUNT(*) FROM kbsi_characterization WHERE construct_id = ANY($1)', [cIds]),
    scalar<number>('SELECT COUNT(*) FROM kbsi_crystallization WHERE construct_id = ANY($1)', [cIds]),
    scalar<number>('SELECT COUNT(*) FROM kbsi_diffraction WHERE construct_id = ANY($1)', [cIds]),
    scalar<number>('SELECT COUNT(*) FROM kbsi_structure WHERE construct_id = ANY($1)', [cIds]),
    scalar<number>('SELECT COUNT(*) FROM kbsi_nmr_experiment WHERE construct_id = ANY($1)', [cIds]),
    scalar<number>('SELECT COUNT(*) FROM kbsi_construct_ligand WHERE construct_id = ANY($1)', [cIds]),
  ]);

  return NextResponse.json({
    expression: expr ?? 0,
    purification: purif ?? 0,
    characterization: char ?? 0,
    crystallization: cryst ?? 0,
    diffraction: diffr ?? 0,
    structure: struct ?? 0,
    nmr: nmr ?? 0,
    ligands: lig ?? 0,
  });
}
