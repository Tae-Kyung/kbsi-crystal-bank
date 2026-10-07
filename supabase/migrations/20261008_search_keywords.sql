-- 통합 키워드 테이블 + 검색 로그
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS kbsi_search_keywords (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword    TEXT NOT NULL,
  type       TEXT NOT NULL,
  entity_id  BIGINT,
  frequency  INTEGER DEFAULT 0,
  UNIQUE (keyword, type)
);

CREATE INDEX idx_keywords_trgm ON kbsi_search_keywords USING gin(keyword gin_trgm_ops);
CREATE INDEX idx_keywords_type ON kbsi_search_keywords (type);

CREATE TABLE IF NOT EXISTS kbsi_search_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query        TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Trigger: kbsi_protein INSERT/UPDATE → 키워드 자동 동기화
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
