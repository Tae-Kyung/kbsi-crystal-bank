# TASK: 자기검증형 개발 태스크 시스템

## 개발 워크플로우

모든 태스크는 **선행조건 확인 → 구현 → 자동 검증** 3단계로 실행된다.

```
1. 다음 태스크 확인     npm run task:next
2. 태스크 프롬프트 확인  npm run task:run P1.4.1
3. (Claude Code로 구현)
4. 완료 검증            npm run task:run P1.4.1 -- --verify
5. 전체 상태 점검       npm run task:verify
6. 통합 검증            npm run preflight
```

### 핵심 원칙

1. **선행조건이 미충족이면 태스크를 시작하지 않는다** — `task:run`이 자동으로 확인
2. **모든 태스크는 테스트를 포함한다** — API는 단위 테스트, UI는 컴포넌트 테스트
3. **`--verify`가 통과해야 태스크 완료** — 파일 존재, 테스트 통과, 빌드 성공
4. **Phase 끝에 `preflight` 전체 검증** — typecheck + lint + test + build

---

## 태스크 의존성 그래프

```
P1.1.1 (npm install)
  ├── P1.1.3 (shadcn/ui) ──────────────── P1.3.1 (Layout)
  │                                        P1.3.2 (DataTable)
  │                                        P1.3.3 (FormField, EnumSelect)
  ├── P1.1.2 (TypeScript 컴파일)
  └── P1.5.3 (서열 MW/pI 계산) ← 독립, 먼저 가능

P1.1.4 (Supabase 로컬)
  └── P1.1.5 (DB migration + seed)
       └── P1.2.1 (Supabase 타입 생성)
            ├── P1.4.1 (Protein API) ───── P1.4.2 (목록), P1.4.3 (폼), P1.4.4 (상세)
            ├── P1.5.1 (Construct API) ─── P1.5.2 (목록/상세)
            ├── P1.6.1 (Expression API)
            ├── P1.6.2 (Purification API)     ┐
            ├── P1.6.3 (Crystallization API)  ├── P1.7.1 (실험 탭 UI)
            ├── P1.6.4 (Char+Storage+Diff)    │
            └── P1.6.5 (NMR+CryoEM+Struct)   ┘

P1.8.1 (인증) ← P1.1.4에만 의존, 독립적으로 가능

P1.9.1 (Phase 1 통합 검증) ← 모든 P1.* 완료 후
```

---

## Phase 1: MVP

### 1.1 인프라 설정

| ID | 태스크 | 선행 | 검증 방법 |
|----|--------|------|-----------|
| P1.1.1 | npm install | - | `node_modules/` 존재 |
| P1.1.2 | TypeScript 컴파일 | P1.1.1 | `tsc --noEmit` 통과 |
| P1.1.3 | shadcn/ui 초기화 | P1.1.1 | `components.json` + Button 존재 |
| P1.1.4 | Supabase 로컬 실행 | - | `supabase status` 성공 |
| P1.1.5 | DB migration + seed | P1.1.4 | `supabase db reset` 성공 |
| P1.1.6 | Next.js 빌드 | P1.1.2, P1.1.3 | `next build` 성공 |
| P1.1.7 | Git 초기화 | P1.1.6 | `.git/HEAD` 존재 |

### 1.2 타입 안전성

| ID | 태스크 | 선행 | 검증 방법 |
|----|--------|------|-----------|
| P1.2.1 | Supabase 타입 자동 생성 | P1.1.5 | `supabase.ts`에 kbsi_protein 포함 |

### 1.3 공통 UI

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P1.3.1 | Layout + 네비게이션 | P1.1.3 | Sidebar, Dashboard layout 존재 | `sidebar.test.tsx` |
| P1.3.2 | DataTable 범용 | P1.1.3 | DataTable 컴포넌트 존재 | `data-table.test.tsx` |
| P1.3.3 | FormField + EnumSelect | P1.1.3 | 폼 컴포넌트 존재 | `enum-select.test.tsx` |

### 1.4 Protein 모듈

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P1.4.1 | Protein API CRUD | P1.2.1 | route.ts + [id]/route.ts | `proteins.test.ts` |
| P1.4.2 | Protein 목록 페이지 | P1.4.1, P1.3.1, P1.3.2 | 페이지 파일 존재 | - |
| P1.4.3 | Protein 생성/수정 폼 | P1.4.1, P1.3.3 | new/page.tsx + edit/page.tsx | `protein-form.test.tsx` |
| P1.4.4 | Protein 상세 페이지 | P1.4.1 | [id]/page.tsx 존재 | - |

