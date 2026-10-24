-- ============================================================================
-- KBSI Protein Crystallization Bank - Schema Migration to Lab PostgreSQL
-- Supabase-specific items removed (RLS, auth.users, auth.uid())
-- Target: PostgreSQL 16.9 @ 203.255.78.89:15432/kbsi_crystal_bank
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --------------------------------------------------------
-- Custom ENUM types (ordered low -> high for ML)
-- --------------------------------------------------------
CREATE TYPE kbsi_construct_type AS ENUM (
  'full-length', 'domain', 'truncation', 'fusion', 'mutant'
);
CREATE TYPE kbsi_source_type AS ENUM (
  'experimental', 'literature', 'database', 'synthetic'
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
CREATE TYPE kbsi_crystal_morphology AS ENUM (
  'needle', 'plate', 'cube', 'rod', 'prismatic',
  'bipyramidal', 'hexagonal', 'cluster', 'microcrystal', 'amorphous', 'other'
);

-- --------------------------------------------------------
-- 1. kbsi_protein
-- --------------------------------------------------------
CREATE TABLE kbsi_protein (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  custom_id     TEXT,
  full_name     TEXT NOT NULL,
  abbreviation  TEXT,
  gene_name     TEXT,
  organism      TEXT,
  organism_normalized TEXT,
  full_name_normalized TEXT,
  owner         TEXT,
  project_id    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbsi_protein_name ON kbsi_protein (full_name);
CREATE INDEX idx_kbsi_protein_organism ON kbsi_protein (organism);
CREATE INDEX idx_protein_organism_normalized ON kbsi_protein (organism_normalized);

-- --------------------------------------------------------
-- 2. kbsi_database_id
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
-- 3. kbsi_construct
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
-- 4. kbsi_mutation
-- --------------------------------------------------------
CREATE TABLE kbsi_mutation (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id  BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  mutation      TEXT NOT NULL
);

-- --------------------------------------------------------
-- 5. kbsi_reference
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
-- 6. kbsi_expression
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
  source_db       TEXT,
  source_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbsi_expression_construct ON kbsi_expression (construct_id);

-- --------------------------------------------------------
-- 7. kbsi_purification
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
  source_db       TEXT,
  source_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbsi_purification_construct ON kbsi_purification (construct_id);

-- --------------------------------------------------------
-- 8. kbsi_purification_step
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
-- 9. kbsi_characterization
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
  source_db       TEXT,
  source_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbsi_characterization_construct ON kbsi_characterization (construct_id);
CREATE INDEX idx_kbsi_characterization_method ON kbsi_characterization (method);

-- --------------------------------------------------------
-- 10. kbsi_storage
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
  source_db       TEXT,
  source_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 11. kbsi_crystallization
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
  source_db               TEXT,
  source_id               TEXT,
  crystal_morphology      kbsi_crystal_morphology,
  crystal_size            TEXT,
  screening_kit_id        BIGINT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbsi_crystallization_construct ON kbsi_crystallization (construct_id);
CREATE INDEX idx_kbsi_crystallization_outcome ON kbsi_crystallization (outcome);
CREATE INDEX idx_kbsi_crystallization_source_db ON kbsi_crystallization (source_db);

-- --------------------------------------------------------
-- 12. kbsi_diffraction
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
  source_db       TEXT,
  source_id       TEXT,
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
  source_db       TEXT,
  source_id       TEXT,
  sample_ph       NUMERIC(4,2),
  ionic_strength  TEXT,
  pressure        TEXT,
  conformers_calculated INTEGER,
  conformers_submitted  INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 14. kbsi_nmr_spectrum
-- --------------------------------------------------------
CREATE TABLE kbsi_nmr_spectrum (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nmr_experiment_id BIGINT NOT NULL REFERENCES kbsi_nmr_experiment(id) ON DELETE CASCADE,
  spectrum_type     TEXT NOT NULL
);

-- --------------------------------------------------------
-- 15. kbsi_nmr_chemical_shift
-- --------------------------------------------------------
CREATE TABLE kbsi_nmr_chemical_shift (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nmr_experiment_id   BIGINT NOT NULL REFERENCES kbsi_nmr_experiment(id) ON DELETE CASCADE,
  bmrb_id             TEXT NOT NULL,
  seq_id              INTEGER NOT NULL,
  comp_id             TEXT NOT NULL,
  atom_id             TEXT NOT NULL,
  atom_type           TEXT NOT NULL,
  chemical_shift      REAL NOT NULL,
  chemical_shift_err  REAL,
  source_db           TEXT NOT NULL DEFAULT 'BMRB',
  source_id           TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_nmr_cs_experiment ON kbsi_nmr_chemical_shift(nmr_experiment_id);
CREATE INDEX idx_nmr_cs_bmrb ON kbsi_nmr_chemical_shift(bmrb_id);
CREATE INDEX idx_nmr_cs_atom ON kbsi_nmr_chemical_shift(atom_id);
CREATE UNIQUE INDEX idx_nmr_cs_unique ON kbsi_nmr_chemical_shift(bmrb_id, seq_id, atom_id);

-- --------------------------------------------------------
-- 16. kbsi_cryoem_session
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
  source_db            TEXT,
  source_id            TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 17. kbsi_structure
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
  source_db          TEXT,
  source_id          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbsi_structure_pdb ON kbsi_structure (pdb_id);
CREATE INDEX idx_kbsi_structure_source_db ON kbsi_structure (source_db);

-- --------------------------------------------------------
-- 18. kbsi_ligand
-- --------------------------------------------------------
CREATE TABLE kbsi_ligand (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  smiles      TEXT,
  inchi       TEXT,
  mw          REAL,
  source      TEXT,
  source_db   TEXT,
  source_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbsi_ligand_source_db ON kbsi_ligand (source_db);

-- --------------------------------------------------------
-- 19. kbsi_construct_ligand
-- --------------------------------------------------------
CREATE TABLE kbsi_construct_ligand (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  construct_id  BIGINT NOT NULL REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  ligand_id     BIGINT NOT NULL REFERENCES kbsi_ligand(id) ON DELETE CASCADE,
  binding_kd    REAL,
  binding_ic50  REAL,
  notes         TEXT,
  source_db     TEXT,
  source_id     TEXT,
  UNIQUE (construct_id, ligand_id)
);

-- --------------------------------------------------------
-- 20. kbsi_extraction_staging
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
-- 21. kbsi_attachment
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
-- 22. kbsi_audit_log
-- --------------------------------------------------------
CREATE TABLE kbsi_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   BIGINT NOT NULL,
  action      TEXT NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  changed_by  TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kbsi_audit_table_record ON kbsi_audit_log (table_name, record_id);

-- --------------------------------------------------------
-- 23. kbsi_precipitant_lookup
-- --------------------------------------------------------
CREATE TABLE kbsi_precipitant_lookup (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_name    TEXT NOT NULL UNIQUE,
  normalized  TEXT NOT NULL,
  category    TEXT
);

-- --------------------------------------------------------
-- 24. kbsi_screening_kit
-- --------------------------------------------------------
CREATE TABLE kbsi_screening_kit (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  manufacturer TEXT,
  conditions  INTEGER,
  description TEXT
);

-- --------------------------------------------------------
-- 25. kbsi_featured_protein
-- --------------------------------------------------------
CREATE TABLE kbsi_featured_protein (
  id          SERIAL PRIMARY KEY,
  pdb_id      TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  organism    TEXT,
  method      TEXT DEFAULT 'X-RAY',
  resolution  NUMERIC(4,2),
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------------------
-- 26. kbsi_kbds_mapping
-- --------------------------------------------------------
CREATE TABLE kbsi_kbds_mapping (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kbsi_table      TEXT NOT NULL,
  kbsi_column     TEXT NOT NULL,
  kbds_category   TEXT NOT NULL,
  kbds_field      TEXT NOT NULL,
  kbds_standard   TEXT,
  description     TEXT,
  UNIQUE (kbsi_table, kbsi_column)
);

-- --------------------------------------------------------
-- 27. kbsi_search_keywords + kbsi_search_log
-- --------------------------------------------------------
CREATE TABLE kbsi_search_keywords (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword    TEXT NOT NULL,
  type       TEXT NOT NULL,
  entity_id  BIGINT,
  frequency  INTEGER DEFAULT 0,
  UNIQUE (keyword, type)
);
CREATE INDEX idx_keywords_trgm ON kbsi_search_keywords USING gin(keyword gin_trgm_ops);
CREATE INDEX idx_keywords_type ON kbsi_search_keywords (type);

CREATE TABLE kbsi_search_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query        TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------------------
-- 28. kbsi_project (without auth.users FK)
-- --------------------------------------------------------
CREATE TABLE kbsi_project (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  owner_id    UUID,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kbsi_project_member (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES kbsi_project(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- --------------------------------------------------------
-- 29. kbsi_user_profile (without auth.users FK)
-- --------------------------------------------------------
CREATE TABLE kbsi_user_profile (
  id          UUID PRIMARY KEY,
  email       TEXT NOT NULL,
  display_name TEXT,
  role        TEXT NOT NULL DEFAULT 'researcher' CHECK (role IN ('admin', 'researcher', 'viewer')),
  institution TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- 30. kbsi_embedding (ESM-2, 1280-dim)
-- --------------------------------------------------------
CREATE TABLE kbsi_embedding (
  construct_id  BIGINT PRIMARY KEY REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  embedding     vector(1280),
  model         TEXT DEFAULT 'esm2_t33_650M',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- FK for crystallization.screening_kit_id (deferred due to table order)
ALTER TABLE kbsi_crystallization
  ADD CONSTRAINT fk_crystallization_screening_kit
  FOREIGN KEY (screening_kit_id) REFERENCES kbsi_screening_kit(id);

-- FK for protein.project_id
ALTER TABLE kbsi_protein
  ADD CONSTRAINT fk_protein_project
  FOREIGN KEY (project_id) REFERENCES kbsi_project(id);

-- --------------------------------------------------------
-- Triggers: updated_at auto-update
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
-- Triggers: search keywords sync
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_protein_keywords() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.gene_name IS NOT NULL THEN
    INSERT INTO kbsi_search_keywords (keyword, type, entity_id)
    VALUES (NEW.gene_name, 'gene_name', NEW.id)
    ON CONFLICT (keyword, type) DO NOTHING;
  END IF;
  IF NEW.abbreviation IS NOT NULL THEN
    INSERT INTO kbsi_search_keywords (keyword, type, entity_id)
    VALUES (NEW.abbreviation, 'abbreviation', NEW.id)
    ON CONFLICT (keyword, type) DO NOTHING;
  END IF;
  IF NEW.organism IS NOT NULL THEN
    INSERT INTO kbsi_search_keywords (keyword, type, entity_id)
    VALUES (NEW.organism, 'organism', NULL)
    ON CONFLICT (keyword, type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protein_keywords
  AFTER INSERT OR UPDATE ON kbsi_protein
  FOR EACH ROW EXECUTE FUNCTION sync_protein_keywords();

-- --------------------------------------------------------
-- Functions: dashboard_stats
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION dashboard_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SET statement_timeout = '60s'
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'proteins', (SELECT count(*) FROM kbsi_protein),
    'constructs', (SELECT count(*) FROM kbsi_construct),
    'expressions', (SELECT count(*) FROM kbsi_expression),
    'purifications', (SELECT count(*) FROM kbsi_purification),
    'characterizations', (SELECT count(*) FROM kbsi_characterization),
    'crystallizations', (SELECT count(*) FROM kbsi_crystallization),
    'diffractions', (SELECT count(*) FROM kbsi_diffraction),
    'structures', (SELECT count(*) FROM kbsi_structure),
    'ligands', (SELECT count(*) FROM kbsi_ligand),
    'bindings', (SELECT count(*) FROM kbsi_construct_ligand),
    'staging_pending', (SELECT count(*) FROM kbsi_extraction_staging WHERE review_status = 'pending')
  ) INTO result;
  RETURN result;
END;
$$;

-- --------------------------------------------------------
-- Functions: dedup_constructs
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION dedup_constructs(batch_limit INT DEFAULT 1000)
RETURNS TABLE(
  deleted_constructs BIGINT,
  deleted_crystallization BIGINT,
  deleted_diffraction BIGINT,
  deleted_expression BIGINT,
  deleted_structure BIGINT,
  deleted_purification BIGINT,
  deleted_characterization BIGINT,
  deleted_mutation BIGINT,
  deleted_embedding BIGINT
) LANGUAGE plpgsql AS $$
DECLARE
  dup_ids INT[];
  cnt_construct BIGINT := 0;
  cnt_cryst BIGINT := 0;
  cnt_diff BIGINT := 0;
  cnt_expr BIGINT := 0;
  cnt_struct BIGINT := 0;
  cnt_puri BIGINT := 0;
  cnt_char BIGINT := 0;
  cnt_mut BIGINT := 0;
  cnt_emb BIGINT := 0;
BEGIN
  SELECT ARRAY_AGG(id) INTO dup_ids
  FROM (
    SELECT id FROM kbsi_construct c
    WHERE EXISTS (
      SELECT 1 FROM kbsi_construct c2
      WHERE c2.name = c.name AND c2.protein_id = c.protein_id AND c2.id < c.id
    )
    LIMIT batch_limit
  ) sub;

  IF dup_ids IS NULL OR array_length(dup_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  DELETE FROM kbsi_crystallization WHERE construct_id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_cryst = ROW_COUNT;
  DELETE FROM kbsi_diffraction WHERE construct_id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_diff = ROW_COUNT;
  DELETE FROM kbsi_expression WHERE construct_id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_expr = ROW_COUNT;
  DELETE FROM kbsi_structure WHERE construct_id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_struct = ROW_COUNT;
  DELETE FROM kbsi_purification WHERE construct_id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_puri = ROW_COUNT;
  DELETE FROM kbsi_characterization WHERE construct_id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_char = ROW_COUNT;
  DELETE FROM kbsi_mutation WHERE construct_id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_mut = ROW_COUNT;
  DELETE FROM kbsi_embedding WHERE construct_id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_emb = ROW_COUNT;
  DELETE FROM kbsi_construct WHERE id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_construct = ROW_COUNT;

  RETURN QUERY SELECT cnt_construct, cnt_cryst, cnt_diff, cnt_expr, cnt_struct, cnt_puri, cnt_char, cnt_mut, cnt_emb;
END;
$$;

-- Functions: match_embeddings
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1280),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  construct_id bigint,
  construct_name text,
  protein_name text,
  organism text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.construct_id,
    c.name AS construct_name,
    p.full_name AS protein_name,
    p.organism,
    (1 - (e.embedding <=> query_embedding))::float AS similarity
  FROM kbsi_embedding e
  JOIN kbsi_construct c ON c.id = e.construct_id
  JOIN kbsi_protein p ON p.id = c.protein_id
  WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- NMR chemical shift summary view
CREATE OR REPLACE VIEW kbsi_nmr_cs_summary AS
SELECT
  nmr_experiment_id,
  bmrb_id,
  COUNT(*) AS total_shifts,
  COUNT(DISTINCT seq_id) AS assigned_residues,
  COUNT(*) FILTER (WHERE atom_id = 'H') AS h_count,
  COUNT(*) FILTER (WHERE atom_id = 'N') AS n_count,
  COUNT(*) FILTER (WHERE atom_id = 'CA') AS ca_count,
  COUNT(*) FILTER (WHERE atom_id = 'CB') AS cb_count,
  COUNT(*) FILTER (WHERE atom_id = 'HA') AS ha_count,
  ROUND(AVG(chemical_shift) FILTER (WHERE atom_id = 'H')::numeric, 3) AS avg_h_shift,
  ROUND(AVG(chemical_shift) FILTER (WHERE atom_id = 'N')::numeric, 2) AS avg_n_shift,
  ROUND(AVG(chemical_shift) FILTER (WHERE atom_id = 'CA')::numeric, 2) AS avg_ca_shift
FROM kbsi_nmr_chemical_shift
GROUP BY nmr_experiment_id, bmrb_id;

-- count_duplicate_constructs
CREATE OR REPLACE FUNCTION count_duplicate_constructs()
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)
  FROM kbsi_construct c
  WHERE EXISTS (
    SELECT 1 FROM kbsi_construct c2
    WHERE c2.name = c.name AND c2.protein_id = c.protein_id AND c2.id < c.id
  );
$$;
