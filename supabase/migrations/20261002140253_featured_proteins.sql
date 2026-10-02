-- ============================================================================
-- source_type에 synthetic 추가 (Negative Control 합성 데이터)
-- ============================================================================
ALTER TYPE kbsi_source_type ADD VALUE IF NOT EXISTS 'synthetic';

-- ============================================================================
-- kbsi_crystallization UPDATE 정책 추가
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "Authenticated update" ON kbsi_crystallization FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 잘 알려진 단백질 추천 목록 (동적 관리)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kbsi_featured_protein (
  id          SERIAL PRIMARY KEY,
  pdb_id      TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  organism    TEXT,
  method      TEXT DEFAULT 'X-RAY',
  resolution  NUMERIC(4,2),
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: 모든 인증 사용자 읽기 가능
ALTER TABLE kbsi_featured_protein ENABLE ROW LEVEL SECURITY;
CREATE POLICY "featured_read" ON kbsi_featured_protein FOR SELECT TO authenticated USING (true);
CREATE POLICY "featured_insert" ON kbsi_featured_protein FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "featured_delete" ON kbsi_featured_protein FOR DELETE TO authenticated USING (true);

-- 초기 시드 데이터
INSERT INTO kbsi_featured_protein (pdb_id, name, organism, method, resolution, description) VALUES
  ('1LYZ', 'Lysozyme', 'Gallus gallus (Chicken)', 'X-RAY', 1.50, '항균 효소, 결정화 연구의 대표 모델'),
  ('4HHB', 'Hemoglobin', 'Homo sapiens', 'X-RAY', 1.74, '산소 운반 단백질, 4차 구조 연구'),
  ('1IGT', 'Immunoglobulin G (IgG1)', 'Mus musculus', 'X-RAY', 2.80, '항체 전체 구조, 면역학 핵심 분자'),
  ('1BNA', 'B-DNA Dodecamer', 'Synthetic', 'X-RAY', 1.90, 'DNA 이중나선 구조의 고전적 모델'),
  ('1GFL', 'Green Fluorescent Protein (GFP)', 'Aequorea victoria', 'X-RAY', 1.90, '형광 리포터, 바이오이미징 핵심 도구'),
  ('1HHO', 'Deoxyhemoglobin', 'Homo sapiens', 'X-RAY', 1.74, '탈산소 헤모글로빈, 알로스테릭 조절 연구'),
  ('3CLN', 'Calmodulin', 'Rattus norvegicus', 'X-RAY', 2.20, '칼슘 신호전달 핵심 단백질'),
  ('1TIM', 'Triosephosphate Isomerase (TIM)', 'Gallus gallus', 'X-RAY', 2.50, 'TIM barrel 구조의 원형, 해당과정 효소'),
  ('6LU7', 'SARS-CoV-2 Main Protease (Mpro)', 'SARS-CoV-2', 'X-RAY', 2.16, 'COVID-19 치료제 표적 단백질'),
  ('1UBQ', 'Ubiquitin', 'Homo sapiens', 'X-RAY', 1.80, '단백질 분해 신호, 76개 아미노산 소단백질'),
  ('1CRN', 'Crambin', 'Crambe hispanica', 'X-RAY', 1.50, '초고해상도 구조의 대표적 소단백질'),
  ('2PTC', 'Trypsin (with BPTI)', 'Bos taurus', 'X-RAY', 1.90, '세린 프로테아제, 효소-억제제 복합체'),
  ('1MBO', 'Myoglobin', 'Physeter catodon (Sperm whale)', 'X-RAY', 2.00, '최초로 구조가 규명된 단백질, 산소 저장'),
  ('3PQR', 'Insulin', 'Homo sapiens', 'X-RAY', 1.60, '혈당 조절 호르몬, 최초 서열 분석 단백질'),
  ('1AKE', 'Adenylate Kinase', 'Escherichia coli', 'X-RAY', 2.00, '에너지 대사 효소, 구조적 유연성 연구 모델'),
  ('1HEL', 'Hen Egg-White Lysozyme (HEWL)', 'Gallus gallus', 'X-RAY', 1.70, '효소 반응 메커니즘 연구의 고전적 모델'),
  ('1RCX', 'RuBisCO', 'Nicotiana tabacum (Tobacco)', 'X-RAY', 2.00, '탄소 고정 효소, 지구상 가장 풍부한 단백질'),
  ('1HZH', 'Fab Fragment (Herceptin)', 'Homo sapiens', 'X-RAY', 2.50, '항체 Fab 단편, 항원-항체 결합 연구'),
  ('1GZX', 'p53 DNA-Binding Domain', 'Homo sapiens', 'X-RAY', 2.05, '종양 억제 단백질, 암 연구 핵심 타깃'),
  ('2HHB', 'Oxyhemoglobin', 'Homo sapiens', 'X-RAY', 1.74, '산소 결합 상태 헤모글로빈'),
  ('1HSG', 'HIV-1 Protease', 'HIV-1', 'X-RAY', 2.00, 'AIDS 치료제(프로테아제 억제제) 표적'),
  ('1EMA', 'Enhanced GFP (EGFP)', 'Aequorea victoria', 'X-RAY', 1.90, '향상된 형광 단백질, 세포 추적 도구'),
  ('1A3N', 'Hemoglobin S (Sickle cell)', 'Homo sapiens', 'X-RAY', 2.00, '겸상적혈구 돌연변이 헤모글로빈'),
  ('4V5D', '70S Ribosome', 'Thermus thermophilus', 'X-RAY', 2.90, '리보솜 전체 구조, 번역 메커니즘 연구')
ON CONFLICT (pdb_id) DO NOTHING;
