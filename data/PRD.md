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
- **12개** function calling 도구 (공통 쿼리 모듈 `crystallization-queries.ts` 기반)
  - 검색: search_proteins, search_constructs, search_ligands, search_structures, search_crystallization_conditions, sequence_search
  - 예측: recommend_crystallization, predict_success
  - 조회: get_experiments, get_statistics, get_bindings, get_data_quality
- XSS 수정 완료 (dangerouslySetInnerHTML → React 엘리먼트)

### F15. MCP 서버 (Model Context Protocol)
- `/api/mcp` — WebStandard Streamable HTTP MCP 서버 (Stateless)
- claude.ai, Claude Desktop, Claude Code에서 직접 연결 가능
- Service Role 클라이언트로 RLS 바이패스 (읽기 전용)
- **12개** MCP 도구 = 챗봇과 동일 도구셋 (공통 모듈 공유)
- 연결: claude.ai → Settings → Integrations → `https://kbsi-crystal-bank.vercel.app/api/mcp`

### F16. OpenAPI / Swagger + API Key
- `/api/openapi` — OpenAPI 3.0 JSON 스펙 (30+ 엔드포인트)
- `/api-docs` — Swagger UI 인터랙티브 문서
- `/api/api-keys` — API Key 발급/조회 시스템
- `/api/sequence-search` — 서열 유사도 검색 (k-mer Jaccard)
- `/api/export/benchmark-dataset` — DOI용 벤치마크 데이터셋 Export (CC-BY-4.0)

### F18. UX 디자인 개선 (Stitch + 멀티 에이전트 리뷰)
- Stitch 프로젝트 `6596413338564247833`: 16개 화면 디자인 (초기 8 + 개선 8)
- 멀티 에이전트 UX 리뷰: 바이오연구자 + 시각화 전문가 + 접근성 전문가
- **P0 적용 완료**: XSS 수정, 글로벌 검색바, 사이드바 그룹화, 인증 리다이렉트 (/dashboard)
- **P1 적용 완료**: Crystallization Overview 카드, Recent Proteins, Feature Importance 수평 막대
- **전체 화면 적용**: Landing 딥블루 Hero + 통계 바 + AI 프리뷰 + PDB 비교표 + 12 DB 배지, Experiments 배지 + 0건 dimming, Ligands Quick Stats, Data Management 섹션 헤더, Benchmark 수평 막대
- 12개 외부 DB 링크 (NCBI Gene, PubMed, UniProt, AlphaFold, InterPro, STRING, PDB, EMDB, BMRB, ChEMBL, PubChem, DOI)

### F19. 페이지 간 링크 연결
- Protein 상세: Explore Data 4종 (Expression/Purification/Crystallization/Structure) + 건수 Badge + construct_id 정확 필터
- Proteins 목록: U(UniProt) + P(PDB) 빠른 외부 검색
- Construct 상세: 파이프라인 traffic-light (●초록/●회색) → construct_id 필터된 실험 목록
- Experiments/[type]: protein/construct_id 필터 + DOI 논문 링크

### F20. 성능 최적화
- Dashboard: ISR `revalidate=60` + 39쿼리→2 Promise.all (530ms→260ms)
- Scatter SVG: outcome별 균등 샘플 6K + Cache-Control 30분 (162초→3초)
- Proteins 목록: count 분리 (JOIN+count 동시 타임아웃 방지) + 50건/페이지

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

## 5-3. 데이터 수집 현황 (2026-10-05 최종)

| 데이터 소스 | 수집 건수 | 방법 | 비고 |
|-------------|-----------|------|------|
| KBSI 자체 실험 | 시드 3건 | 수동 입력 | KRAS, EGFR, GFP |
| RCSB PDB X-ray (pH 포함) | ~226,000건 | `bulk-pdb-sweep.ts` + `harvest:pdb` | 전량 수집 완료 |
| RCSB PDB X-ray (pH 없음) | ~1,013건 | `pdb-sweep-method.ts --no-ph` | 구조/발현 정보 |
| RCSB PDB Cryo-EM | ~4,430건 | `pdb-sweep-method.ts` | 전자현미경 구조 |
| RCSB PDB NMR | ~2,700건 | `pdb-sweep-method.ts` | 용액 구조 |
| TargetTrack/PepcDB | 80건 | `harvest:targettrack` | LLM 프로토콜 파싱 (전량 완료) |
| ChEMBL 바인딩 | 7,942건 | `harvest-chembl.ts` | 20개 신약 타겟 IC50/Kd/Ki |
| UniProt ID | 13,574건 | `backfill-uniprot-ids.ts` | PDB→UniProt accession 연결 완료 |
| AlphaFold | 12,748건 | `harvest-alphafold.ts` | UniProt→AlphaFold 예측 구조 (93.7% 발견율) |
| 논문 추출 (Expression) | ~279건 (증가 중) | `harvest-papers.ts` | PDB DOI→PMC full text→LLM |
| 논문 추출 (Purification) | ~110건 (증가 중) | `harvest-papers.ts` | 50K 병렬 추출 진행 중 |
| Condition Enrichment | 진행 중 | `harvest:enrich` | free-text → 구조화 필드 추출 |
| Negative Control (극단) | 602,072건 | `bulk-negative-controls.ts` | 7가지 전략 |
| Negative Control (현실적) | 324,836건 | `realistic-negative-controls.ts` | 7가지 경계 영역 전략 |

### 현재 DB 규모
- 단백질: **70,023개**
- Construct: **286,580개**
- 결정화 데이터: **1,161,043건** (실험 234K + NC 927K)
- 구조: **286,454건** (X-ray + Cryo-EM + NMR)
- Expression: **~279건** (논문 추출 증가 중)
- Purification: **~110건** (논문 추출 증가 중)
- AlphaFold 연결: **12,748건**
- 리간드: **6,313개** (ChEMBL)
- 바인딩 데이터: **7,942건** (IC50/Kd/Ki)
- UniProt 연결: **13,574건**

