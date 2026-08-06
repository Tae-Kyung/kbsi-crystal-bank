-- ============================================================================
-- RBAC: Role-Based Access Control
-- admin: 모든 권한 (데이터 삭제, 사용자 관리)
-- researcher: 데이터 CRUD (자신의 데이터)
-- viewer: 읽기 전용
-- ============================================================================

-- 사용자 프로필 + 역할 테이블
CREATE TABLE kbsi_user_profile (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  display_name TEXT,
  role        TEXT NOT NULL DEFAULT 'researcher'
              CHECK (role IN ('admin', 'researcher', 'viewer')),
  institution TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_user_profile_role ON kbsi_user_profile (role);

ALTER TABLE kbsi_user_profile ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 프로필 조회 가능
CREATE POLICY "Users can read all profiles"
  ON kbsi_user_profile FOR SELECT TO authenticated USING (true);

-- 자기 자신의 프로필만 수정 가능
CREATE POLICY "Users can update own profile"
  ON kbsi_user_profile FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- admin만 프로필 생성 가능 (역할 부여)
CREATE POLICY "Admins can insert profiles"
  ON kbsi_user_profile FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM kbsi_user_profile WHERE id = auth.uid() AND role = 'admin'
    )
    OR NOT EXISTS (SELECT 1 FROM kbsi_user_profile) -- 첫 번째 사용자는 자동 허용
  );

-- ============================================================================
-- viewer는 실험 데이터 INSERT/UPDATE/DELETE 불가
-- (기존 RLS 정책에 role 체크 추가)
-- ============================================================================

-- Helper function: 현재 사용자 역할 조회
CREATE OR REPLACE FUNCTION kbsi_get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT role FROM kbsi_user_profile WHERE id = auth.uid()),
    'researcher'  -- 프로필 없으면 researcher로 기본 처리
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- kbsi_protein에 viewer 쓰기 제한 추가
CREATE POLICY "Viewers cannot modify proteins"
  ON kbsi_protein FOR DELETE TO authenticated
  USING (kbsi_get_user_role() IN ('admin', 'researcher'));
