-- ============================================================
-- Lab PostgreSQL Features v2
-- Target: 203.255.78.89:15432/kbsi_crystal_bank
-- Date: 2026-10-24
-- ============================================================

-- ============================================================
-- 1. Custom Aggregate: MEDIAN function (type-specific)
-- NOTE: PostgreSQL does not support polymorphic array_append(anyarray, anyelement)
--       for custom aggregates, so we create per-type versions.
-- ============================================================

-- float4 (real)
CREATE OR REPLACE FUNCTION _final_median_float4(float4[])
RETURNS float8 AS $$
  WITH q AS (SELECT val FROM unnest($1) val WHERE val IS NOT NULL ORDER BY 1),
       cnt AS (SELECT COUNT(*) AS c FROM q)
  SELECT AVG(val::float8)
  FROM (SELECT val, ROW_NUMBER() OVER (ORDER BY val) AS rn FROM q) sub, cnt
  WHERE sub.rn IN (FLOOR((cnt.c+1)/2.0)::int, CEIL((cnt.c+1)/2.0)::int);
$$ LANGUAGE sql IMMUTABLE;
DROP AGGREGATE IF EXISTS median(float4);
CREATE AGGREGATE median(float4) (
  SFUNC = array_append, STYPE = float4[], FINALFUNC = _final_median_float4
);

-- float8 (double precision)
CREATE OR REPLACE FUNCTION _final_median_float8(float8[])
RETURNS float8 AS $$
  WITH q AS (SELECT val FROM unnest($1) val WHERE val IS NOT NULL ORDER BY 1),
       cnt AS (SELECT COUNT(*) AS c FROM q)
  SELECT AVG(val::float8)
  FROM (SELECT val, ROW_NUMBER() OVER (ORDER BY val) AS rn FROM q) sub, cnt
  WHERE sub.rn IN (FLOOR((cnt.c+1)/2.0)::int, CEIL((cnt.c+1)/2.0)::int);
$$ LANGUAGE sql IMMUTABLE;
DROP AGGREGATE IF EXISTS median(float8);
CREATE AGGREGATE median(float8) (
  SFUNC = array_append, STYPE = float8[], FINALFUNC = _final_median_float8
);

-- numeric
CREATE OR REPLACE FUNCTION _final_median_numeric(numeric[])
RETURNS float8 AS $$
  WITH q AS (SELECT val FROM unnest($1) val WHERE val IS NOT NULL ORDER BY 1),
       cnt AS (SELECT COUNT(*) AS c FROM q)
  SELECT AVG(val::float8)
  FROM (SELECT val, ROW_NUMBER() OVER (ORDER BY val) AS rn FROM q) sub, cnt
  WHERE sub.rn IN (FLOOR((cnt.c+1)/2.0)::int, CEIL((cnt.c+1)/2.0)::int);
$$ LANGUAGE sql IMMUTABLE;
DROP AGGREGATE IF EXISTS median(numeric);
CREATE AGGREGATE median(numeric) (
  SFUNC = array_append, STYPE = numeric[], FINALFUNC = _final_median_numeric
);

-- int4
CREATE OR REPLACE FUNCTION _final_median_int4(int4[])
RETURNS float8 AS $$
  WITH q AS (SELECT val FROM unnest($1) val WHERE val IS NOT NULL ORDER BY 1),
       cnt AS (SELECT COUNT(*) AS c FROM q)
  SELECT AVG(val::float8)
  FROM (SELECT val, ROW_NUMBER() OVER (ORDER BY val) AS rn FROM q) sub, cnt
  WHERE sub.rn IN (FLOOR((cnt.c+1)/2.0)::int, CEIL((cnt.c+1)/2.0)::int);
$$ LANGUAGE sql IMMUTABLE;
DROP AGGREGATE IF EXISTS median(int4);
CREATE AGGREGATE median(int4) (
  SFUNC = array_append, STYPE = int4[], FINALFUNC = _final_median_int4
);

