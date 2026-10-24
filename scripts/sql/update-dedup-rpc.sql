CREATE OR REPLACE FUNCTION dedup_constructs(batch_limit INT DEFAULT 100)
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
) LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300s'
AS $$
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
    RETURN QUERY SELECT 0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT,0::BIGINT;
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
