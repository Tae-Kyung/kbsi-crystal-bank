-- ============================================================================
-- 1. Crystal Morphology (결정 형태) 컬럼 추가
-- 기획보고서: 바늘형, 판형, 정육면체 등 결정의 형태 및 크기 정보
-- ============================================================================

CREATE TYPE kbsi_crystal_morphology AS ENUM (
  'needle', 'plate', 'cube', 'rod', 'prismatic',
  'bipyramidal', 'hexagonal', 'cluster', 'microcrystal', 'amorphous', 'other'
);

ALTER TABLE kbsi_crystallization ADD COLUMN IF NOT EXISTS crystal_morphology kbsi_crystal_morphology;
ALTER TABLE kbsi_crystallization ADD COLUMN IF NOT EXISTS crystal_size TEXT;

COMMENT ON COLUMN kbsi_crystallization.crystal_morphology IS '결정 형태: needle/plate/cube/rod/prismatic/bipyramidal/hexagonal/cluster/microcrystal/amorphous/other';
COMMENT ON COLUMN kbsi_crystallization.crystal_size IS '결정 크기 (예: 0.2 x 0.1 x 0.05 mm)';

-- ============================================================================
-- 2. 스크리닝 키트 룩업 테이블
-- 기획보고서: JCSG+, PACT, Index 등 사용된 스크리닝 키트 정보
-- ============================================================================

CREATE TABLE IF NOT EXISTS kbsi_screening_kit (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  manufacturer TEXT,
  conditions  INTEGER,
  description TEXT
);

INSERT INTO kbsi_screening_kit (name, manufacturer, conditions, description) VALUES
  ('JCSG+', 'Molecular Dimensions', 96, 'Joint Center for Structural Genomics core screen'),
  ('PACT premier', 'Molecular Dimensions', 96, 'pH, Anion, Cation Testing screen'),
  ('Index', 'Hampton Research', 96, 'Sparse matrix + grid screen'),
  ('Crystal Screen', 'Hampton Research', 50, 'Original sparse matrix screen'),
  ('Crystal Screen 2', 'Hampton Research', 48, 'Extension of Crystal Screen'),
  ('PEG/Ion', 'Hampton Research', 48, 'PEG-based conditions with various ions'),
  ('PEG/Ion 2', 'Hampton Research', 48, 'Extension of PEG/Ion'),
  ('PEGRx', 'Hampton Research', 96, 'PEG-focused optimization'),
  ('SaltRx', 'Hampton Research', 96, 'Salt-based conditions'),
  ('Wizard Classic', 'Rigaku (Emerald)', 96, 'Sparse matrix screen'),
  ('Wizard Cryo', 'Rigaku (Emerald)', 96, 'Cryoprotectant screen'),
  ('Morpheus', 'Molecular Dimensions', 96, 'Pre-mixed conditions with additives'),
  ('MIDAS', 'Molecular Dimensions', 96, 'Membrane protein screen'),
  ('MemGold', 'Molecular Dimensions', 96, 'Membrane protein optimization'),
  ('ProPlex', 'Molecular Dimensions', 96, 'Protein complex screen'),
  ('Classics Suite', 'Qiagen', 96, 'Classic sparse matrix'),
  ('JCSG Core I-IV', 'Qiagen', 384, 'Comprehensive JCSG screens'),
  ('AmSO4 Suite', 'Qiagen', 96, 'Ammonium sulfate optimization'),
  ('ComPAS Suite', 'Qiagen', 96, 'Combined sparse matrix'),
  ('MbClass Suite', 'Qiagen', 96, 'Membrane protein screen')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE kbsi_crystallization ADD COLUMN IF NOT EXISTS screening_kit_id BIGINT REFERENCES kbsi_screening_kit(id);

-- ============================================================================
-- 3. K-BDS 표준 메타데이터 매핑 테이블
-- 국가바이오데이터스테이션 표준과 KBSI 스키마 간 매핑
-- ============================================================================

CREATE TABLE IF NOT EXISTS kbsi_kbds_mapping (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kbsi_table      TEXT NOT NULL,
  kbsi_column     TEXT NOT NULL,
  kbds_category   TEXT NOT NULL,
  kbds_field      TEXT NOT NULL,
  kbds_standard   TEXT,
  description     TEXT,
  UNIQUE (kbsi_table, kbsi_column)
);

INSERT INTO kbsi_kbds_mapping (kbsi_table, kbsi_column, kbds_category, kbds_field, kbds_standard, description) VALUES
  ('kbsi_protein', 'full_name', '단백질/화합물', '단백질명', 'K-BDS-BIO-001', '단백질 공식 명칭'),
  ('kbsi_protein', 'organism', '단백질/화합물', '유래종', 'K-BDS-BIO-002', '생물학적 출처'),
  ('kbsi_protein', 'gene_name', '단백질/화합물', '유전자명', 'K-BDS-BIO-003', '유전자 심볼'),
  ('kbsi_construct', 'expression_system', '공정', '발현시스템', 'K-BDS-PROC-001', '발현 숙주'),
  ('kbsi_construct', 'vector', '공정', '벡터종류', 'K-BDS-PROC-002', '발현 벡터'),
  ('kbsi_construct', 'tag_name', '공정', '태그종류', 'K-BDS-PROC-003', 'His-tag, GST-tag 등'),
  ('kbsi_expression', 'host', '공정', '발현숙주', 'K-BDS-PROC-004', 'E. coli, HEK293 등'),
  ('kbsi_expression', 'induction_temp', '공정', '발현온도', 'K-BDS-PROC-005', '유도 온도 (°C)'),
  ('kbsi_expression', 'conditions', '공정', '발현조건', 'K-BDS-PROC-006', 'IPTG 농도, 시간 등'),
  ('kbsi_purification', 'method_summary', '공정', '정제방법', 'K-BDS-PROC-007', 'Ni-NTA, SEC 등'),
  ('kbsi_crystallization', 'ph', '측정·분석', 'pH', 'K-BDS-MEAS-001', '결정화 pH'),
  ('kbsi_crystallization', 'temperature', '측정·분석', '온도', 'K-BDS-MEAS-002', '결정화 온도 (°C)'),
  ('kbsi_crystallization', 'precipitant_type', '측정·분석', '침전제', 'K-BDS-MEAS-003', 'PEG, AmSO4 등'),
  ('kbsi_crystallization', 'outcome', '측정·분석', '결과등급', 'K-BDS-MEAS-004', '결정화 결과'),
  ('kbsi_structure', 'method', '측정·분석', '구조결정법', 'K-BDS-MEAS-005', 'X-ray, NMR, Cryo-EM'),
  ('kbsi_structure', 'resolution', '측정·분석', '해상도', 'K-BDS-MEAS-006', '구조 해상도 (Å)'),
  ('kbsi_structure', 'pdb_id', '해석', 'PDB등록번호', 'K-BDS-ANAL-001', 'RCSB PDB ID'),
  ('kbsi_ligand', 'smiles', '단백질/화합물', 'SMILES', 'K-BDS-BIO-004', '화합물 구조'),
  ('kbsi_construct_ligand', 'binding_kd', '측정·분석', '결합상수', 'K-BDS-MEAS-007', 'Kd (nM)'),
  ('kbsi_construct_ligand', 'binding_ic50', '측정·분석', 'IC50', 'K-BDS-MEAS-008', 'IC50 (nM)')
ON CONFLICT (kbsi_table, kbsi_column) DO NOTHING;