-- int8
CREATE OR REPLACE FUNCTION _final_median_int8(int8[])
RETURNS float8 AS $$
  WITH q AS (SELECT val FROM unnest($1) val WHERE val IS NOT NULL ORDER BY 1),
       cnt AS (SELECT COUNT(*) AS c FROM q)
  SELECT AVG(val::float8)
  FROM (SELECT val, ROW_NUMBER() OVER (ORDER BY val) AS rn FROM q) sub, cnt
  WHERE sub.rn IN (FLOOR((cnt.c+1)/2.0)::int, CEIL((cnt.c+1)/2.0)::int);
$$ LANGUAGE sql IMMUTABLE;
DROP AGGREGATE IF EXISTS median(int8);
CREATE AGGREGATE median(int8) (
  SFUNC = array_append, STYPE = int8[], FINALFUNC = _final_median_int8
);

-- ============================================================
-- 2. IQR (Interquartile Range) function
-- ============================================================
CREATE OR REPLACE FUNCTION iqr_stats(vals float8[])
RETURNS TABLE (q1 float8, median float8, q3 float8, iqr float8)
LANGUAGE sql IMMUTABLE AS $$
  WITH sorted AS (
    SELECT val, ROW_NUMBER() OVER (ORDER BY val) AS rn, COUNT(*) OVER () AS n
    FROM unnest(vals) val WHERE val IS NOT NULL
  )
  SELECT
    (SELECT AVG(val) FROM sorted WHERE rn IN (FLOOR((n+1)*0.25)::int, CEIL((n+1)*0.25)::int))::float8 AS q1,
    (SELECT AVG(val) FROM sorted WHERE rn IN (FLOOR((n+1)*0.50)::int, CEIL((n+1)*0.50)::int))::float8 AS median,
    (SELECT AVG(val) FROM sorted WHERE rn IN (FLOOR((n+1)*0.75)::int, CEIL((n+1)*0.75)::int))::float8 AS q3,
    ((SELECT AVG(val) FROM sorted WHERE rn IN (FLOOR((n+1)*0.75)::int, CEIL((n+1)*0.75)::int)) -
     (SELECT AVG(val) FROM sorted WHERE rn IN (FLOOR((n+1)*0.25)::int, CEIL((n+1)*0.25)::int)))::float8 AS iqr;
$$;

-- ============================================================
-- 3. Full-text Search with tsvector
-- ============================================================

