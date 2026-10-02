import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchPDBEntry } from '@/lib/external/pdb';

/**
 * GET /api/pdb-import/featured — DB에서 추천 단백질 목록 + 등록 여부
 */
export async function GET() {
  const supabase = await createClient();

  // DB에서 추천 목록 조회
  const { data: featuredList, error } = await (supabase.from('kbsi_featured_protein') as any)
    .select('pdb_id, name, organism, method, resolution, description')
    .order('id', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 이미 등록된 PDB ID 목록 조회
  const pdbIds = (featuredList || []).map((p: any) => p.pdb_id);
  const { data: imported } = await (supabase.from('kbsi_structure') as any)
    .select('pdb_id')
    .in('pdb_id', pdbIds);

  const importedSet = new Set((imported || []).map((r: any) => r.pdb_id));

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
  const supabase = await createClient();
  const { pdbId } = await request.json();

  if (!pdbId || !/^[0-9][A-Za-z0-9]{3}$/.test(pdbId)) {
    return NextResponse.json({ error: '유효한 PDB ID를 입력해주세요 (예: 1LYZ)' }, { status: 400 });
  }

  const id = pdbId.toUpperCase();

  // 중복 확인
  const { data: existing } = await (supabase.from('kbsi_featured_protein') as any)
    .select('id')
    .eq('pdb_id', id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: `${id}는 이미 추천 목록에 있습니다` }, { status: 409 });
  }

  // PDB에서 정보 가져오기
  const entry = await fetchPDBEntry(id);
  if (!entry) {
    return NextResponse.json({ error: `PDB에서 ${id}를 찾을 수 없습니다` }, { status: 404 });
  }

  const { error: insertError } = await (supabase.from('kbsi_featured_protein') as any)
    .insert({
      pdb_id: id,
      name: entry.polymerEntities[0]?.name || entry.title,
      organism: entry.organism || null,
      method: entry.method,
      resolution: entry.resolution,
      description: entry.title,
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ message: `${id} 추천 목록에 추가됨` }, { status: 201 });
}

/**
 * DELETE /api/pdb-import/featured — 추천 목록에서 제거
 * body: { pdbId: string }
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { pdbId } = await request.json();

  const { error } = await (supabase.from('kbsi_featured_protein') as any)
    .delete()
    .eq('pdb_id', pdbId.toUpperCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `${pdbId} 추천 목록에서 제거됨` });
}