### 1.5 Construct 모듈

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P1.5.1 | Construct API CRUD | P1.2.1 | route.ts + [id]/route.ts | `constructs.test.ts` |
| P1.5.2 | Construct 목록/상세 | P1.5.1, P1.3.1, P1.3.2 | 페이지 파일 존재 | - |
| P1.5.3 | 서열 MW/pI 계산 | P1.1.1 | sequence.ts 존재 | `sequence.test.ts` |

### 1.6 실험 데이터 API

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P1.6.1 | Expression API | P1.2.1 | route.ts 존재 | `expressions.test.ts` |
| P1.6.2 | Purification API | P1.2.1 | route.ts 존재 | `purifications.test.ts` |
| P1.6.3 | Crystallization API | P1.2.1 | route.ts 존재 | `crystallizations.test.ts` |
| P1.6.4 | Char + Storage + Diff | P1.2.1 | 3개 route.ts 존재 | - |
| P1.6.5 | NMR + CryoEM + Struct | P1.2.1 | 3개 route.ts 존재 | - |

### 1.7 실험 데이터 UI

| ID | 태스크 | 선행 | 검증 |
|----|--------|------|------|
| P1.7.1 | Construct 실험 탭 | P1.5.2, P1.6.1~3 | experiments/page.tsx + 탭 컴포넌트 존재 |

### 1.8 인증

| ID | 태스크 | 선행 | 검증 |
|----|--------|------|------|
| P1.8.1 | Supabase Auth | P1.1.4 | login/page.tsx + middleware.ts 존재 |

### 1.9 통합 검증

| ID | 태스크 | 선행 | 검증 |
|----|--------|------|------|
| P1.9.1 | Phase 1 전체 | 모든 P1.* | `npm run preflight` 통과 |

---

## Phase 2: LLM 파이프라인 + 시각화 + Import/Export

### 2.1 LLM 문헌 추출

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P2.1.1 | LLM 추출 프롬프트 설계 | P1.9.1 | `extraction-prompt.ts` 존재 | - |
| P2.1.2 | 추출 API (OpenAI + CrossRef) | P2.1.1 | `/api/extract/route.ts` 존재 | `extract.test.ts` |
| P2.1.3 | Staging 검토 API (PATCH 승인/거부) | P2.1.2 | `/api/staging/route.ts` 존재 | - |
| P2.1.4 | Staging 검토 UI | P2.1.3 | `/staging/page.tsx` + `staging-review-list.tsx` + `extraction-form.tsx` | - |

### 2.2 리간드·복합체

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P2.2.1 | Ligand API (CRUD) | P1.9.1 | `/api/ligands/route.ts` 존재 | `ligands.test.ts` |
| P2.2.2 | Construct-Ligand 바인딩 API | P2.2.1 | `/api/construct-ligands/route.ts` 존재 | - |
| P2.2.3 | Ligand 목록 페이지 + 폼 | P2.2.1 | `/ligands/page.tsx` + `ligand-form-dialog.tsx` | - |

### 2.3 대시보드

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P2.3.1 | Dashboard 페이지 + 통계 카드 | P1.9.1 | `/dashboard/page.tsx` 존재 | - |
| P2.3.2 | Pipeline Funnel 차트 | P2.3.1 | `pipeline-funnel.tsx` 존재 | - |
| P2.3.3 | Outcome 분포 차트 | P2.3.1 | `outcome-distribution.tsx` 존재 | - |
| P2.3.4 | pH×온도 Scatter Plot | P2.3.1 | `crystallization-heatmap.tsx` 존재 | - |

### 2.4 데이터 Import/Export

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P2.4.1 | CSV/JSON Export API | P1.9.1 | `/api/export/route.ts` 존재 | `export.test.ts` |
| P2.4.2 | CSV Bulk Import API | P2.4.1 | `/api/import/route.ts` 존재 | `import.test.ts` |

### 2.9 통합 검증

| ID | 태스크 | 선행 | 검증 |
|----|--------|------|------|
| P2.9.1 | Phase 2 전체 | 모든 P2.* | `npm run preflight` 통과 |

---

## Phase 3: AI/ML + 외부 DB 연동 + 고급 접근 제어

