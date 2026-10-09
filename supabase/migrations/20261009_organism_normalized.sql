-- organism_normalized 컬럼 추가 (원본 organism 보존)
ALTER TABLE kbsi_protein ADD COLUMN IF NOT EXISTS organism_normalized TEXT;
CREATE INDEX IF NOT EXISTS idx_protein_organism_normalized ON kbsi_protein (organism_normalized);
