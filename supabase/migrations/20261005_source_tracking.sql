-- ============================================================================
-- 출처 추적 강화: source_db + source_id 컬럼 추가
-- 기존 source_type(experimental/literature/database/synthetic)에 더해
-- 어떤 DB에서 왔는지, 해당 DB의 ID가 무엇인지 명시적으로 추적
-- ============================================================================

-- 실험 테이블들에 source_db, source_id 컬럼 추가
ALTER TABLE kbsi_expression ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_expression ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_purification ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_purification ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_crystallization ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_crystallization ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_characterization ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_characterization ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_diffraction ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_diffraction ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_structure ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_structure ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_storage ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_storage ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_nmr_experiment ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_nmr_experiment ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_cryoem_session ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_cryoem_session ADD COLUMN IF NOT EXISTS source_id TEXT;

-- 리간드 테이블에도 추가
ALTER TABLE kbsi_ligand ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_ligand ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE kbsi_construct_ligand ADD COLUMN IF NOT EXISTS source_db TEXT;
ALTER TABLE kbsi_construct_ligand ADD COLUMN IF NOT EXISTS source_id TEXT;

-- 인덱스: source_db 기준 필터링 빈번
CREATE INDEX IF NOT EXISTS idx_kbsi_crystallization_source_db ON kbsi_crystallization (source_db);
CREATE INDEX IF NOT EXISTS idx_kbsi_structure_source_db ON kbsi_structure (source_db);
CREATE INDEX IF NOT EXISTS idx_kbsi_ligand_source_db ON kbsi_ligand (source_db);

-- ============================================================================
-- 기존 데이터 소급 업데이트: notes 필드에서 출처 추출
-- ============================================================================

-- 결정화: notes에 "PDB XXXX" 패턴이 있는 것
UPDATE kbsi_crystallization
SET source_db = 'PDB', source_id = substring(notes from 'PDB ([A-Z0-9]{4})')
WHERE notes LIKE 'PDB %' AND source_db IS NULL;

-- 결정화: notes에 "TargetTrack" 패턴이 있는 것
UPDATE kbsi_crystallization
SET source_db = 'TargetTrack', source_id = substring(notes from 'TargetTrack (.+)')
WHERE notes LIKE 'TargetTrack%' AND source_db IS NULL;

-- 구조: pdb_id가 있는 것
UPDATE kbsi_structure
SET source_db = 'PDB', source_id = pdb_id
WHERE pdb_id IS NOT NULL AND source_db IS NULL;

-- 리간드: source에 "ChEMBL" 패턴이 있는 것
UPDATE kbsi_ligand
SET source_db = 'ChEMBL', source_id = substring(source from 'ChEMBL (CHEMBL[0-9]+)')
WHERE source LIKE 'ChEMBL%' AND source_db IS NULL;

-- KBSI 자체 실험 데이터 (source_type = 'experimental')
UPDATE kbsi_crystallization
SET source_db = 'KBSI'
WHERE source_type = 'experimental' AND source_db IS NULL;

UPDATE kbsi_expression
SET source_db = 'KBSI'
WHERE source_type = 'experimental' AND source_db IS NULL;

-- 합성 데이터
UPDATE kbsi_crystallization
SET source_db = 'synthetic'
WHERE source_type = 'synthetic' AND source_db IS NULL;

-- COMMENT
COMMENT ON COLUMN kbsi_crystallization.source_db IS '데이터 출처 DB: PDB, TargetTrack, ChEMBL, UniProt, KBSI, synthetic';
COMMENT ON COLUMN kbsi_crystallization.source_id IS '출처 DB 내 고유 ID (예: PDB ID, ChEMBL ID, TargetTrack protocol ID)';
