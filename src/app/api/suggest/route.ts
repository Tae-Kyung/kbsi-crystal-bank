import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/suggest?q=kras -- 통합 키워드 검색 추천
 * kbsi_search_keywords 테이블 우선, fallback으로 kbsi_protein 직접 검색
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    // 1. 통합 키워드 테이블에서 검색 (trigram index)
    const kwResults = await query<{ keyword: string; type: string; entity_id: number; frequency: number }>(
      `SELECT keyword, type, entity_id, frequency
       FROM kbsi_search_keywords
       WHERE keyword ILIKE $1
       ORDER BY frequency DESC
       LIMIT 15`,
      [`${q}%`]
    );

    if (kwResults.length > 0) {
      // 검색 로그 저장 (fire-and-forget)
      query('INSERT INTO kbsi_search_log (query, result_count) VALUES ($1, $2)', [q, kwResults.length]).catch(() => {});

      const suggestions = kwResults.map(k => ({
        id: k.entity_id,
        label: k.keyword,
        sub: k.type === 'gene_name' ? 'Gene' : k.type === 'abbreviation' ? 'Protein' : k.type === 'organism' ? 'Organism' : k.type === 'precipitant' ? 'Precipitant' : k.type === 'host' ? 'Expression System' : k.type === 'pdb_id' ? 'PDB' : k.type,
        type: k.type,
      }));

      return NextResponse.json(suggestions, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }

    // 2. Fallback: kbsi_protein 직접 검색
    const [abbrMatch, geneMatch, nameMatch] = await Promise.all([
      query<{ id: number; full_name: string; abbreviation: string; gene_name: string; organism: string }>(
        `SELECT id, full_name, abbreviation, gene_name, organism
         FROM kbsi_protein WHERE abbreviation ILIKE $1 LIMIT 5`,
        [`${q}%`]
      ),
      query<{ id: number; full_name: string; abbreviation: string; gene_name: string; organism: string }>(
        `SELECT id, full_name, abbreviation, gene_name, organism
         FROM kbsi_protein WHERE gene_name ILIKE $1 LIMIT 5`,
        [`${q}%`]
      ),
      query<{ id: number; full_name: string; abbreviation: string; gene_name: string; organism: string }>(
        `SELECT id, full_name, abbreviation, gene_name, organism
         FROM kbsi_protein WHERE full_name ILIKE $1 LIMIT 5`,
        [`%${q}%`]
      ),
    ]);

    const seen = new Set<number>();
    const merged: any[] = [];
    for (const list of [abbrMatch, geneMatch, nameMatch]) {
      for (const p of list) {
        if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
      }
    }

    // 검색 로그 (fire-and-forget)
    query('INSERT INTO kbsi_search_log (query, result_count) VALUES ($1, $2)', [q, merged.length]).catch(() => {});

    const suggestions = merged.slice(0, 10).map((p: any) => ({
      id: p.id,
      label: p.abbreviation || p.gene_name || p.full_name?.slice(0, 40),
      sub: [p.gene_name, p.organism?.slice(0, 20)].filter(Boolean).join(' · '),
      type: 'protein',
    }));

    return NextResponse.json(suggestions, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
