# PRD: KBSI 단백질 결정화은행 데이터 플랫폼

## 1. Product Vision

단백질 구조 연구자가 발현-정제-특성분석-결정화-구조결정의 전 과정을 하나의 플랫폼에서 기록·검색·분석할 수 있는 웹 기반 데이터베이스 시스템.

**핵심 가치**: 실패 데이터를 포함한 체계적 축적 -> 조건-결과 추론 -> AI 기반 결정화 예측

## 2. Target Users

| 사용자 | 역할 | 핵심 니즈 |
|--------|------|-----------|
| 구조생물학 연구자 | 실험 데이터 입력·조회 | 빠른 입력, 과거 실험 검색, 유사 조건 탐색 |
| PI / 그룹 리더 | 프로젝트 진행 상황 파악 | 대시보드, 통계, 보고서 |
| 데이터 관리자 | LLM 추출 데이터 검증 | staging 검토 UI, 일괄 승인/거부 |
| AI/ML 연구자 | 학습 데이터 추출 | 구조화된 쿼리, CSV/JSON export |
| 신약개발 기업 연구자 | 표적 단백질 조건 검색 | 검색, 접근 권한 관리 |

## 3. Core Features (MVP - Phase 1)

### F1. 단백질·Construct 관리
- 단백질 CRUD (이름, 유전자, 생물종, 외부 DB ID)
- Construct CRUD (잔기 범위, 벡터, 서열, 태그)
- Construct 복제 (mutation만 변경하여 파생)
- 서열 입력 시 MW, pI 자동 계산

### F2. 실험 데이터 기록
- **발현(Expression)**: 숙주, 균주, 유도 온도, 수율, 결과 등급
- **정제(Purification)**: 정제 방법, 단계별 컬럼/버퍼, 최종 순도·수율
- **특성분석(Characterization)**: DLS, DSC, SEC-MALS, MS 등 (롱포맷)
- **결정화(Crystallization)**: 침전제(종류+농도+단위), pH, 온도, 결과 등급
- **회절(Diffraction)**: 해상도, 공간군, 빔라인
- **NMR / Cryo-EM**: 각 기법별 핵심 파라미터
- **구조(Structure)**: 최종 구조 통합 (방법 무관 조회)

### F3. 실패 데이터 시스템
- 모든 실험에 `attempt_number` + 순서형 `result_level`
- NULL(미시도) vs 실패값(시도했으나 실패)의 UI 레벨 구분
- 실패 사유 자유 텍스트 기록

### F4. 검색·조회
- 단백질명, 생물종, construct 유형별 필터링
- 결정화 조건(pH 범위, 온도 범위, 침전제 유형) 필터
- outcome별 성공률 통계
- 전문 검색 (notes, conditions 필드)

### F5. 파일 첨부
- SDS-PAGE 겔 이미지, SEC profile, 결정 사진
- Supabase Storage 연동
- 테이블·레코드별 첨부 관리

### F6. 인증·권한
- Supabase Auth (이메일 로그인)
- Row Level Security 기본 정책

## 4. Phase 2 Features

### F7. LLM 문헌 추출 파이프라인
- PDF 업로드 → 텍스트/테이블 추출 (PyMuPDF / GROBID)
- OpenAI API로 구조화된 데이터 추출
- `kbsi_extraction_staging` 적재
- 검토 UI: 원문 스니펫과 추출값 나란히 표시
- 일괄 승인 → 본 테이블 이관

### F8. 리간드·복합체 관리
- 리간드 CRUD (SMILES, InChI, MW)
- construct-ligand 바인딩 데이터 (Kd, IC50)
- 복합체 구조 연결

### F9. 대시보드·시각화
- 프로젝트별 파이프라인 진행 현황 (발현→결정화 funnel)
- 결정화 성공률 히트맵 (pH x 온도)
- 침전제별 성공률 차트
- 시간별 데이터 축적 추이

### F9-2. 데이터 Import/Export
- CSV/JSON export (테이블별, construct_id 필터)
- CSV bulk import (기존 연구자 데이터 마이그레이션)
- 엑셀 템플릿 다운로드

## 5. Phase 3 Features

