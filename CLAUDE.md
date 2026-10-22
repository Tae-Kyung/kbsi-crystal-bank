# KBSI Protein Crystallization Bank

## Project Overview
단백질 결정화은행(Crystallization Bank) 기반 신약개발 AI 데이터 허브.
단백질의 발현 -> 정제 -> 특성분석 -> 결정화 -> 구조결정 전 과정의 실험 데이터를 관리.

## Tech Stack
- **Frontend**: Next.js 15 (App Router) + TypeScript
- **UI**: shadcn/ui + Tailwind CSS v4
- **Database**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **ORM/Query**: Supabase JS Client + SQL migrations
- **Deployment**: Vercel
- **LLM**: OpenAI API (via Vercel AI SDK)
- **Validation**: Zod

## Architecture
```
src/
  app/                  — Next.js App Router pages
    api/                — Route Handlers (REST endpoints)
    (auth)/             — Auth pages (login, register)
    (dashboard)/        — Dashboard layout group
    proteins/           — Protein CRUD pages
    constructs/         — Construct CRUD pages
    experiments/        — Expression, Purification, Crystallization, etc.
  components/
    ui/                 — shadcn/ui base components
    forms/              — Domain-specific form components
    tables/             — Data table components
    charts/             — Visualization components
  lib/
    supabase/           — Supabase client (server/client)
    validations/        — Zod schemas
    llm/                — LLM extraction utilities
    utils/              — Shared helpers (sequence calc, unit normalization)
  types/                — TypeScript type definitions (mirroring DB schema)
  hooks/                — Custom React hooks
supabase/
  migrations/           — SQL migration files (sequential, timestamped)
  seed.sql              — Lookup table seed data
tests/                  — Vitest tests
scripts/                — CLI utilities
```

## Key Design Decisions
1. **Construct-centric**: All experiments link to construct, not protein directly
2. **Failure data included**: NULL = not attempted, value = attempted (including failure)
3. **LLM staging pipeline**: kbsi_extraction_staging -> human review -> main tables
4. **Supabase RLS**: Row Level Security for multi-user access control
5. **Ordinal enums**: Lookup values ordered low->high for ML compatibility
6. **Table naming**: All DB tables use `kbsi_` prefix (e.g., kbsi_protein, kbsi_construct)
7. **Enum naming**: All DB enum types use `kbsi_` prefix (e.g., kbsi_source_type)

## Commands
```bash
# Development
npm run dev                             # Start Next.js dev server
npx supabase start                      # Start local Supabase
npx supabase db reset                   # Reset DB + run migrations + seed
npx supabase migration new <name>       # Create new migration
npm run db:types                        # Regenerate TypeScript types from DB

# Testing & Verification
npm run test                            # Run Vitest (watch mode)
npm run test:run                        # Run Vitest (single run)
npm run typecheck                       # tsc --noEmit
npm run lint                            # ESLint
npm run preflight                       # typecheck + lint + test + build (통합 검증)
npm run preflight:loop                  # 단계별 검증 + 에러 분석/제안 + JSON
npm run test:e2e                        # Playwright E2E 테스트 (배포 사이트)
npm run validate                        # 10-Dimension Data Quality Framework

# Harness & Operations
npm run ops                             # 시스템 현황 (기본)
npm run ops:health                      # API 헬스체크
npm run ops:quality                     # 데이터 품질 점검
npm run ops:report                      # 종합 보고서 (status + health + quality)
npm run ops:snapshot                    # 메트릭 스냅샷 → data/metrics-history/
npm run ops:trend                       # 이전 vs 현재 비교 (>5% 변화 경고)
npm run ops:pipeline -- --dry-run       # 30 스크립트 DAG 실행순서 확인
npm run ops:pipeline                    # 전체 파이프라인 실행
npm run ops:pipeline -- --category=backfill  # 카테고리별 실행

# AI / ML
npm run ai:run                          # AI Scientist 가설 전체 검증
npm run ai:run -- PH001                 # 특정 가설만
npm run ai:list                         # 등록된 가설 목록
npm run ml:export                       # ML 학습용 피처 데이터셋 (JSON)
npm run ml:export -- --csv              # CSV 형식
npm run enrich:precipitant              # Precipitant enrichment v2 (4-Phase)
npm run enrich:precipitant:dry          # Dry-run 미리보기

# Data Maintenance
npm run report:update                   # technical_report.md 수치 자동 업데이트

# Task Management (자기검증형)
npm run task:next                       # 다음 실행 가능한 태스크 찾기
npm run task:run <ID>                   # 태스크 프롬프트 + 테스트 명세 출력
npm run task:run <ID> -- --check        # 선행조건 확인
npm run task:run <ID> -- --verify       # 완료 검증
npm run task:verify                     # 전체 태스크 상태 점검

# Deployment
npx supabase db push                    # Push migrations to remote Supabase
vercel deploy                           # Deploy to Vercel
```

## Harness & Loop Engineering
- **ops-harness.ts**: 운영 하네스 (status/health/quality/report/maintenance/snapshot/trend/pipeline)
- **preflight-loop.ts**: 루프 검증 (typecheck→lint→test→build, 실패 시 에러 분석+제안)
- **data-validation-loop.ts**: 10-Dimension Quality Framework (67 checks, 10 차원)
- **GitHub Actions**: ci.yml (PR/push 자동), ops-report.yml (주간 월요일)
- **.claude/settings.json**: PostToolUse 훅 (Edit|Write → eslint 자동 실행)
- **Pipeline DAG**: 30 스크립트 의존관계 그래프 (harvest→backfill→enrich→cleanup→validate)

## Paper & AI Scientist
- **paper/draft-v1.md**: Nature Scientific Data 논문 초안
- **paper/main.tex**: LaTeX (13페이지, 컴파일 가능)
- **paper/figures/**: 8개 Figure (300 DPI)
- **paper/ai-scientist-input.json**: AI Scientist용 구조화 입력 데이터
- **scripts/ai-scientist-runner.ts**: 가설 자동 검증 (scipy 통계 연동)
- **scripts/export-ml-features.ts**: ML 학습용 확장 피처 데이터셋
- **scripts/enrich-precipitant-v2.ts**: 4-Phase precipitant enrichment (13.8%→56.6%)

## Development Workflow
1. `npm run task:next` — 다음 태스크 확인
2. `npm run task:run <ID>` — 프롬프트/테스트 명세 확인
3. 프롬프트를 Claude Code에 전달하여 구현
4. `npm run task:run <ID> -- --verify` — 자동 검증
5. Phase 완료 시 `npm run preflight` — 전체 통합 검증
6. Git commit

## Code Conventions
- Server Components by default; 'use client' only when needed
- Supabase queries in Server Components or Route Handlers
- Zod schemas validate all user input at API boundary
- Korean comments OK for domain-specific terms
- File naming: kebab-case for files, PascalCase for components
- All DB enums defined in types/database.ts and mirrored in SQL
- All Supabase table references use `kbsi_` prefix (e.g., `.from('kbsi_protein')`)
