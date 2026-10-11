-- ESM-2 임베딩 v2: 차원 수정 (640 → 1280) + 유사도 검색 RPC 함수
-- ESM-2 650M 실제 출력: 1280차원

-- 기존 테이블 삭제 (데이터 없음)
DROP INDEX IF EXISTS idx_embedding_ivfflat;
DROP TABLE IF EXISTS kbsi_sequence_embedding;

-- 새 테이블
CREATE TABLE kbsi_embedding (
  construct_id  BIGINT PRIMARY KEY REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  embedding     vector(1280),
  model         TEXT DEFAULT 'esm2_t33_650M',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 유사도 검색 인덱스 (코사인 유사도)
CREATE INDEX idx_kbsi_embedding_ivfflat
  ON kbsi_embedding
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 유사 서열 검색 RPC 함수
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
LANGUAGE plpgsql
AS $$
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
