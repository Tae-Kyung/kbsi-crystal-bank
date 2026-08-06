-- ============================================================================
-- KBSI Protein Crystallization Bank - Initial Schema
-- 모든 테이블명은 kbsi_ 접두사를 사용
-- ============================================================================

-- --------------------------------------------------------
-- Custom ENUM types (ordered low -> high for ML)
-- --------------------------------------------------------
CREATE TYPE kbsi_construct_type AS ENUM (
  'full-length', 'domain', 'truncation', 'fusion', 'mutant'
);

CREATE TYPE kbsi_source_type AS ENUM (
  'experimental', 'literature', 'database'
);

CREATE TYPE kbsi_expression_result AS ENUM (
  'no_expression', 'insoluble', 'low', 'moderate', 'high'
);

CREATE TYPE kbsi_purification_result AS ENUM (
  'failed', 'low', 'acceptable', 'high'
);

CREATE TYPE kbsi_crystallization_outcome AS ENUM (
  'clear', 'precipitate', 'phase_separation', 'microcrystal',
  'single_crystal', 'diffraction_quality'
);

CREATE TYPE kbsi_structure_method AS ENUM (
  'X-ray', 'NMR', 'Cryo-EM'
);

CREATE TYPE kbsi_review_status AS ENUM (
  'pending', 'approved', 'rejected'
);

CREATE TYPE kbsi_tag_position AS ENUM (
  'N-terminal', 'C-terminal'
);

CREATE TYPE kbsi_crystallization_stage AS ENUM (
  'screening', 'optimization'
);