### 3.1 AI/ML 분석

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P3.1.1 | 결정화 조건 추천 API (k-NN) | P2.9.1 | `/api/recommend/route.ts` 존재 | `recommend.test.ts` |
| P3.1.2 | 결정화 성공 확률 예측 API | P3.1.1 | `/api/predict/route.ts` 존재 | `predict.test.ts` |
| P3.1.3 | 예측 결과 시각화 UI | P3.1.2 | 예측 결과 컴포넌트 존재 | - |
| P3.1.4 | ML Feature Engineering 파이프라인 | P3.1.1 | `src/lib/ml/features.ts` 존재 | `features.test.ts` |

### 3.2 외부 DB 연동

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P3.2.1 | UniProt API 연동 | P2.9.1 | `src/lib/external/uniprot.ts` 존재 | `uniprot.test.ts` |
| P3.2.2 | PDB API 연동 | P2.9.1 | `src/lib/external/pdb.ts` 존재 | `pdb.test.ts` |
| P3.2.3 | AlphaFold DB 연동 | P2.9.1 | `src/lib/external/alphafold.ts` 존재 | - |
| P3.2.4 | DOI → CrossRef 자동 fetch | P2.1.2 | 추출 API에 CrossRef 로직 포함 | - |

### 3.3 고급 접근 제어

| ID | 태스크 | 선행 | 검증 | 테스트 |
|----|--------|------|------|--------|
| P3.3.1 | RBAC (admin/researcher/viewer) | P1.8.1 | RLS 정책 + role 테이블 migration | - |
| P3.3.2 | 프로젝트별 데이터 격리 | P3.3.1 | `kbsi_project` 테이블 + RLS 정책 | - |
| P3.3.3 | Audit Log 대시보드 | P3.3.1 | `/audit/page.tsx` 존재 | - |

### 3.9 통합 검증

| ID | 태스크 | 선행 | 검증 |
|----|--------|------|------|
| P3.9.1 | Phase 3 전체 | 모든 P3.* | `npm run preflight` 통과 |

---

## Phase 2/3 의존성 그래프

```
P1.9.1 (Phase 1 완료)
  ├── P2.1.1 → P2.1.2 → P2.1.3 → P2.1.4  (LLM 추출 파이프라인)
  ├── P2.2.1 → P2.2.2, P2.2.3             (리간드)
  ├── P2.3.1 → P2.3.2, P2.3.3, P2.3.4    (대시보드)
  └── P2.4.1 → P2.4.2                     (Import/Export)
       ↓
P2.9.1 (Phase 2 완료)
  ├── P3.1.1 → P3.1.2 → P3.1.3           (AI/ML)
  │   └── P3.1.4                          (Feature Engineering)
  ├── P3.2.1, P3.2.2, P3.2.3             (외부 DB — 병렬 가능)
  └── P3.3.1 → P3.3.2, P3.3.3            (접근 제어)
       ↓
P3.9.1 (Phase 3 완료)
```

---

## 검증 스크립트 사용법

```bash
# 전체 태스크 상태 점검 (어떤 것이 완료/미완료인지 한눈에)
npm run task:verify

# 다음으로 실행 가능한 태스크 찾기 (선행조건 충족된 것만)
npm run task:next

# 특정 태스크의 프롬프트 + 테스트 명세 확인
npm run task:run P1.4.1

# 특정 태스크의 선행조건만 확인
npm run task:run P1.4.1 -- --check

# 특정 태스크의 완료 여부 검증
npm run task:run P1.4.1 -- --verify

# Phase 완료 시 전체 통합 검증
npm run preflight    # = typecheck + lint + test + build
```

---

## 태스크 실행 예시 (Claude Code 워크플로우)

```
사용자: npm run task:next
시스템: >> P1.5.3: 서열 MW/pI 자동 계산 (선행조건: P1.1.1 완료)

사용자: npm run task:run P1.5.3
시스템: [프롬프트 출력 — 구현 요구사항 + 테스트 명세]

사용자: (Claude Code에 프롬프트 복사하여 실행)
Claude: (src/lib/utils/sequence.ts + tests/utils/sequence.test.ts 생성)

사용자: npm run task:run P1.5.3 -- --verify
시스템: [PASS] 서열 유틸리티: OK
        [PASS] MW/pI 테스트: OK
        >> TASK COMPLETE
```
