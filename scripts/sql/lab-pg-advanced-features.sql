-- ============================================================================
-- Lab PostgreSQL Advanced Features
-- Supabase에서 불가능했던 기능들 구현
-- ============================================================================

-- 1. HNSW Index (pgvector 0.8.0) — IVFFlat보다 빠른 ANN 검색
DROP INDEX IF EXISTS idx_kbsi_embedding_ivfflat;
CREATE INDEX IF NOT EXISTS idx_kbsi_embedding_hnsw
  ON kbsi_embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 2. Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cryst_construct_outcome ON kbsi_crystallization(construct_id, outcome);
CREATE INDEX IF NOT EXISTS idx_cryst_source_outcome ON kbsi_crystallization(source_type, outcome);
CREATE INDEX IF NOT EXISTS idx_cryst_ph_temp ON kbsi_crystallization(ph, temperature);
CREATE INDEX IF NOT EXISTS idx_struct_method_resolution ON kbsi_structure(method, resolution);

-- 3. recommend_conditions: 최적 결정화 조건 추천
CREATE OR REPLACE FUNCTION recommend_conditions(
  p_protein_id BIGINT,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  precipitant_type TEXT,
  avg_ph NUMERIC,
  avg_temp NUMERIC,
  avg_conc NUMERIC,
  success_count BIGINT,
  total_trials BIGINT,
  success_rate NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH target_protein AS (
    SELECT organism FROM kbsi_protein WHERE id = p_protein_id
  ),
  similar_constructs AS (
    SELECT c.id
    FROM kbsi_construct c
    JOIN kbsi_protein p ON p.id = c.protein_id
    WHERE p.organism = (SELECT organism FROM target_protein)
  )
  SELECT
    cr.precipitant_type,
    ROUND(AVG(cr.ph)::numeric, 2) AS avg_ph,
    ROUND(AVG(cr.temperature)::numeric, 1) AS avg_temp,
    ROUND(AVG(cr.precipitant_conc)::numeric, 2) AS avg_conc,
    COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success_count,
    COUNT(*) AS total_trials,
    ROUND(
      COUNT(*) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality'))::numeric
      / NULLIF(COUNT(*), 0) * 100, 1
    ) AS success_rate
  FROM kbsi_crystallization cr
  WHERE cr.construct_id IN (SELECT id FROM similar_constructs)
    AND cr.precipitant_type IS NOT NULL
    AND cr.outcome IS NOT NULL
  GROUP BY cr.precipitant_type
  HAVING COUNT(*) >= 5
  ORDER BY success_rate DESC, success_count DESC
  LIMIT p_limit;
$$;

-- 4. find_similar_with_conditions: 유사 서열 + 결정화 조건 비교
CREATE OR REPLACE FUNCTION find_similar_with_conditions(
  p_construct_id BIGINT,
  p_threshold FLOAT DEFAULT 0.8,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  similar_construct_id BIGINT,
  construct_name TEXT,
  protein_name TEXT,
  organism TEXT,
  similarity FLOAT,
  best_outcome TEXT,
  best_ph REAL,
  best_precipitant TEXT,
  crystal_count BIGINT
)
LANGUAGE sql STABLE AS $$
  WITH query_emb AS (
    SELECT embedding FROM kbsi_embedding WHERE construct_id = p_construct_id
  ),
  sim_matches AS (
    SELECT
      e.construct_id,
      (1 - (e.embedding <=> (SELECT embedding FROM query_emb)))::float AS sim
    FROM kbsi_embedding e
    WHERE e.construct_id != p_construct_id
      AND 1 - (e.embedding <=> (SELECT embedding FROM query_emb)) > p_threshold
    ORDER BY e.embedding <=> (SELECT embedding FROM query_emb)
    LIMIT p_limit
  )
  SELECT
    s.construct_id AS similar_construct_id,
    c.name AS construct_name,
    p.full_name AS protein_name,
    p.organism,
    s.sim AS similarity,
    (SELECT outcome FROM kbsi_crystallization
     WHERE construct_id = s.construct_id
     ORDER BY CASE outcome
       WHEN 'diffraction_quality' THEN 1
       WHEN 'single_crystal' THEN 2
       WHEN 'microcrystal' THEN 3
       ELSE 4 END
     LIMIT 1) AS best_outcome,
    (SELECT ph FROM kbsi_crystallization
     WHERE construct_id = s.construct_id
       AND outcome IN ('single_crystal','diffraction_quality')
     LIMIT 1) AS best_ph,
    (SELECT precipitant_type FROM kbsi_crystallization
     WHERE construct_id = s.construct_id
       AND outcome IN ('single_crystal','diffraction_quality')
     LIMIT 1) AS best_precipitant,
    (SELECT COUNT(*) FROM kbsi_crystallization WHERE construct_id = s.construct_id) AS crystal_count
  FROM sim_matches s
  JOIN kbsi_construct c ON c.id = s.construct_id
  JOIN kbsi_protein p ON p.id = c.protein_id
  ORDER BY s.sim DESC;
$$;

-- 5. data_quality_report: 전체 DB 무결성 검사
CREATE OR REPLACE FUNCTION data_quality_report()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  count BIGINT,
  detail TEXT
)
LANGUAGE sql STABLE SET statement_timeout = '60s' AS $$
  SELECT 'orphan_constructs'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARN' END,
    COUNT(*),
    'Constructs without matching protein'::text
  FROM kbsi_construct c
  WHERE NOT EXISTS (SELECT 1 FROM kbsi_protein p WHERE p.id = c.protein_id)

  UNION ALL
  SELECT 'duplicate_constructs',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARN' END,
    COUNT(*),
    'Constructs with same name+protein_id'
  FROM kbsi_construct c
  WHERE EXISTS (SELECT 1 FROM kbsi_construct c2 WHERE c2.name = c.name AND c2.protein_id = c.protein_id AND c2.id < c.id)

  UNION ALL
  SELECT 'null_outcome',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'INFO' END,
    COUNT(*),
    'Crystallization records without outcome'
  FROM kbsi_crystallization WHERE outcome IS NULL

  UNION ALL
  SELECT 'ph_out_of_range',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARN' END,
    COUNT(*),
    'Crystallization with pH < 1 or > 14'
  FROM kbsi_crystallization WHERE ph IS NOT NULL AND (ph < 1 OR ph > 14)

  UNION ALL
  SELECT 'temp_out_of_range',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARN' END,
    COUNT(*),
    'Crystallization with temp < -20 or > 60'
  FROM kbsi_crystallization WHERE temperature IS NOT NULL AND (temperature < -20 OR temperature > 60)

  UNION ALL
  SELECT 'embedding_coverage',
    CASE WHEN (SELECT COUNT(*)::float FROM kbsi_embedding) / NULLIF((SELECT COUNT(*) FROM kbsi_construct), 0) > 0.95 THEN 'OK' ELSE 'INFO' END,
    (SELECT COUNT(*) FROM kbsi_embedding),
    'ESM-2 embeddings (' || ROUND((SELECT COUNT(*)::numeric FROM kbsi_embedding) / NULLIF((SELECT COUNT(*) FROM kbsi_construct), 0) * 100, 1) || '% of constructs)'

  UNION ALL
  SELECT 'structure_no_pdb',
    'INFO',
    COUNT(*),
    'Structures without PDB ID'
  FROM kbsi_structure WHERE pdb_id IS NULL;
