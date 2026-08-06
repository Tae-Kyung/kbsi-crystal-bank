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

### F11. 외부 DB 연동
- PDB, UniProt, AlphaFold DB 자동 연계
- DOI로 논문 메타데이터 자동 fetch (CrossRef API)
- K-BDS 표준 메타데이터 매핑

### F12. 고급 접근 제어
- 기관별·프로젝트별 RBAC
- NDA 기반 데이터 격리
- 감사 로그(audit log) 대시보드

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
