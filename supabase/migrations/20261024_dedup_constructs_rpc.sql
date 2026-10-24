-- RPC function: 중복 construct 제거
-- 같은 name + protein_id를 가진 construct 그룹에서 가장 작은 id만 유지
-- DB 내부에서 실행되므로 statement timeout 회피

-- 1) 중복 construct id 수집 + 자식 테이블 삭제 + construct 삭제를 한 번에 처리
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
  -- 중복 construct id 수집 (각 그룹에서 min(id)를 제외한 나머지)
  SELECT ARRAY_AGG(id) INTO dup_ids
  FROM (
    SELECT id
    FROM kbsi_construct c
    WHERE EXISTS (
      SELECT 1 FROM kbsi_construct c2
      WHERE c2.name = c.name
        AND c2.protein_id = c.protein_id
        AND c2.id < c.id
    )
    LIMIT batch_limit
  ) sub;

  IF dup_ids IS NULL OR array_length(dup_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  -- 자식 테이블 삭제 (큰 순서대로)
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

  -- construct 삭제
  DELETE FROM kbsi_construct WHERE id = ANY(dup_ids);
  GET DIAGNOSTICS cnt_construct = ROW_COUNT;

  RETURN QUERY SELECT cnt_construct, cnt_cryst, cnt_diff, cnt_expr, cnt_struct, cnt_puri, cnt_char, cnt_mut, cnt_emb;
END;
$$;

-- 전체 중복 수 확인용 함수
CREATE OR REPLACE FUNCTION count_duplicate_constructs()
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)
  FROM kbsi_construct c
  WHERE EXISTS (
    SELECT 1 FROM kbsi_construct c2
    WHERE c2.name = c.name
      AND c2.protein_id = c.protein_id
      AND c2.id < c.id
  );
$$;