-- --------------------------------------------------------
-- 1. kbsi_protein (최상위 - 생물학적 정체성)
-- --------------------------------------------------------
CREATE TABLE kbsi_protein (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  custom_id     TEXT,
  full_name     TEXT NOT NULL,
  abbreviation  TEXT,
  gene_name     TEXT,
  organism      TEXT,
  owner         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_protein_name ON kbsi_protein (full_name);
CREATE INDEX idx_kbsi_protein_organism ON kbsi_protein (organism);

-- --------------------------------------------------------
-- 2. kbsi_database_id (외부 DB ID - 1:N)
-- --------------------------------------------------------
CREATE TABLE kbsi_database_id (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  protein_id  BIGINT NOT NULL REFERENCES kbsi_protein(id) ON DELETE CASCADE,
  db_name     TEXT NOT NULL,
  db_value    TEXT NOT NULL,
  UNIQUE (protein_id, db_name, db_value)
);

CREATE INDEX idx_kbsi_database_id_lookup ON kbsi_database_id (db_name, db_value);

-- --------------------------------------------------------
-- 3. kbsi_construct (실험의 중심 축)
-- --------------------------------------------------------
CREATE TABLE kbsi_construct (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  protein_id          BIGINT NOT NULL REFERENCES kbsi_protein(id) ON DELETE CASCADE,
  parent_construct_id BIGINT REFERENCES kbsi_construct(id) ON DELETE SET NULL,
  name                TEXT,
  residues            TEXT,
  construct_type      kbsi_construct_type,
  expression_system   TEXT,
  vector              TEXT,
  dna_sequence        TEXT,
  codon_optimized     BOOLEAN,
  seq_expression      TEXT,
  seq_final           TEXT,
  tag_name            TEXT,
  tag_position        kbsi_tag_position,
  cleavage_site       TEXT,
  theoretical_mw      REAL,
  theoretical_pi      REAL,
  status              TEXT,
  seq_hash            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_construct_protein ON kbsi_construct (protein_id);
CREATE INDEX idx_kbsi_construct_hash ON kbsi_construct (seq_hash);

-- --------------------------------------------------------
-- 4. kbsi_mutation (mutant construct의 변이 - 1:N)
-- --------------------------------------------------------
CREATE TABLE kbsi_mutation (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id  BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  mutation      TEXT NOT NULL
);

-- --------------------------------------------------------
-- 5. kbsi_reference (논문 메타)
-- --------------------------------------------------------
CREATE TABLE kbsi_reference (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title    TEXT,
  authors  TEXT,
  year     INTEGER,
  doi      TEXT UNIQUE,
  pmid     TEXT UNIQUE,
  journal  TEXT
);

CREATE INDEX idx_kbsi_reference_doi ON kbsi_reference (doi);

-- --------------------------------------------------------
-- 6. kbsi_expression (와이드 - 결과 지표 위주)
-- --------------------------------------------------------
CREATE TABLE kbsi_expression (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id    BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number  INTEGER,
  source_type     kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id    BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated    BOOLEAN NOT NULL DEFAULT false,
  performed_by    TEXT,
  performed_on    DATE,
  host            TEXT,
  strain          TEXT,
  induction_temp  REAL,
  yield_mg_l      REAL,
  solubility      TEXT,
  result_level    kbsi_expression_result,
  conditions      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_expression_construct ON kbsi_expression (construct_id);

-- --------------------------------------------------------
-- 7. kbsi_purification (와이드 - 정제 실행 한 건)
-- --------------------------------------------------------
CREATE TABLE kbsi_purification (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id    BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number  INTEGER,
  source_type     kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id    BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated    BOOLEAN NOT NULL DEFAULT false,
  performed_by    TEXT,
  performed_on    DATE,
  method_summary  TEXT,
  final_purity    REAL,
  final_yield     REAL,
  result_level    kbsi_purification_result,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_purification_construct ON kbsi_purification (construct_id);

-- --------------------------------------------------------
-- 8. kbsi_purification_step (정제 단계 - 1:N)
-- --------------------------------------------------------
CREATE TABLE kbsi_purification_step (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purification_id  BIGINT NOT NULL REFERENCES kbsi_purification(id) ON DELETE CASCADE,
  step_number      INTEGER NOT NULL,
  column_resin     TEXT,
  buffer           TEXT,
  result_yield     TEXT,
  treatment        TEXT
);

-- --------------------------------------------------------
-- 9. kbsi_characterization (롱포맷 - 측정 하나 = 행 하나)
-- --------------------------------------------------------
CREATE TABLE kbsi_characterization (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id    BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number  INTEGER,
  source_type     kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id    BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated    BOOLEAN NOT NULL DEFAULT false,
  performed_by    TEXT,
  performed_on    DATE,
  method          TEXT NOT NULL,
  value_num       REAL,
  value_text      TEXT,
  unit_normalized TEXT,
  unit_raw        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_characterization_construct ON kbsi_characterization (construct_id);
CREATE INDEX idx_kbsi_characterization_method ON kbsi_characterization (method);

-- --------------------------------------------------------
-- 10. kbsi_storage (보관 배치 - 1:N)
-- --------------------------------------------------------
CREATE TABLE kbsi_storage (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id    BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number  INTEGER,
  source_type     kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id    BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated    BOOLEAN NOT NULL DEFAULT false,
  performed_by    TEXT,
  performed_on    DATE,
  concentration   REAL,
  volume          REAL,
  storage_buffer  TEXT,
  location        TEXT,
  purified_on     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 11. kbsi_crystallization (핵심 변수 정량화)
-- --------------------------------------------------------
CREATE TABLE kbsi_crystallization (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id            BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number          INTEGER,
  source_type             kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id            BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated            BOOLEAN NOT NULL DEFAULT false,
  performed_by            TEXT,
  performed_on            DATE,
  stage                   kbsi_crystallization_stage,
  protein_concentration   REAL,
  precipitant_type        TEXT,
  precipitant_conc        REAL,
  precipitant_unit        TEXT,
  salt_type               TEXT,
  salt_conc               REAL,
  buffer_type             TEXT,
  ph                      REAL,
  temperature             REAL,
  additive                TEXT,
  drop_ratio              TEXT,
  days_to_crystal         INTEGER,
  outcome                 kbsi_crystallization_outcome,
  condition_detail        TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_crystallization_construct ON kbsi_crystallization (construct_id);
CREATE INDEX idx_kbsi_crystallization_outcome ON kbsi_crystallization (outcome);

-- --------------------------------------------------------
-- 12. kbsi_diffraction (수치 위주)
-- --------------------------------------------------------
CREATE TABLE kbsi_diffraction (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id    BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number  INTEGER,
  source_type     kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id    BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated    BOOLEAN NOT NULL DEFAULT false,
  performed_by    TEXT,
  performed_on    DATE,
  crystal_id      TEXT,
  beamline        TEXT,
  resolution      REAL,
  space_group     TEXT,
  unit_cell       TEXT,
  data_quality    TEXT,
  phasing         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 13. kbsi_nmr_experiment
-- --------------------------------------------------------
CREATE TABLE kbsi_nmr_experiment (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id    BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number  INTEGER,
  source_type     kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id    BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated    BOOLEAN NOT NULL DEFAULT false,
  performed_by    TEXT,
  performed_on    DATE,
  labelling       TEXT,
  spectrometer    TEXT,
  magnetic_field  REAL,
  temperature     REAL,
  bmrb_id         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 14. kbsi_nmr_spectrum (1:N)
-- --------------------------------------------------------
CREATE TABLE kbsi_nmr_spectrum (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nmr_experiment_id BIGINT NOT NULL REFERENCES kbsi_nmr_experiment(id) ON DELETE CASCADE,
  spectrum_type     TEXT NOT NULL
);

-- --------------------------------------------------------
-- 15. kbsi_cryoem_session
-- --------------------------------------------------------
CREATE TABLE kbsi_cryoem_session (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id         BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number       INTEGER,
  source_type          kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id         BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated         BOOLEAN NOT NULL DEFAULT false,
  performed_by         TEXT,
  performed_on         DATE,
  microscope           TEXT,
  detector             TEXT,
  voltage_kv           REAL,
  pixel_size           REAL,
  num_particles        INTEGER,
  resolution           REAL,
  refinement_software  TEXT,
  processing_detail    TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 16. kbsi_structure (최종 구조 통합)
-- --------------------------------------------------------
CREATE TABLE kbsi_structure (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id       BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  attempt_number     INTEGER,
  source_type        kbsi_source_type NOT NULL DEFAULT 'experimental',
  reference_id       BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  is_validated       BOOLEAN NOT NULL DEFAULT false,
  performed_by       TEXT,
  performed_on       DATE,
  method             kbsi_structure_method NOT NULL,
  resolution         REAL,
  pdb_id             TEXT,
  emdb_id            TEXT,
  bmrb_id            TEXT,
  publication_ref_id BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_structure_pdb ON kbsi_structure (pdb_id);

-- --------------------------------------------------------
-- 17. kbsi_ligand (SBDD 지원)
-- --------------------------------------------------------
CREATE TABLE kbsi_ligand (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  smiles      TEXT,
  inchi       TEXT,
  mw          REAL,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 18. kbsi_construct_ligand (construct-ligand 다대다)
-- --------------------------------------------------------
CREATE TABLE kbsi_construct_ligand (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id  BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  ligand_id     BIGINT NOT NULL REFERENCES kbsi_ligand(id) ON DELETE CASCADE,
  binding_kd    REAL,
  binding_ic50  REAL,
  notes         TEXT,
  UNIQUE (construct_id, ligand_id)
);

-- --------------------------------------------------------
-- 19. kbsi_extraction_staging (LLM 추출 대기)
-- --------------------------------------------------------
CREATE TABLE kbsi_extraction_staging (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference_id            BIGINT REFERENCES kbsi_reference(id) ON DELETE SET NULL,
  target_table            TEXT NOT NULL,
  extracted_payload       JSONB NOT NULL,
  source_location         TEXT,
  source_snippet          TEXT,
  extracted_by            TEXT,
  model_version           TEXT,
  extraction_confidence   REAL,
  extraction_date         TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_status           kbsi_review_status NOT NULL DEFAULT 'pending',
  reviewed_by             TEXT,
  reviewed_at             TIMESTAMPTZ,
  review_notes            TEXT
);

CREATE INDEX idx_kbsi_staging_status ON kbsi_extraction_staging (review_status);
CREATE INDEX idx_kbsi_staging_reference ON kbsi_extraction_staging (reference_id);

-- --------------------------------------------------------
-- 20. kbsi_attachment (파일 참조)
-- --------------------------------------------------------
CREATE TABLE kbsi_attachment (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_table  TEXT NOT NULL,
  entity_id     BIGINT NOT NULL,
  file_type     TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_attachment_entity ON kbsi_attachment (entity_table, entity_id);

-- --------------------------------------------------------
-- 21. kbsi_audit_log (변경 이력 추적)
-- --------------------------------------------------------
CREATE TABLE kbsi_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   BIGINT NOT NULL,
  action      TEXT NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_audit_table_record ON kbsi_audit_log (table_name, record_id);

-- --------------------------------------------------------
-- updated_at 자동 갱신 트리거
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION kbsi_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification',
      'kbsi_characterization', 'kbsi_storage', 'kbsi_crystallization',
      'kbsi_diffraction', 'kbsi_nmr_experiment', 'kbsi_cryoem_session', 'kbsi_structure'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION kbsi_update_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- --------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------
ALTER TABLE kbsi_protein ENABLE ROW LEVEL SECURITY;
ALTER TABLE kbsi_construct ENABLE ROW LEVEL SECURITY;
ALTER TABLE kbsi_expression ENABLE ROW LEVEL SECURITY;
ALTER TABLE kbsi_purification ENABLE ROW LEVEL SECURITY;
ALTER TABLE kbsi_characterization ENABLE ROW LEVEL SECURITY;
ALTER TABLE kbsi_crystallization ENABLE ROW LEVEL SECURITY;
ALTER TABLE kbsi_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE kbsi_extraction_staging ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 기본 정책
CREATE POLICY "Authenticated read all" ON kbsi_protein FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_protein FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON kbsi_protein FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated read all" ON kbsi_construct FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_construct FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON kbsi_construct FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated read all" ON kbsi_expression FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_expression FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read all" ON kbsi_purification FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_purification FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read all" ON kbsi_characterization FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_characterization FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read all" ON kbsi_crystallization FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_crystallization FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read all" ON kbsi_structure FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_structure FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read all" ON kbsi_extraction_staging FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_extraction_staging FOR INSERT TO authenticated WITH CHECK (true);
