import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { fetchPDBEntry, searchPDB } from '@/lib/external/pdb';
import { fetchUniProtEntry } from '@/lib/external/uniprot';

/**
 * GET /api/pdb-import?pdb_id=1ABC — PDB ID로 미리보기 데이터 조회
 * GET /api/pdb-import?q=lysozyme&limit=10 — PDB 검색
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pdbId = searchParams.get('pdb_id');
  const q = searchParams.get('q');

  if (q) {
    const limit = parseInt(searchParams.get('limit') || '10');
    const results = await searchPDB(q, limit);
    return NextResponse.json({ results });
  }

  if (!pdbId) {
    return NextResponse.json({ error: 'pdb_id or q parameter required' }, { status: 400 });
  }

  const entry = await fetchPDBEntry(pdbId);
  if (!entry) {
    return NextResponse.json({ error: `PDB entry ${pdbId} not found` }, { status: 404 });
  }

  // Enrich with UniProt data if available
  const uniprotAccession = entry.polymerEntities[0]?.uniprotAccession;
  let uniprotData = null;
  if (uniprotAccession) {
    uniprotData = await fetchUniProtEntry(uniprotAccession);
  }

  // Build preview of what will be imported
  const preview = {
    pdb: entry,
    uniprot: uniprotData,
    willCreate: {
      protein: {
        full_name: entry.polymerEntities[0]?.name || entry.title,
        abbreviation: uniprotData?.geneName || null,
        gene_name: uniprotData?.geneName || null,
        organism: entry.organism || uniprotData?.organism || null,
      },
      construct: {
        name: `${entry.pdbId} construct`,
        seq_final: entry.polymerEntities[0]?.sequence || null,
        expression_system: entry.expressionSystem?.host || null,
        vector: entry.expressionSystem?.vector || null,
        tag_name: null,
      },
      crystallization: entry.crystallization
        ? {
            source_type: 'database' as const,
            protein_concentration: null,
            precipitant_type: null,
            precipitant_conc: null,
            precipitant_unit: null,
            buffer_type: null,
            ph: entry.crystallization.ph,
            temperature: entry.crystallization.temperature != null
              ? Math.round(entry.crystallization.temperature * 10) / 10
              : null,
            outcome: 'diffraction_quality' as const,
            condition_detail: [
              entry.crystallization.method,
              entry.crystallization.details,
            ].filter(Boolean).join(' — '),
          }
        : null,
      expression: entry.expressionSystem
        ? {
            source_type: 'database' as const,
            host: entry.expressionSystem.host,
            strain: entry.expressionSystem.strain,
          }
        : null,
      structure: {
        source_type: 'database' as const,
        method: normalizeMethod(entry.method),
        resolution: entry.resolution,
        pdb_id: entry.pdbId,
      },
    },
  };

  return NextResponse.json(preview);
}

/**
 * POST /api/pdb-import — 미리보기 확인 후 실제 DB에 저장
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  // 일괄 등록: { pdbIds: string[] }
  if (body.pdbIds && Array.isArray(body.pdbIds)) {
    const results: { pdbId: string; success: boolean; message: string }[] = [];
    for (const id of body.pdbIds) {
      try {
        const result = await importSinglePdb(id);
        results.push({ pdbId: id, success: true, message: result.message });
      } catch (err: any) {
        results.push({ pdbId: id, success: false, message: err.message });
      }
    }
    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({
      message: `${successCount}/${results.length}개 등록 완료`,
      results,
    }, { status: 201 });
  }

  // 단건 등록: { pdbId: string }
  const { pdbId } = body;
  if (!pdbId) {
    return NextResponse.json({ error: 'pdbId is required' }, { status: 400 });
  }

  try {
    const result = await importSinglePdb(pdbId);
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

async function importSinglePdb(pdbId: string) {
  // Check if PDB ID already imported
  const existingStructure = await queryOne<{ id: number; pdb_id: string }>(
    'SELECT id, pdb_id FROM kbsi_structure WHERE pdb_id = $1',
    [pdbId.toUpperCase()]
  );

  if (existingStructure) {
    const err: any = new Error(`PDB ${pdbId} is already imported (structure id: ${existingStructure.id})`);
    err.status = 409;
    throw err;
  }

  // Fetch PDB data
  const entry = await fetchPDBEntry(pdbId);
  if (!entry) {
    const err: any = new Error(`PDB entry ${pdbId} not found`);
    err.status = 404;
    throw err;
  }

  // Fetch UniProt data
  const uniprotAccession = entry.polymerEntities[0]?.uniprotAccession;
  let uniprotData = null;
  if (uniprotAccession) {
    uniprotData = await fetchUniProtEntry(uniprotAccession);
  }

  // 1. Create or find protein
  const proteinName = entry.polymerEntities[0]?.name || entry.title;
  const existingProtein = await queryOne<{ id: number }>(
    'SELECT id FROM kbsi_protein WHERE full_name = $1 AND organism = $2',
    [proteinName, entry.organism || '']
  );

  let proteinId: number;
  if (existingProtein) {
    proteinId = existingProtein.id;
  } else {
    const newProtein = await queryOne<{ id: number }>(
      `INSERT INTO kbsi_protein (full_name, abbreviation, gene_name, organism)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [proteinName, uniprotData?.geneName || null, uniprotData?.geneName || null, entry.organism || uniprotData?.organism || null]
    );
    if (!newProtein) throw new Error('Failed to insert protein');
    proteinId = newProtein.id;
  }

  // 2. Create construct
  const construct = await queryOne<{ id: number }>(
    `INSERT INTO kbsi_construct (protein_id, name, seq_final, expression_system, vector, construct_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [proteinId, `${entry.pdbId} construct`, entry.polymerEntities[0]?.sequence || null, entry.expressionSystem?.host || null, entry.expressionSystem?.vector || null, 'full-length']
  );
  if (!construct) throw new Error('Failed to insert construct');
  const constructId = construct.id;

  const created: string[] = ['protein', 'construct'];

  // 3. Create expression record (if expression system info available)
  if (entry.expressionSystem) {
    try {
      await query(
        `INSERT INTO kbsi_expression (construct_id, source_type, host, strain)
         VALUES ($1, $2, $3, $4)`,
        [constructId, 'database', entry.expressionSystem.host, entry.expressionSystem.strain]
      );
      created.push('expression');
    } catch { /* ignore */ }
  }

  // 4. Create crystallization record
  if (entry.crystallization) {
    try {
      await query(
        `INSERT INTO kbsi_crystallization (construct_id, source_type, ph, temperature, outcome, condition_detail)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          constructId, 'database', entry.crystallization.ph,
          entry.crystallization.temperature != null ? Math.round(entry.crystallization.temperature * 10) / 10 : null,
          'diffraction_quality',
          [entry.crystallization.method, entry.crystallization.details].filter(Boolean).join(' — '),
        ]
      );
      created.push('crystallization');
    } catch { /* ignore */ }
  }

  // 5. Create structure record
  try {
    await query(
      `INSERT INTO kbsi_structure (construct_id, source_type, method, resolution, pdb_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [constructId, 'database', normalizeMethod(entry.method), entry.resolution, entry.pdbId]
    );
    created.push('structure');
  } catch { /* ignore */ }

  // 6. Store external database IDs
  if (uniprotAccession) {
    try {
      await query(
        `INSERT INTO kbsi_database_id (protein_id, db_name, db_value)
         VALUES ($1, $2, $3)`,
        [proteinId, 'UniProt', uniprotAccession]
      );
    } catch { /* ignore */ }
  }

  return {
    message: `Imported PDB ${entry.pdbId}: created ${created.join(', ')}`,
    proteinId,
    constructId,
    created,
  };
}

function normalizeMethod(pdbMethod: string): 'X-ray' | 'NMR' | 'Cryo-EM' {
  const m = pdbMethod.toUpperCase();
  if (m.includes('RAY') || m.includes('DIFFRACTION')) return 'X-ray';
  if (m.includes('NMR')) return 'NMR';
  if (m.includes('ELECTRON') || m.includes('CRYO')) return 'Cryo-EM';
  return 'X-ray';
}
