import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

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

  // 서열이 있는 construct 조회 (최대 5000건)
  const constructs = await query(
    `SELECT c.id, c.name, c.protein_id, c.seq_final,
            p.full_name AS "protein_full_name", p.organism AS "protein_organism"
     FROM kbsi_construct c
     JOIN kbsi_protein p ON p.id = c.protein_id
     WHERE c.seq_final IS NOT NULL
     LIMIT 5000`
  );

  if (!constructs || constructs.length === 0) {
    return NextResponse.json({ results: [], message: 'No sequences in database' });
  }

  // k-mer 유사도 계산 (k=3)
  const K = 3;
  const queryKmers = extractKmers(querySeq, K);

  const similarities = constructs
    .map((c: any) => {
      const seq = (c.seq_final || '').toUpperCase();
      if (seq.length < 10) return null;
      const targetKmers = extractKmers(seq, K);
      const similarity = jaccardSimilarity(queryKmers, targetKmers);
      return {
        construct_id: c.id,
        construct_name: c.name,
        protein_id: c.protein_id,
        protein_name: c.protein_full_name || '',
        organism: c.protein_organism || '',
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
    conditions = await query(
      `SELECT construct_id, precipitant_type, precipitant_conc, precipitant_unit, ph, temperature, outcome
       FROM kbsi_crystallization
       WHERE construct_id = ANY($1)
         AND outcome IN ('diffraction_quality', 'single_crystal')
         AND source_type != 'synthetic'
       LIMIT 20`,
      [topConstructIds]
    );
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
