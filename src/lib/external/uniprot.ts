/**
 * UniProt API 클라이언트
 * 단백질 서열, 기능 정보, 외부 DB 교차 참조를 자동으로 fetch
 */

const UNIPROT_API = 'https://rest.uniprot.org/uniprotkb';

export interface UniProtEntry {
  accession: string;
  id: string;
  proteinName: string;
  geneName: string | null;
  organism: string | null;
  sequence: string;
  sequenceLength: number;
  function: string | null;
  subcellularLocation: string | null;
  pdbIds: string[];
}

/**
 * UniProt accession으로 단백질 정보 조회
 */
export async function fetchUniProtEntry(accession: string): Promise<UniProtEntry | null> {
  const res = await fetch(`${UNIPROT_API}/${accession}.json`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return null;

  const data = await res.json();

  const proteinName =
    data.proteinDescription?.recommendedName?.fullName?.value ||
    data.proteinDescription?.submittedName?.[0]?.fullName?.value ||
    'Unknown';

  const geneName = data.genes?.[0]?.geneName?.value || null;
  const organism = data.organism?.scientificName || null;

  const functionComment = data.comments?.find((c: any) => c.commentType === 'FUNCTION');
  const functionText = functionComment?.texts?.[0]?.value || null;

  const locationComment = data.comments?.find((c: any) => c.commentType === 'SUBCELLULAR LOCATION');
  const subcellularLocation =
    locationComment?.subcellularLocations
      ?.map((loc: any) => loc.location?.value)
      .filter(Boolean)
      .join(', ') || null;

  const pdbRefs = data.uniProtKBCrossReferences?.filter((ref: any) => ref.database === 'PDB') || [];
  const pdbIds = pdbRefs.map((ref: any) => ref.id);

  return {
    accession: data.primaryAccession,
    id: data.uniProtkbId,
    proteinName,
    geneName,
    organism,
    sequence: data.sequence?.value || '',
    sequenceLength: data.sequence?.length || 0,
    function: functionText,
    subcellularLocation,
    pdbIds,
  };
}

/**
 * 유전자명으로 UniProt 검색
 */
export async function searchUniProt(
  query: string,
  organism?: string,
  limit = 10
): Promise<{ accession: string; name: string; organism: string; gene: string }[]> {
  let searchQuery = query;
  if (organism) {
    searchQuery += ` AND organism_name:${organism}`;
  }

  const params = new URLSearchParams({
    query: searchQuery,
    format: 'json',
    size: String(limit),
    fields: 'accession,protein_name,organism_name,gene_names',
  });

  const res = await fetch(`${UNIPROT_API}/search?${params}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return [];

  const data = await res.json();

  return (data.results || []).map((entry: any) => ({
    accession: entry.primaryAccession,
    name:
      entry.proteinDescription?.recommendedName?.fullName?.value ||
      entry.proteinDescription?.submittedName?.[0]?.fullName?.value ||
      'Unknown',
    organism: entry.organism?.scientificName || '',
    gene: entry.genes?.[0]?.geneName?.value || '',
  }));
}
