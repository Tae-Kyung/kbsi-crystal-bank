-- NMR 샘플 조건 + 앙상블 정보 추가
-- pH, ionic_strength: NMR 실험 버퍼 조건 (결정화 pH 비교용)
-- conformers_*: 앙상블 구조 수 (유연성 지표)

ALTER TABLE kbsi_nmr_experiment ADD COLUMN IF NOT EXISTS sample_ph NUMERIC(4,2);
ALTER TABLE kbsi_nmr_experiment ADD COLUMN IF NOT EXISTS ionic_strength TEXT;
ALTER TABLE kbsi_nmr_experiment ADD COLUMN IF NOT EXISTS pressure TEXT;
ALTER TABLE kbsi_nmr_experiment ADD COLUMN IF NOT EXISTS conformers_calculated INTEGER;
ALTER TABLE kbsi_nmr_experiment ADD COLUMN IF NOT EXISTS conformers_submitted INTEGER;
