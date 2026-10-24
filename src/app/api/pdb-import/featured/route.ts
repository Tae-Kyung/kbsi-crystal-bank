import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { fetchPDBEntry } from '@/lib/external/pdb';

/**
 * GET /api/pdb-import/featured — DB에서 추천 단백질 목록 + 등록 여부
 */
export async function GET() {
  const featuredList = await query(
    `SELECT pdb_id, name, organism, method, resolution, description
     FROM kbsi_featured_protein
     ORDER BY id`
  );

  // 이미 등록된 PDB ID 목록 조회
  const pdbIds = (featuredList || []).map((p: any) => p.pdb_id);
  const imported = pdbIds.length > 0
    ? await query<{ pdb_id: string }>(
        'SELECT pdb_id FROM kbsi_structure WHERE pdb_id = ANY($1)',
        [pdbIds]
      )
    : [];

  const importedSet = new Set((imported || []).map((r) => r.pdb_id));

  const results = (featuredList || []).map((p: any) => ({
    pdbId: p.pdb_id,
    name: p.name,
    organism: p.organism,
    method: p.method,
    resolution: parseFloat(p.resolution),
    description: p.description,
    imported: importedSet.has(p.pdb_id),
  }));

  return NextResponse.json({ results });
}

/**
 * POST /api/pdb-import/featured — PDB ID로 추천 목록에 동적 추가
 * body: { pdbId: string }
 */
export async function POST(request: NextRequest) {
  const { pdbId } = await request.json();

  if (!pdbId || !/^[0-9][A-Za-z0-9]{3}$/.test(pdbId)) {
    return NextResponse.json({ error: '유효한 PDB ID를 입력해주세요 (예: 1LYZ)' }, { status: 400 });
  }

  const id = pdbId.toUpperCase();

  // 중복 확인
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM kbsi_featured_protein WHERE pdb_id = $1',
    [id]
  );

  if (existing) {
    return NextResponse.json({ error: `${id}는 이미 추천 목록에 있습니다` }, { status: 409 });
  }

  // PDB에서 정보 가져오기
  const entry = await fetchPDBEntry(id);
  if (!entry) {
    return NextResponse.json({ error: `PDB에서 ${id}를 찾을 수 없습니다` }, { status: 404 });
  }

  try {
    await query(
      `INSERT INTO kbsi_featured_protein (pdb_id, name, organism, method, resolution, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, entry.polymerEntities[0]?.name || entry.title, entry.organism || null, entry.method, entry.resolution, entry.title]
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ message: `${id} 추천 목록에 추가됨` }, { status: 201 });
}

/**
 * DELETE /api/pdb-import/featured — 추천 목록에서 제거
 * body: { pdbId: string }
 */
export async function DELETE(request: NextRequest) {
  const { pdbId } = await request.json();

  try {
    await query(
      'DELETE FROM kbsi_featured_protein WHERE pdb_id = $1',
      [pdbId.toUpperCase()]
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ message: `${pdbId} 추천 목록에서 제거됨` });
}