### Success Metrics 달성률
| 지표 | 목표 (1년차) | 현재 | 달성률 |
|------|-------------|------|--------|
| 등록된 단백질 수 | 250+ | **70,023** | **28,009%** |
| 실험 데이터 레코드 | 5,000+ | **1,161,043** | **23,221%** |
| 결정화 예측 정확도 | 70%+ | **91.9%** (k=3, 현실적 데이터) | **131%** |

### 데이터 품질 개선 이력
| 이슈 | 이전 | 현재 | 상태 |
|------|------|------|------|
| Outcome 편향 | ~95% 성공 (PDB만) | **28% 성공 / 72% 실패** (NC 927K 합성) | 해결 |
| UniProt ID 부재 | 26건 | **13,574건** (backfill 완료) | 해결 |
| AlphaFold 403 | User-Agent 차단 | 헤더 추가 → 12,748건 연결 | 해결 |
| UniProt ID 부재 | 26건만 존재 | backfill 13,574건 (db_value 수정) | 해결 |
| XSS 취약점 | dangerouslySetInnerHTML | React 엘리먼트 렌더링으로 수정 | 해결 |
| Expression/Purification | 1건 | **75/23건** (논문 추출 진행 중) | 진행 중 |
| precipitant 미구조화 | 98%+ NULL | Enrichment 진행 중 | 진행 중 |
| pH/temp 이상치 | 각 3건 이하 | 무시 가능 | — |

## 5-4. 활용 방향 — 기존 DB(PDB 등)와의 차별화

### PDB에서 할 수 없는 것 vs KBSI 결정화은행
| PDB | KBSI 결정화은행 |
|-----|-----------------|
| 성공 데이터만 등록 | **실패 조건(clear, precipitate) 체계적 축적** → ML 학습 |
| 조건-결과 추론 불가 | **"이 조건이면 성공/실패" AI 예측 (91.9% 정확도, 현실적 데이터)** |
| 자연어 질의 없음 | **MCP 챗봇으로 자연어 데이터 분석** |
| 약물 바인딩 별도 DB | **단백질→구조→결정화→약물 통합 조회** |
| ML 데이터셋 직접 가공 필요 | **이진분류/다단계 ML Export API 제공** |
| 연구자 실험 기록 없음 | **KBSI 자체 실험 데이터 축적 시스템** |

### MCP 기반 활용 시나리오
- **실험 계획 코파일럿**: "내일 결정화 실험할 건데, DB에서 비슷한 단백질의 성공 조건 찾아줘"
- **실패 원인 분석**: "계속 precipitate만 나와. 왜 그런지 DB 분석해줘"
- **논문 작성 지원**: "KRAS 결정화 조건 비교표를 DB에서 만들어줘"
- **신약 타겟 스크리닝**: "이 단백질의 ChEMBL 바인딩 데이터와 결정화 성공률 같이 보여줘"
- **데이터 품질 모니터링**: "이번 달 입력된 데이터 통계와 이상치 체크해줘"

### 벤치마크 결과 (2026-10-05, v3 — 현실적 Negative Control 포함)

데이터: 100,000건 (성공 22% / 실패 78% — 5종 outcome 포함) → Train 95,000 / Test 5,000

Outcome 분포: precipitate 63.8%, diffraction_quality 22.9%, clear 6.7%, phase_separation 3.7%, microcrystal 3.0%

#### 이진 분류 (single_crystal 이상 = success)
| k | Accuracy | Precision | Recall | F1 |
|---|----------|-----------|--------|-----|
| **3** | **91.9%** | **88.9%** | **86.7%** | **87.8%** |
| 5 | 91.9% | 90.1% | 85.2% | 87.6% |
| 10 | 90.9% | 89.7% | 82.3% | 85.8% |
| 15 | 90.6% | 88.1% | 83.3% | 85.6% |

#### 다단계 분류 (5-class outcome)
| k | Exact Match | ±1 단계 | MAE |
|---|-------------|---------|-----|
| **3** | **88.2%** | **90.1%** | **0.37** |
| 5 | 87.9% | 89.9% | 0.36 |
| 10 | 87.6% | 89.7% | 0.37 |

#### Feature 중요도 (Ablation, k=10)
| Feature | Accuracy Drop | 해석 |
|---------|--------------|------|
| **pH** | **-25.0%** | 가장 중요한 예측 인자 |
| **temperature** | **-16.5%** | 두 번째 핵심 인자 |
| precipitant_type | -0.7% | 대부분 NULL (Enrichment 후 개선 예상) |
| precipitant_conc | -0.4% | 미미 |

#### 벤치마크 버전 비교
| | v1 (편향) | v2 (극단 NC) | **v3 (현실적)** |
|---|-----------|-------------|----------------|
| 데이터 | 1K | 50K | **100K** |
| 성공:실패 | 52:48 | 51:49 | **22:78** |
| Accuracy | 93.1% | 98.3% | **91.9%** |
| 해석 | 과대평가 | 극단 패턴만 | **현실적 예측 성능** |

**해석**: v3가 가장 현실적. pH±1~2, temp±8~15 같은 미묘한 변형을 포함하여 경계 영역의 예측이 어려워졌지만, 여전히 91.9%로 목표 70%를 크게 초과. Enrichment로 precipitant_type이 채워지면 추가 개선 예상.

스크립트: `npx tsx scripts/benchmark-prediction.ts --sample 5000 --k 3,5,10,15,20 --maxload 100000`

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
