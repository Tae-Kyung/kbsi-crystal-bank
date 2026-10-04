-- ============================================================================
-- Audit Log 자동 기록 트리거
-- UPDATE/DELETE 시 kbsi_audit_log에 자동 기록
-- ============================================================================

CREATE OR REPLACE FUNCTION kbsi_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO kbsi_audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO kbsi_audit_log (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 주요 테이블에 트리거 적용
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification',
      'kbsi_crystallization', 'kbsi_structure', 'kbsi_ligand', 'kbsi_extraction_staging'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_audit AFTER UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION kbsi_audit_trigger()',
      tbl, tbl
    );
  END LOOP;
END;
$$;