### F10. AI/ML 분석
- 결정화 조건 추천 (유사 단백질 기반)
- 결정화 성공 확률 예측 모델
- 데이터 export (ML 학습용 CSV/Parquet)

### F11. 외부 DB 연동 및 데이터 자동 수집
- PDB, UniProt, AlphaFold DB 자동 연계
- DOI로 논문 메타데이터 자동 fetch (CrossRef API)
- K-BDS 표준 메타데이터 매핑

### F13. PDB Import 및 데이터 증강 파이프라인
PDB 공개 데이터를 활용하여 결정화 조건 데이터를 체계적으로 축적하는 3단계 파이프라인.

#### F13-1. 추천 단백질 관리 (Featured Proteins)
- `kbsi_featured_protein` 테이블로 추천 목록 동적 관리
- 미등록/등록됨 탭 분리, 체크박스 일괄 등록
- PDB ID 입력으로 추천 목록에 동적 추가 (PDB에서 자동 정보 fetch)
- "더 추천받기" 기능: PDB에서 카테고리별(키나아제, 프로테아제, 수용체 등) 새 단백질 자동 탐색

#### F13-2. 결정화 조건 자동 파싱 (Condition Enrichment)
- PDB `exptl_crystal_grow.pdbx_details` free-text를 LLM(GPT-4o-mini)으로 구조화
- 추출 필드: precipitant_type/conc/unit, buffer_type, salt_type/conc, protein_concentration, additive, drop_ratio
- 개별 파싱 및 전체 일괄 파싱 지원

#### F13-3. Negative Control 합성 (Data Augmentation)
- 성공 조건(diffraction_quality/single_crystal) 기반 실패 예상 조건 자동 생성
- 7가지 변형 전략: pH 극단(상/하), 침전제 없음/과다/부족, 고온, 고농도 염
- `source_type = 'synthetic'`으로 합성 데이터 구분
- 전략별 선택 생성 및 일괄 삭제 지원
- ML 학습용 데이터 불균형 해소 목적

#### F13-4. TargetTrack 대용량 데이터 import
- Zenodo 아카이브(DOI: 10.5281/zenodo.821654)에서 TargetTrack 데이터 다운로드 (800MB)
- 335,771 타겟 중 결정화 프로토콜 텍스트 추출 (258K+ crystallization 프로토콜)
- LLM(GPT-4o-mini)으로 free-text 프로토콜 → 구조화 조건 파싱
- `source_type = 'literature'`로 DB import
- 스크립트: `scripts/extract-cryst-protocols.ts` (XML→JSON) + `scripts/import-cryst-protocols.ts` (LLM 파싱→DB)

#### F13-5. 대시보드 시각화 강화
- Crystallization Data Overview 카드: 전체/성공/실패/합성 건수 요약
- 결정화 히트맵(pH × 온도): 실험/DB 데이터(●) vs 합성 데이터(▲) 모양 구분, outcome별 색상
- Outcome 파이차트: 실험+합성 데이터 구분 표시
- 실험 탭: source_type별 배지(PDB/합성) + 합성 데이터 점선 테두리 구분

#### F13-6. ML 학습 데이터셋 Export
- `/api/export/ml-dataset` 전용 API
- 합성 데이터 포함/제외 옵션
- 이진 분류(success=1/failure=0) 또는 6단계 등급(0~5) 선택
- CSV/JSON 포맷 다운로드
- 단백질명, 유기체, 발현 시스템 등 메타데이터 포함

### F12. 고급 접근 제어
- 기관별·프로젝트별 RBAC
- NDA 기반 데이터 격리
- 감사 로그(audit log) 대시보드

## 5-2. Phase 4 Features — AI 기능 고도화 & 외부 연동

### F14. AI 챗봇 사이드패널
- Vercel AI SDK `useChat` + OpenAI GPT-4o-mini 스트리밍
- 7개 function calling 도구: search_proteins, search_constructs, get_experiments, get_statistics, recommend_crystallization, predict_success, search_crystallization_conditions
- 대시보드 우측 하단 플로팅 버튼 → 접이식 사이드패널
- 제안 질문 3개 + tool 호출 상태 실시간 표시

