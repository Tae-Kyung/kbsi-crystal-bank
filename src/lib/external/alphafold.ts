/**
 * AlphaFold DB API 클라이언트
 * UniProt accession 기반 예측 구조 정보 조회
 */

const ALPHAFOLD_API = 'https://alphafold.ebi.ac.uk/api';

export interface AlphaFoldPrediction {
  entryId: string;
  uniprotAccession: string;
  uniprotId: string;
  uniprotDescription: string;
  gene: string | null;
  organism: string | null;
  taxId: number | null;
  pdbUrl: string;
  cifUrl: string;
  paeImageUrl: string;
  modelCreatedDate: string | null;
  latestVersion: number;
  globalMetricType: string | null;
  globalMetricValue: number | null;
}

/**
 * UniProt accession으로 AlphaFold 예측 구조 조회
 */
export async function fetchAlphaFoldPrediction(
  uniprotAccession: string
): Promise<AlphaFoldPrediction | null> {
  const res = await fetch(
    `${ALPHAFOLD_API}/prediction/${uniprotAccession}`,
    { headers: { Accept: 'application/json' } }
  );

  if (!res.ok) return null;

  const entries = await res.json();
  const entry = Array.isArray(entries) ? entries[0] : entries;
  if (!entry) return null;

  return {
    entryId: entry.entryId || '',
    uniprotAccession: entry.uniprotAccession || uniprotAccession,
    uniprotId: entry.uniprotId || '',
    uniprotDescription: entry.uniprotDescription || '',
    gene: entry.gene || null,
    organism: entry.organismScientificName || null,
    taxId: entry.taxId || null,
    pdbUrl: entry.pdbUrl || '',
    cifUrl: entry.cifUrl || '',
    paeImageUrl: entry.paeImageUrl || '',
    modelCreatedDate: entry.modelCreatedDate || null,
    latestVersion: entry.latestVersion || 1,
    globalMetricType: entry.globalMetricType || null,
    globalMetricValue: entry.globalMetricValue || null,
  };
}

/**
 * AlphaFold 예측 구조의 PDB 파일 URL 생성
 */
export function getAlphaFoldModelUrl(uniprotAccession: string, version = 4): string {
  return `https://alphafold.ebi.ac.uk/files/AF-${uniprotAccession}-F1-model_v${version}.pdb`;
}

/**
 * AlphaFold PAE (Predicted Aligned Error) 이미지 URL 생성
 */
export function getAlphaFoldPaeUrl(uniprotAccession: string, version = 4): string {
  return `https://alphafold.ebi.ac.uk/files/AF-${uniprotAccession}-F1-predicted_aligned_error_v${version}.json`;
}