$$;

-- 6. mv_protein_family_stats: 단백질 패밀리별 결정화 성공률
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_protein_family_stats AS
SELECT
  p.organism,
  p.gene_name,
  COUNT(DISTINCT p.id) AS protein_variants,
  COUNT(DISTINCT c.id) AS total_constructs,
  COUNT(DISTINCT cr.id) AS total_crystals,
  COUNT(DISTINCT cr.id) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS success_crystals,
  ROUND(
    COUNT(DISTINCT cr.id) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality'))::numeric
    / NULLIF(COUNT(DISTINCT cr.id), 0) * 100, 1
  ) AS success_rate,
  COUNT(DISTINCT s.pdb_id) AS unique_pdb_structures
FROM kbsi_protein p
JOIN kbsi_construct c ON c.protein_id = p.id
LEFT JOIN kbsi_crystallization cr ON cr.construct_id = c.id
LEFT JOIN kbsi_structure s ON s.construct_id = c.id
WHERE p.gene_name IS NOT NULL
GROUP BY p.organism, p.gene_name
HAVING COUNT(DISTINCT c.id) >= 3
ORDER BY total_crystals DESC;

-- 7. batch_normalize_precipitant: 대량 정규화 (Supabase RPC 불필요)
CREATE OR REPLACE FUNCTION batch_normalize_precipitant()
RETURNS TABLE (updated_count BIGINT)
LANGUAGE plpgsql AS $$
DECLARE
  cnt BIGINT;
BEGIN
  UPDATE kbsi_crystallization c
  SET precipitant_type = l.normalized
  FROM kbsi_precipitant_lookup l
  WHERE c.precipitant_type = l.raw_name
    AND c.precipitant_type != l.normalized;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;

-- 8. refresh_materialized_views: 모든 MV 리프레시
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_dashboard_stats;
  REFRESH MATERIALIZED VIEW mv_organism_stats;
  REFRESH MATERIALIZED VIEW mv_precipitant_effectiveness;
  REFRESH MATERIALIZED VIEW mv_protein_family_stats;
  RAISE NOTICE 'All materialized views refreshed at %', now();
END;
$$;
