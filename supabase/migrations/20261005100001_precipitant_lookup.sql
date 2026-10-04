-- ============================================================================
-- Precipitant 정규화 룩업 테이블 + 기존 데이터 소급 정규화
-- "PEG3350", "PEG 3350", "polyethylene glycol 3350" → "PEG 3350"
-- ============================================================================

CREATE TABLE IF NOT EXISTS kbsi_precipitant_lookup (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_name    TEXT NOT NULL UNIQUE,
  normalized  TEXT NOT NULL,
  category    TEXT  -- PEG, Salt, Organic, Other
);

-- 주요 침전제 정규화 매핑
INSERT INTO kbsi_precipitant_lookup (raw_name, normalized, category) VALUES
  -- PEG 계열
  ('PEG 3350', 'PEG 3350', 'PEG'),
  ('PEG3350', 'PEG 3350', 'PEG'),
  ('polyethylene glycol 3350', 'PEG 3350', 'PEG'),
  ('Polyethylene glycol 3350', 'PEG 3350', 'PEG'),
  ('PEG 4000', 'PEG 4000', 'PEG'),
  ('PEG4000', 'PEG 4000', 'PEG'),
  ('PEG 4K', 'PEG 4000', 'PEG'),
  ('polyethylene glycol 4000', 'PEG 4000', 'PEG'),
  ('PEG 6000', 'PEG 6000', 'PEG'),
  ('PEG6000', 'PEG 6000', 'PEG'),
  ('PEG 6K', 'PEG 6000', 'PEG'),
  ('polyethylene glycol 6000', 'PEG 6000', 'PEG'),
  ('PEG 8000', 'PEG 8000', 'PEG'),
  ('PEG8000', 'PEG 8000', 'PEG'),
  ('PEG 8K', 'PEG 8000', 'PEG'),
  ('polyethylene glycol 8000', 'PEG 8000', 'PEG'),
  ('PEG 400', 'PEG 400', 'PEG'),
  ('PEG400', 'PEG 400', 'PEG'),
  ('polyethylene glycol 400', 'PEG 400', 'PEG'),
  ('PEG 1500', 'PEG 1500', 'PEG'),
  ('PEG1500', 'PEG 1500', 'PEG'),
  ('PEG 2000', 'PEG 2000', 'PEG'),
  ('PEG 10000', 'PEG 10000', 'PEG'),
  ('PEG 10K', 'PEG 10000', 'PEG'),
  ('PEG 20000', 'PEG 20000', 'PEG'),
  ('PEG 20K', 'PEG 20000', 'PEG'),
  ('PEG MME 2000', 'PEG MME 2000', 'PEG'),
  ('PEG2000 MME', 'PEG MME 2000', 'PEG'),
  ('PEG 2000 monomethyl ether', 'PEG MME 2000', 'PEG'),
  ('PEG MME 5000', 'PEG MME 5000', 'PEG'),
  ('PEG 5000 MME', 'PEG MME 5000', 'PEG'),
  ('PEG5000 MME', 'PEG MME 5000', 'PEG'),
  ('PEG5KMME', 'PEG MME 5000', 'PEG'),
  ('PEG 500 MME', 'PEG MME 500', 'PEG'),
  -- 염 계열
  ('Ammonium Sulfate', 'Ammonium Sulfate', 'Salt'),
  ('ammonium sulfate', 'Ammonium Sulfate', 'Salt'),
  ('Ammonium sulfate', 'Ammonium Sulfate', 'Salt'),
  ('ammonium sulphate', 'Ammonium Sulfate', 'Salt'),
  ('Ammonium sulphate', 'Ammonium Sulfate', 'Salt'),
  ('(NH4)2SO4', 'Ammonium Sulfate', 'Salt'),
  ('Sodium Chloride', 'Sodium Chloride', 'Salt'),
  ('sodium chloride', 'Sodium Chloride', 'Salt'),
  ('NaCl', 'Sodium Chloride', 'Salt'),
  ('Lithium Sulfate', 'Lithium Sulfate', 'Salt'),
  ('lithium sulfate', 'Lithium Sulfate', 'Salt'),
  ('Sodium Sulfate', 'Sodium Sulfate', 'Salt'),
  ('sodium sulfate', 'Sodium Sulfate', 'Salt'),
  ('sodium sulphate', 'Sodium Sulfate', 'Salt'),
  ('Magnesium sulfate', 'Magnesium Sulfate', 'Salt'),
  -- 유기 용매
  ('MPD', 'MPD', 'Organic'),
  ('2-Methyl-2,4-pentanediol', 'MPD', 'Organic'),
  ('Isopropanol', 'Isopropanol', 'Organic'),
  ('isopropanol', 'Isopropanol', 'Organic'),
  ('Ethanol', 'Ethanol', 'Organic'),
  ('ethanol', 'Ethanol', 'Organic'),
  -- 기타
  ('Sodium Citrate', 'Sodium Citrate', 'Other'),
  ('sodium citrate', 'Sodium Citrate', 'Other'),
  ('Sodium Acetate', 'Sodium Acetate', 'Other'),
  ('sodium acetate', 'Sodium Acetate', 'Other')
ON CONFLICT (raw_name) DO NOTHING;

-- 기존 데이터 정규화 (룩업 테이블 기반)
UPDATE kbsi_crystallization c
SET precipitant_type = l.normalized
FROM kbsi_precipitant_lookup l
WHERE c.precipitant_type = l.raw_name
  AND c.precipitant_type != l.normalized;