-- Add tsvector column to kbsi_protein
ALTER TABLE kbsi_protein ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate search_vector
UPDATE kbsi_protein SET search_vector =
  setweight(to_tsvector('english', COALESCE(full_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(abbreviation, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(gene_name, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(organism, '')), 'C');

-- GIN index
CREATE INDEX IF NOT EXISTS idx_protein_search_vector ON kbsi_protein USING gin(search_vector);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_protein_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.full_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.abbreviation, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.gene_name, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.organism, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protein_search_vector ON kbsi_protein;
CREATE TRIGGER trg_protein_search_vector
  BEFORE INSERT OR UPDATE ON kbsi_protein
  FOR EACH ROW EXECUTE FUNCTION update_protein_search_vector();

-- Search function
CREATE OR REPLACE FUNCTION search_proteins_fts(search_query TEXT, result_limit INT DEFAULT 20)
RETURNS TABLE (
  id BIGINT, full_name TEXT, abbreviation TEXT, gene_name TEXT, organism TEXT, rank REAL
)
LANGUAGE sql STABLE AS $$
  SELECT p.id, p.full_name, p.abbreviation, p.gene_name, p.organism,
    ts_rank(p.search_vector, websearch_to_tsquery('english', search_query)) AS rank
  FROM kbsi_protein p
  WHERE p.search_vector @@ websearch_to_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT result_limit;
$$;

-- ============================================================
-- 4. Recursive CTE: Construct hierarchy
-- ============================================================
CREATE OR REPLACE FUNCTION construct_hierarchy(root_construct_id BIGINT)
RETURNS TABLE (
  id BIGINT, name TEXT, parent_construct_id BIGINT, construct_type TEXT, depth INT
)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE hierarchy AS (
    SELECT c.id, c.name, c.parent_construct_id, c.construct_type::text, 0 AS depth
    FROM kbsi_construct c WHERE c.id = root_construct_id
    UNION ALL
    SELECT c.id, c.name, c.parent_construct_id, c.construct_type::text, h.depth + 1
    FROM kbsi_construct c
    JOIN hierarchy h ON c.parent_construct_id = h.id
  )
  SELECT * FROM hierarchy ORDER BY depth, id;
$$;

-- ============================================================
-- 5. Window Functions: Ranking views
-- ============================================================

-- Drop if exists to allow re-creation
DROP MATERIALIZED VIEW IF EXISTS mv_protein_success_ranking;
CREATE MATERIALIZED VIEW mv_protein_success_ranking AS
SELECT
  p.id AS protein_id,
  p.full_name,
  p.organism,
  COUNT(DISTINCT cr.id) AS total_trials,
  COUNT(DISTINCT cr.id) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality')) AS successes,
  ROUND(
    COUNT(DISTINCT cr.id) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality'))::numeric
    / NULLIF(COUNT(DISTINCT cr.id), 0) * 100, 1
  ) AS success_rate,
  RANK() OVER (ORDER BY
    COUNT(DISTINCT cr.id) FILTER (WHERE cr.outcome IN ('single_crystal','diffraction_quality'))::numeric
    / NULLIF(COUNT(DISTINCT cr.id), 0) DESC
  ) AS rank
FROM kbsi_protein p
JOIN kbsi_construct c ON c.protein_id = p.id
JOIN kbsi_crystallization cr ON cr.construct_id = c.id
WHERE cr.outcome IS NOT NULL
GROUP BY p.id, p.full_name, p.organism
HAVING COUNT(DISTINCT cr.id) >= 10
ORDER BY success_rate DESC;

-- pH trend analysis per precipitant
DROP MATERIALIZED VIEW IF EXISTS mv_precipitant_ph_profile;
CREATE MATERIALIZED VIEW mv_precipitant_ph_profile AS
SELECT
  precipitant_type,
  ROUND(ph::numeric, 0) AS ph_bucket,
  COUNT(*) AS trial_count,
  COUNT(*) FILTER (WHERE outcome IN ('single_crystal','diffraction_quality')) AS success_count,
  ROUND(
    COUNT(*) FILTER (WHERE outcome IN ('single_crystal','diffraction_quality'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS success_rate
FROM kbsi_crystallization
WHERE precipitant_type IS NOT NULL AND ph IS NOT NULL AND outcome IS NOT NULL
GROUP BY precipitant_type, ROUND(ph::numeric, 0)
HAVING COUNT(*) >= 10
ORDER BY precipitant_type, ph_bucket;

-- ============================================================
-- 6. COPY helper function (for bulk import)
-- ============================================================
CREATE OR REPLACE FUNCTION get_copy_columns(table_name TEXT)
RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'public' AND information_schema.columns.table_name = get_copy_columns.table_name
    AND column_name != 'id';
$$;

-- ============================================================
-- 7. Refresh materialized views (updated to include new MVs)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_dashboard_stats;
  REFRESH MATERIALIZED VIEW mv_organism_stats;
  REFRESH MATERIALIZED VIEW mv_precipitant_effectiveness;
  REFRESH MATERIALIZED VIEW mv_protein_family_stats;
  REFRESH MATERIALIZED VIEW mv_protein_success_ranking;
  REFRESH MATERIALIZED VIEW mv_precipitant_ph_profile;
  RAISE NOTICE 'All 6 materialized views refreshed at %', now();
END;
$$;

-- ============================================================
-- 8. Check pg_cron availability
-- ============================================================
SELECT name, default_version, installed_version, comment
FROM pg_available_extensions WHERE name = 'pg_cron';
