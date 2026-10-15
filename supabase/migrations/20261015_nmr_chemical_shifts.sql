-- NMR Chemical Shift 데이터 (BMRB backbone assignments)
-- Backbone atoms only: H, N, CA, CB, HA (잔기당 최대 5개)
-- Source: BMRB API

CREATE TABLE IF NOT EXISTS kbsi_nmr_chemical_shift (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nmr_experiment_id   BIGINT NOT NULL REFERENCES kbsi_nmr_experiment(id) ON DELETE CASCADE,
  bmrb_id             TEXT NOT NULL,
  seq_id              INTEGER NOT NULL,          -- 잔기 번호
  comp_id             TEXT NOT NULL,             -- 아미노산 3-letter (GLY, ALA, ...)
  atom_id             TEXT NOT NULL,             -- 원자 이름 (H, N, CA, CB, HA)
  atom_type           TEXT NOT NULL,             -- 원소 (H, N, C)
  chemical_shift      REAL NOT NULL,             -- chemical shift value (ppm)
  chemical_shift_err  REAL,                      -- error
  source_db           TEXT NOT NULL DEFAULT 'BMRB',
  source_id           TEXT NOT NULL,             -- BMRB entry ID
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_nmr_cs_experiment ON kbsi_nmr_chemical_shift(nmr_experiment_id);
CREATE INDEX IF NOT EXISTS idx_nmr_cs_bmrb ON kbsi_nmr_chemical_shift(bmrb_id);
CREATE INDEX IF NOT EXISTS idx_nmr_cs_atom ON kbsi_nmr_chemical_shift(atom_id);

-- 중복 방지 (같은 BMRB entry + 같은 잔기 + 같은 원자)
CREATE UNIQUE INDEX IF NOT EXISTS idx_nmr_cs_unique
  ON kbsi_nmr_chemical_shift(bmrb_id, seq_id, atom_id);

-- RLS
ALTER TABLE kbsi_nmr_chemical_shift ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read all" ON kbsi_nmr_chemical_shift FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON kbsi_nmr_chemical_shift FOR INSERT TO authenticated WITH CHECK (true);

-- NMR experiment별 chemical shift 요약 뷰 (assignment 완성도)
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
