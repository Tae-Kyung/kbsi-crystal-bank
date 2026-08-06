/**
 * RCSB PDB API 클라이언트
 * 구조 정보, 해상도, 실험 방법 등을 자동으로 fetch
 */

const PDB_API = 'https://data.rcsb.org/rest/v1/core';

export interface PDBEntry {
  pdbId: string;
  title: string;
  method: string;
  resolution: number | null;
  releaseDate: string | null;
  authors: string[];
  organism: string | null;
  spaceGroup: string | null;
  unitCell: { a: number; b: number; c: number; alpha: number; beta: number; gamma: number } | null;
  polymerEntities: {
    entityId: string;
    name: string;
    sequence: string;
    uniprotAccession: string | null;
  }[];
}

/**
 * PDB ID로 구조 정보 조회
 */
export async function fetchPDBEntry(pdbId: string): Promise<PDBEntry | null> {
  const id = pdbId.toLowerCase();

  // Entry info
  const entryRes = await fetch(`${PDB_API}/entry/${id}`);
  if (!entryRes.ok) return null;
  const entry = await entryRes.json();

  // Entity info (polymer chains)
  const entityRes = await fetch(`https://data.rcsb.org/rest/v1/core/polymer_entity/${id}/1`);
  const entity = entityRes.ok ? await entityRes.json() : null;

  const method = entry.exptl?.[0]?.method || 'Unknown';

  let resolution: number | null = null;
  if (method.includes('RAY')) {
    resolution = entry.rcsb_entry_info?.resolution_combined?.[0] || null;
  } else if (method.includes('ELECTRON')) {
    resolution = entry.rcsb_entry_info?.resolution_combined?.[0] || null;
  }

  const cell = entry.cell;
  const unitCell = cell
    ? {
        a: cell.length_a,
        b: cell.length_b,
        c: cell.length_c,
        alpha: cell.angle_alpha,
        beta: cell.angle_beta,
        gamma: cell.angle_gamma,
      }
    : null;

  const polymerEntities: PDBEntry['polymerEntities'] = [];
  if (entity) {
    const uniprotRef = entity.rcsb_polymer_entity_container_identifiers?.uniprot_ids?.[0] || null;
    polymerEntities.push({
      entityId: '1',
      name: entity.rcsb_polymer_entity?.pdbx_description || '',
      sequence: entity.entity_poly?.pdbx_seq_one_letter_code_can || '',
      uniprotAccession: uniprotRef,
    });
  }

  return {
    pdbId: id.toUpperCase(),
    title: entry.struct?.title || '',
    method,
    resolution,
    releaseDate: entry.rcsb_accession_info?.initial_release_date || null,
    authors: entry.audit_author?.map((a: any) => a.name) || [],
    organism: entry.rcsb_entry_info?.polymer_entity_count_protein
      ? entity?.rcsb_entity_source_organism?.[0]?.scientific_name || null
      : null,
    spaceGroup: entry.symmetry?.space_group_name_H_M || null,
    unitCell,
    polymerEntities,
  };
}

/**
 * 텍스트 검색으로 PDB 구조 찾기
 */
export async function searchPDB(
  query: string,
  limit = 10
): Promise<{ pdbId: string; title: string; method: string; resolution: number | null }[]> {
  const body = {
    query: {
      type: 'terminal',
      service: 'full_text',
      parameters: { value: query },
    },
    return_type: 'entry',
    request_options: {
      paginate: { start: 0, rows: limit },
      results_content_type: ['experimental'],
    },
  };

  const res = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const ids: string[] = (data.result_set || []).map((r: any) => r.identifier);

  // Fetch minimal info for each result
  const results = await Promise.all(
    ids.slice(0, limit).map(async (id) => {
      const entryRes = await fetch(`${PDB_API}/entry/${id.toLowerCase()}`);
      if (!entryRes.ok) return null;
      const entry = await entryRes.json();
      return {
        pdbId: id,
        title: entry.struct?.title || '',
        method: entry.exptl?.[0]?.method || '',
        resolution: entry.rcsb_entry_info?.resolution_combined?.[0] || null,
      };
    })
  );

  return results.filter(Boolean) as any[];
}
