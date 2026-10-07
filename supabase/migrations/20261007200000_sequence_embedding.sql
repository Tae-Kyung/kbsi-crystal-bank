-- ESM-2 단백질 서열 임베딩 (pgvector)
-- 286K construct의 640차원 벡터 → 밀리초 KNN 검색

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kbsi_sequence_embedding (
  construct_id  BIGINT PRIMARY KEY REFERENCES kbsi_construct(id) ON DELETE CASCADE,
  embedding     vector(640),
  model_version TEXT DEFAULT 'esm2_t33_650M_UR50D',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- IVFFlat 인덱스 (cosine similarity)
-- lists = sqrt(N) ≈ sqrt(286000) ≈ 535, 100으로 시작
CREATE INDEX idx_embedding_ivfflat
  ON kbsi_sequence_embedding
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
