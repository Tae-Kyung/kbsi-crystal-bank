-- full_name_normalized 컬럼 추가 (원본 full_name 보존)
ALTER TABLE kbsi_protein ADD COLUMN IF NOT EXISTS full_name_normalized TEXT;
