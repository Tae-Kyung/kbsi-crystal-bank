import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * 인기/교육적 단백질 검색 키워드 카테고리
 */
const SEARCH_CATEGORIES = [
  { keyword: 'kinase', label: '키나아제' },
  { keyword: 'protease', label: '프로테아제' },
  { keyword: 'polymerase', label: '폴리머라아제' },
  { keyword: 'receptor', label: '수용체' },
  { keyword: 'antibody', label: '항체' },
  { keyword: 'transferase', label: '전이효소' },
  { keyword: 'oxidoreductase', label: '산화환원효소' },
  { keyword: 'chaperone', label: '샤페론' },
  { keyword: 'nuclease', label: '뉴클레아제' },
  { keyword: 'synthase', label: '합성효소' },
  { keyword: 'dehydrogenase', label: '탈수소효소' },
  { keyword: 'phosphatase', label: '포스파타아제' },
  { keyword: 'transporter', label: '수송체' },
  { keyword: 'ribosome', label: '리보솜' },
  { keyword: 'histone', label: '히스톤' },
  { keyword: 'collagen', label: '콜라겐' },
  { keyword: 'actin', label: '액틴' },
  { keyword: 'tubulin', label: '튜불린' },
  { keyword: 'cytochrome', label: '시토크롬' },
  { keyword: 'ferritin', label: '페리틴' },
];

const PDB_API = 'https://data.rcsb.org/rest/v1/core';

/**
 * GET /api/pdb-import/featured/suggest?count=5
 * PDB에서 아직 추천 목록에 없는 단백질을 카테고리별로 추천
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const count = Math.min(parseInt(searchParams.get('count') || '6'), 20);

  const supabase = await createClient();

  // 현재 추천 목록의 PDB ID 조회
  const { data: existing } = await (supabase.from('kbsi_featured_protein') as any)
    .select('pdb_id');
  const existingSet = new Set((existing || []).map((r: any) => r.pdb_id));

  // 랜덤 카테고리 선택
  const shuffled = [...SEARCH_CATEGORIES].sort(() => Math.random() - 0.5);
  const suggestions: any[] = [];

  for (const category of shuffled) {
    if (suggestions.length >= count) break;

    try {
      // PDB 검색 (해상도 좋은 X-ray 구조 우선)
      const body = {
        query: {
          type: 'group',
          logical_operator: 'and',
          nodes: [
            {
              type: 'terminal',
              service: 'full_text',
              parameters: { value: category.keyword },
            },
            {
              type: 'terminal',
              service: 'text',
              parameters: {
                attribute: 'exptl.method',
                operator: 'exact_match',
                value: 'X-RAY DIFFRACTION',
              },
            },
          ],
        },
        return_type: 'entry',
        request_options: {
          paginate: { start: 0, rows: 10 },
          results_content_type: ['experimental'],
          sort: [{ sort_by: 'rcsb_accession_info.initial_release_date', direction: 'desc' }],
        },
      };

      const res = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const ids: string[] = (data.result_set || []).map((r: any) => r.identifier);

      // 기존 목록에 없는 것만 필터
      const newIds = ids.filter((id) => !existingSet.has(id));
      if (newIds.length === 0) continue;

      // 첫 번째 새 항목의 상세 정보 조회
      const pdbId = newIds[0];
      const entryRes = await fetch(`${PDB_API}/entry/${pdbId.toLowerCase()}`);
      if (!entryRes.ok) continue;
      const entry = await entryRes.json();

      const entityRes = await fetch(`${PDB_API}/polymer_entity/${pdbId.toLowerCase()}/1`);
      const entity = entityRes.ok ? await entityRes.json() : null;

      const resolution = entry.rcsb_entry_info?.resolution_combined?.[0] || null;
      const organism = entity?.rcsb_entity_source_organism?.[0]?.scientific_name || null;

      suggestions.push({
        pdbId,
        name: entity?.rcsb_polymer_entity?.pdbx_description || entry.struct?.title || '',
        organism,
        method: entry.exptl?.[0]?.method || 'X-RAY DIFFRACTION',
        resolution,
        description: entry.struct?.title || '',
        category: category.label,
      });

      existingSet.add(pdbId); // 중복 방지
    } catch {
      continue;
    }
  }

  return NextResponse.json({ suggestions });
}