### F15. MCP 서버 (Model Context Protocol)
- `/api/mcp` — WebStandard Streamable HTTP MCP 서버 (Stateless)
- claude.ai, Claude Desktop, Claude Code에서 직접 연결 가능
- Service Role 클라이언트로 RLS 바이패스 (읽기 전용)
- 7개 MCP 도구 = 챗봇과 동일 도구셋
- 연결: claude.ai → Settings → Integrations → `https://kbsi-crystal-bank.vercel.app/api/mcp`

### F16. OpenAPI / Swagger
- `/api/openapi` — OpenAPI 3.0 JSON 스펙 (28개 엔드포인트)
- `/api-docs` — Swagger UI 인터랙티브 문서
- 다크모드 지원, 사이드바 네비게이션 포함

### F17. 공개 DB 대규모 데이터 수집 파이프라인
- **PDB Bulk Harvest** (`scripts/bulk-pdb-harvest.ts`)
  - RCSB Search API 기반 22개 카테고리별 자동 수집
  - 해상도/pH 필터, 중복 방지, dry-run 지원
  - Protein → Construct → Expression → Crystallization → Structure 자동 생성
  - `npm run harvest:pdb -- --total 500 --min-ph --resolution 3.0`
- **TargetTrack 전량 Import** (`scripts/bulk-targettrack.ts`)
  - LLM 배치 병렬 처리, 중복 방지 (TT-{id} construct name 체크)
  - `npm run harvest:targettrack -- --batch 20`
- **Condition Enrichment 일괄 파싱** (`scripts/bulk-enrich-conditions.ts`)
  - condition_detail free-text → precipitant/pH/temperature 구조화
  - 기존 값 보존, null 필드만 업데이트
  - `npm run harvest:enrich -- --limit 300`

## 5-3. 데이터 수집 현황 (2026-10-03 기준)

| 데이터 소스 | 수집 건수 | 방법 | 비고 |
|-------------|-----------|------|------|
| KBSI 자체 실험 | 시드 3건 | 수동 입력 | KRAS, EGFR, GFP |
| RCSB PDB Import 1차 | 331건 | `harvest:pdb` | 22개 카테고리, 해상도 ≤ 3.0A, pH 필수 |
| RCSB PDB Import 2차 | 566건 | `harvest:pdb` 병렬 | 22개 카테고리, 해상도 ≤ 3.5A, pH 필수, 카테고리당 100건 |
| TargetTrack/PepcDB | 80건 | `harvest:targettrack` | LLM 프로토콜 파싱 |
| Condition Enrichment | 763건 | `harvest:enrich` | free-text → 구조화 필드 추출 (1차 239 + 2차 524) |
| Negative Control | 합성 | `/api/pdb-import/negative-controls` | 7가지 변형 전략 |

### 현재 DB 규모
- 단백질: **541개**
- Construct: **1,275개**
- 결정화 데이터: **1,738건** (pH 정보 포함)
- 구조: **1,194건**
- 결정화 조건 구조화율: ~80% (precipitant_type 추출 완료)

## 6. Technical Constraints

| 항목 | 결정 |
|------|------|
| 프론트엔드 | Next.js 15 (App Router) + TypeScript |
| 배포 | Vercel |
| 데이터베이스 | Supabase (PostgreSQL) |
| 파일 저장 | Supabase Storage |
| 인증 | Supabase Auth |
| 테이블 명명 | `kbsi_` 접두사 |
| LLM | OpenAI API (Vercel AI SDK) |
| UI | shadcn/ui + Tailwind CSS |

## 7. Success Metrics

| 지표 | 목표 (1년차) |
|------|-------------|
| 등록된 단백질 수 | 250+ |
| 실험 데이터 레코드 | 5,000+ |
| 문헌 추출 논문 수 | 500+ |
| 결정화 예측 정확도 | 70%+ (baseline) |
| 활성 사용자 | 20+ |

## 8. Risks & Mitigations

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 데이터 입력 부담으로 사용자 이탈 | High | 자동완성, 템플릿 복제, 벌크 임포트 |
| LLM 추출 정확도 부족 | Medium | staging 검증 필수화, confidence threshold |
| Supabase 무료 티어 한계 | Low | Pro 플랜 전환, 자체 호스팅 전환 가능 |
| 데이터 보안 (NDA 데이터) | High | RLS, 암호화, 감사 로그 |
