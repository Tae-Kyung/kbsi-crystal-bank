-- ============================================================================
-- 프로젝트별 데이터 격리 (P3.3.2)
-- kbsi_project 테이블 + 단백질-프로젝트 연결 + RLS 정책
-- ============================================================================

-- 프로젝트 테이블
CREATE TABLE kbsi_project (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  owner_id    UUID REFERENCES auth.users(id),
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kbsi_project_owner ON kbsi_project (owner_id);

ALTER TABLE kbsi_project ENABLE ROW LEVEL SECURITY;

-- 프로젝트 멤버 테이블
CREATE TABLE kbsi_project_member (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES kbsi_project(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('owner', 'member', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_kbsi_project_member_user ON kbsi_project_member (user_id);

ALTER TABLE kbsi_project_member ENABLE ROW LEVEL SECURITY;

-- 단백질-프로젝트 연결 (N:M)
ALTER TABLE kbsi_protein ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES kbsi_project(id);
CREATE INDEX IF NOT EXISTS idx_kbsi_protein_project ON kbsi_protein (project_id);

-- ============================================================================
-- RLS 정책: 프로젝트 기반 접근 제어
-- ============================================================================

-- Helper: 현재 사용자가 프로젝트에 접근 가능한지 확인
CREATE OR REPLACE FUNCTION kbsi_can_access_project(p_project_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM kbsi_project
    WHERE id = p_project_id AND (is_public = true OR owner_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM kbsi_project_member
    WHERE project_id = p_project_id AND user_id = auth.uid()
  )
  OR kbsi_get_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 프로젝트: 공개 또는 소속된 프로젝트만 조회
CREATE POLICY "Users can view accessible projects"
  ON kbsi_project FOR SELECT TO authenticated
  USING (is_public = true OR owner_id = auth.uid() OR kbsi_get_user_role() = 'admin'
    OR EXISTS (SELECT 1 FROM kbsi_project_member WHERE project_id = id AND user_id = auth.uid()));

-- 프로젝트 생성: researcher 이상
CREATE POLICY "Researchers can create projects"
  ON kbsi_project FOR INSERT TO authenticated
  WITH CHECK (kbsi_get_user_role() IN ('admin', 'researcher'));

-- 프로젝트 수정: 소유자 또는 admin
CREATE POLICY "Owners can update projects"
  ON kbsi_project FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR kbsi_get_user_role() = 'admin');

-- 프로젝트 삭제: admin만
CREATE POLICY "Admins can delete projects"
  ON kbsi_project FOR DELETE TO authenticated
  USING (kbsi_get_user_role() = 'admin');

-- 멤버: 프로젝트 접근 가능한 사용자만 조회
CREATE POLICY "Members can view project members"
  ON kbsi_project_member FOR SELECT TO authenticated
  USING (kbsi_can_access_project(project_id));

-- 멤버 추가: 프로젝트 소유자 또는 admin
CREATE POLICY "Owners can manage members"
  ON kbsi_project_member FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM kbsi_project WHERE id = project_id AND owner_id = auth.uid())
    OR kbsi_get_user_role() = 'admin'
  );

-- 멤버 삭제: 프로젝트 소유자 또는 admin
CREATE POLICY "Owners can remove members"
  ON kbsi_project_member FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM kbsi_project WHERE id = project_id AND owner_id = auth.uid())
    OR kbsi_get_user_role() = 'admin'
  );
