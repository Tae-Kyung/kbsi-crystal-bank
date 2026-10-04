import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/sequence-search?sequence=MTEYKLVVVGAGGVGKS...&limit=10
 * 서열 유사도 기반 단백질 검색 — 간단한 k-mer 유사도
 * 유사한 단백질의 성공 결정화 조건 추천
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const querySeq = (searchParams.get('sequence') || '').toUpperCase().replace(/[^A-Z]/g, '');
  const limit = parseInt(searchParams.get('limit') || '10');

  if (querySeq.length < 10) {
    return NextResponse.json({ error: 'Sequence must be at least 10 residues' }, { status: 400 });
  }

  const supabase = await createClient();

  // 서열이 있는 construct 조회 (최대 5000건)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: constructs } = await (supabase as any)
    .from('kbsi_construct')
    .select('id, name, protein_id, seq_final, kbsi_protein(full_name, organism)')
    .not('seq_final', 'is', null)
    .limit(5000);

  if (!constructs || (constructs as any[]).length === 0) {
    return NextResponse.json({ results: [], message: 'No sequences in database' });
  }

  // k-mer 유사도 계산 (k=3)
  const K = 3;
  const queryKmers = extractKmers(querySeq, K);

  const similarities = (constructs as any[])
    .map((c: any) => {
      const seq = (c.seq_final || '').toUpperCase();
      if (seq.length < 10) return null;
      const targetKmers = extractKmers(seq, K);
      const similarity = jaccardSimilarity(queryKmers, targetKmers);
      return {
        construct_id: c.id,
        construct_name: c.name,
        protein_id: c.protein_id,
        protein_name: (c.kbsi_protein as any)?.full_name || '',
        organism: (c.kbsi_protein as any)?.organism || '',
        sequence_length: seq.length,
        similarity: Math.round(similarity * 1000) / 10, // %
      };
    })
    .filter((r: any): r is NonNullable<typeof r> => r !== null && r.similarity > 5)
    .sort((a: any, b: any) => b.similarity - a.similarity)
    .slice(0, limit);

  // 상위 결과의 결정화 성공 조건 조회
  const topConstructIds = similarities.slice(0, 5).map(s => s.construct_id);
  let conditions: any[] = [];
  if (topConstructIds.length > 0) {
    const { data } = await supabase
      .from('kbsi_crystallization')
      .select('construct_id, precipitant_type, precipitant_conc, precipitant_unit, ph, temperature, outcome')
      .in('construct_id', topConstructIds)
      .or('outcome.eq.diffraction_quality,outcome.eq.single_crystal')
      .neq('source_type', 'synthetic')
      .limit(20);
    conditions = data || [];
  }

  return NextResponse.json({
    query_length: querySeq.length,
    total_compared: constructs.length,
    results: similarities,
    recommended_conditions: conditions,
  });
}

function extractKmers(seq: string, k: number): Set<string> {
  const kmers = new Set<string>();
  for (let i = 0; i <= seq.length - k; i++) {
    kmers.add(seq.substring(i, i + k));
  }
  return kmers;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const kmer of a) {
    if (b.has(kmer)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}
