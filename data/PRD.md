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
| 논문 추출 (Expression) | **1,620건** | `harvest-papers.ts` | PDB DOI→Europe PMC full text→GPT-4o-mini 파싱 |
| 논문 추출 (Purification) | **613건** | `harvest-papers.ts` | 50K 배치 완료, source_db='PubMed', source_id=DOI |
| Condition Enrichment | **64,048건** (5.5%) | `harvest:enrich` | condition_detail free-text → precipitant/pH/temp 구조화 |
| Negative Control (극단) | 602,072건 | `bulk-negative-controls.ts` | 7가지 전략 |
| Negative Control (현실적) | 324,836건 | `realistic-negative-controls.ts` | 7가지 경계 영역 전략 |

### 현재 DB 규모
- 단백질: **70,023개**
- Construct: **286,580개**
- 결정화 데이터: **1,161,043건** (실험 234K + NC 927K)
- 구조: **286,454건** (X-ray + Cryo-EM + NMR)
- Expression: **1,620건** (논문 LLM 추출 완료)
- Purification: **613건** (논문 LLM 추출 완료)
- Condition Enrichment: **64,048건** (precipitant_type 구조화 5.5%)
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
| Expression/Purification | 1건 | **1,620/613건** (논문 50K 추출 완료) | **해결** |
| precipitant 미구조화 | 98%+ NULL | **64,048건 (5.5%)** Enrichment 진행 중 | 진행 중 |
| pH/temp 이상치 | 각 3건 이하 | 무시 가능 | — |

## 5-4. 활용 방향 — 기존 DB(PDB 등)와의 차별화

### PDB에서 할 수 없는 것 vs KBSI 결정화은행
| PDB | KBSI 결정화은행 |
|-----|-----------------|
| 성공 데이터만 등록 | **실패 조건(clear, precipitate) 체계적 축적 (92.7만건)** → ML 학습 |
| 조건-결과 추론 불가 | **"이 조건이면 성공/실패" AI 예측 (91.9% 정확도)** |
| 발현/정제 데이터 없음 | **Expression 1,620건 + Purification 613건** (논문 자동 추출) |
| 결정화 조건 비구조화 | **Condition Enrichment 64K건** (LLM 파싱으로 precipitant 구조화) |
| 자연어 질의 없음 | **MCP 12 tools + AI 챗봇으로 자연어 데이터 분석** |
| 약물 바인딩 별도 DB | **단백질→구조→결정화→약물 통합 조회 (7,942건 바인딩)** |
| ML 데이터셋 직접 가공 필요 | **이진분류/다단계 ML Export API + DOI용 벤치마크 Export** |
| 연구자 실험 기록 없음 | **Quick Entry 폼으로 30초 입력 (실패 데이터 유도)** |

### 핵심 차별화 요소 상세

#### 1. 논문 기반 Expression/Purification 자동 추출 (세계 최초)
- PDB 구조 → primary citation DOI → Europe PMC full text → GPT-4o-mini Methods 파싱
- Expression: 숙주, 균주, 유도 온도, 수율, IPTG 조건 등 구조화
- Purification: 컬럼(Ni-NTA, SEC), 순도, 수율 등 구조화
- 출처: `source_db='PubMed'`, `source_id=DOI` → 원논문 역추적 가능
- **PDB에는 "E. coli"만 있지만, KBSI에는 "BL21(DE3), 0.5mM IPTG, 18°C, 16h, 15mg/L"까지**

#### 2. Condition Enrichment (결정화 조건 구조화)
- PDB `pdbx_details` free-text: "20% PEG 3350, 0.1 M Bis-Tris pH 6.5"
- KBSI Enrichment: → precipitant_type: PEG 3350, conc: 20, unit: %, buffer: Bis-Tris
- **PDB는 검색 불가한 자유 텍스트, KBSI는 구조화 필드로 "PEG 3350 조건 검색" 가능**

#### 3. Quick Entry — 연구자 실패 데이터 직접 입력
- 3단계 30초 입력: 단백질 검색 → Outcome 선택(기본 precipitate) → 저장
- 침전제 프리셋 12종 클릭 선택
- `source_type='experimental'`, `source_db='KBSI'` → 진짜 실험 데이터
- **PDB에는 절대 올라오지 않는 "이 조건에서 실패했다"를 수집하는 유일한 시스템**

### MCP 기반 활용 시나리오
- **실험 계획 코파일럿**: "내일 결정화 실험할 건데, DB에서 비슷한 단백질의 성공 조건 찾아줘"
- **실패 원인 분석**: "계속 precipitate만 나와. 왜 그런지 DB 분석해줘"
- **논문 작성 지원**: "KRAS 결정화 조건 비교표를 DB에서 만들어줘"
- **신약 타겟 스크리닝**: "이 단백질의 ChEMBL 바인딩 데이터와 결정화 성공률 같이 보여줘"
- **데이터 품질 모니터링**: "이번 달 입력된 데이터 통계와 이상치 체크해줘"

### 벤치마크 결과 (2026-10-08, v4 — Enrichment 98% 완료)

데이터: 100,000건 (성공 30% / 실패 70%) → Train 95,000 / Test 5,000

Outcome 분포: precipitate 58.8%, diffraction_quality 30.1%, clear 5.1%, phase_separation 4.0%, microcrystal 2.0%

#### 이진 분류 (single_crystal 이상 = success)
| k | Accuracy | Precision | Recall | F1 |
|---|----------|-----------|--------|-----|
| 3 | 92.1% | 91.6% | 90.2% | 90.9% |
| **5** | **92.4%** | **92.5%** | **89.9%** | **91.2%** |
| 10 | 91.9% | 92.1% | 88.9% | 90.5% |
| 15 | 91.7% | 91.1% | 89.8% | 90.4% |

#### 다단계 분류 (6-class outcome)
| k | Exact Match | ±1 단계 | ±2 단계 | MAE |
|---|-------------|---------|---------|-----|
| 3 | 88.3% | 90.2% | 92.4% | 0.37 |
| **5** | **88.2%** | **90.3%** | **92.6%** | **0.36** |
| 10 | 88.2% | 90.0% | 92.4% | 0.37 |
| 15 | 87.9% | 89.8% | 92.2% | 0.38 |

#### Feature 중요도 (Ablation, k=10)
| Feature | Accuracy Drop | v3 대비 | 해석 |
|---------|--------------|---------|------|
| **pH** | **-9.9%** | v3: -25.0% | 여전히 최중요, 의존도 균형화 |
| **temperature** | **-9.4%** | v3: -16.5% | 두 번째 핵심, 균형화 |
| additive | -0.5% | 신규 | 소폭 기여 |
| precipitant_type | -0.4% | v3: -0.7% | Enrichment 효과 (54% 커버리지) |
| precipitant_conc | -0.2% | v3: -0.4% | 미미 |
| protein_conc | +0.0% | - | 미미 |

#### 벤치마크 버전 비교
| | v1 (편향) | v2 (극단 NC) | v3 (현실적) | **v4 (Enrichment)** |
|---|-----------|-------------|-------------|---------------------|
| 데이터 | 1K | 50K | 100K | **100K** |
| 성공:실패 | 52:48 | 51:49 | 22:78 | **30:70** |
| Accuracy | 93.1% | 98.3% | 91.9% | **92.4%** |
| F1 (k=5) | - | - | 87.6% | **91.2%** |
| precipitant 커버리지 | - | - | 5.5% | **54%** |
| 해석 | 과대평가 | 극단 패턴 | 현실적 | **Enrichment 효과 확인** |

**v4 해석**: Enrichment(precipitant_type 54% 구조화)로 Precision +2.4%, F1 +3.6% 개선. pH/temperature 의존도가 균형화되어 과적합 위험 감소. ESM-2 임베딩 feature 추가 시 추가 개선 예상.

스크립트: `npx tsx scripts/benchmark-prediction.ts --sample 5000 --k 3,5,10,15 --maxload 100000`

## 5-3. Phase 5 Features — 탐색 UX 고도화

### F15. 트리 기반 네비게이션 (Explorer)

종(Organism) → 단백질 → Construct → 실험 데이터를 트리 구조로 탐색하는 Explorer 뷰.

```
🌍 Homo sapiens (35,000 proteins)
  └── 🧬 KRAS (540 constructs)
        ├── 🔬 KRAS-G12D-1-169
        │     ├── Expression (3) ✅
        │     ├── Purification (2) ✅
        │     ├── Characterization (1) ✅
        │     ├── Crystallization (200) ✅
        │     ├── Diffraction (15) ✅
        │     ├── Structure (15) ✅
        │     └── Ligands (50) 💊
        └── 🔬 KRAS-FL (full-length)
              └── Expression (1) ❌ insoluble
```

**구현 요구사항:**
- Lazy loading: 트리 노드 펼칠 때만 하위 데이터 로드 (286K construct 한번에 불가)
- 1단계: 상위 종 20개 (건수 순) + 종 검색
- 2단계: 해당 종의 단백질 (페이지네이션)
- 3단계: 해당 단백질의 Construct 목록
- 4단계: 실험 데이터 카운트 배지 (✅/❌ 표시) + 클릭 → 상세 이동
- 검색: 종명, 단백질명, gene_name, PDB ID로 트리 노드 바로 이동
- 사이드바 또는 전용 `/explorer` 페이지

**기대 효과:**
- 연구자가 "내 관심 종 → 단백질 → 실험"으로 자연스럽게 탐색
- 데이터 존재 여부를 한눈에 파악 (파이프라인 전 단계)
- 대규모 DB를 효율적으로 브라우징

### F15-1. 유사 단백질 추천 엔진 (핵심 기능)

트리 네비게이션에서 단백질을 선택하면, 유사한 단백질의 성공/실패 사례를 자동 분석하여 최적 실험 조건을 추천합니다.

**시나리오 1: "내 단백질과 비슷한 성공 사례 찾기"**
```
입력: 내 단백질 (KRAS, kinase, 45kDa, Homo sapiens)
출력:
  "유사 단백질 200개 분석 결과:
   - PEG 3350 + pH 7.0 + 18°C 에서 62% 성공 (124/200)
   - Ammonium Sulfate + pH 6.5 에서 41% 성공 (82/200)
   - 추천 1순위: PEG 3350 20%, 0.1M Bis-Tris pH 7.0, 18°C
   - 추천 2순위: (NH4)2SO4 2M, 0.1M HEPES pH 7.5, 20°C"
```

**시나리오 2: "실패 패턴 분석"**
```
입력: 내 단백질의 실패 데이터 50건
출력:
  "실패 패턴 분석:
   - pH 8 이상: 100% 침전 (25/25건)
   - PEG 4000: 80% 실패 (16/20건)
   - 20°C 이상: 70% 실패
   → pH 6-7, PEG 3350, 18°C를 먼저 시도하세요"
```

**시나리오 3: "Construct 설계 비교"**
```
입력: 같은 단백질의 Construct 3개
출력:
  "Construct 비교:
   - Full-length: insoluble (발현 실패)
   - 1-169 truncation: 15mg/L, 결정화 200건 중 15건 성공
   - G12D mutant: 10mg/L, 결정화 100건 중 20건 성공 (최고)
   → G12D mutant 1-169 truncation 추천"
```

**매칭 알고리즘:**
- Level 1: 서열 유사도 (k-mer Jaccard, 기존 구현)
- Level 2: 도메인 유사도 (InterPro/Pfam — F17)
- Level 3: 물리화학 유사도 (MW, pI, hydrophobicity)
- Level 4: 생물종 가중치 (같은 종 > 유사 종)

**기대 효과:**
- 연구자의 결정화 시행착오를 **50% 이상 감소**
- 세계 유일: 실패 데이터 기반 "하지 말아야 할 조건" 추천
- 논문에서 찾을 수 없는 실패 패턴의 체계적 분석

### F15-1a. 서열 유사도 검색 고도화

현재 k-mer Jaccard는 갭/치환 미고려로 과학적으로 약함. Proper alignment로 교체 필요.

**현재 (k-mer Jaccard):**
- 3글자 부분 문자열 공유 비율
- 갭 불가, 치환 행렬 없음 (I→L도 다른 것으로 처리)
- 50K construct에서 300ms로 빠르지만 정확도 낮음

**개선 단계:**

| 단계 | 방법 | 정확도 | 속도 | 구현 |
|------|------|--------|------|------|
| 1단계 | **NCBI BLAST API** | 최고 | 30초+ (외부) | 쉬움 |
| 2단계 | **MMseqs2 사전 클러스터링** | 높음 | 즉시 (사전 계산) | 중간 |
| 3단계 | **자체 Smith-Waterman + BLOSUM62** | 높음 | 서버 계산 | 높음 |

**1단계: NCBI BLAST API (프로토타입)**
```
입력 서열 → NCBI BLAST REST API (blastp, nr/pdb DB)
  → E-value < 0.001 매칭
  → PDB ID 추출 → KBSI DB에서 construct 검색
  → 유사 단백질의 결정화 데이터 분석
```
- 장점: 정확한 alignment, 검증된 알고리즘
- 단점: 30초+ 지연, 외부 의존, rate limit

**2단계: MMseqs2 클러스터링 (운영)**
```
사전 계산 (오프라인):
  286K seq_final → MMseqs2 cluster (--min-seq-id 0.3)
  → kbsi_sequence_cluster 테이블 (construct_id, cluster_id, rep_id)

검색 (온라인):
  입력 서열 → MMseqs2 search (사전 구축 DB)
  → cluster_id → 같은 클러스터의 모든 construct
  → 결정화 데이터 분석
```
- 장점: 즉시 결과, 정확, 외부 의존 없음
- 단점: MMseqs2 바이너리 + 사전 계산 필요

### F15-1b. Protein Language Model 기반 서열 검색 (ESM-2 + pgvector)

ESM-2 (Meta) 단백질 언어 모델로 서열을 벡터 임베딩한 후, pgvector로 밀리초 검색.
BLAST보다 빠르고, 진화적으로 먼 상동 단백질도 감지 가능.

**아키텍처:**
```
사전 계산 (1회, GPU 서버):
  286K seq_final → ESM-2 (esm2_t33_650M) → 286K 벡터 (640차원)
  → Supabase pgvector 테이블에 저장

실시간 검색 (밀리초):
  입력 서열 → ESM-2 → 벡터 1개
  → SELECT * FROM kbsi_sequence_embedding
    ORDER BY embedding <-> query_vector
    LIMIT 50
  → 0.1초
```

**테이블:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kbsi_sequence_embedding (
  construct_id  BIGINT PRIMARY KEY REFERENCES kbsi_construct(id),
  embedding     vector(640),     -- ESM-2 t33 output dimension
  model_version TEXT DEFAULT 'esm2_t33_650M'
);

CREATE INDEX idx_embedding_ivfflat
  ON kbsi_sequence_embedding
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

**BLAST 대비 장점:**

| 항목 | BLAST | ESM-2 + pgvector |
|------|-------|-----------------|
| 속도 | 30초+ | **0.1초** |
| 원격 상동체 | 못 찾음 (서열 20% 이하) | **구조/기능 유사도로 감지** |
| 외부 의존 | NCBI 서버 | **자체 DB** |
| GPU 필요 | 불필요 | **사전 계산만** (실시간은 CPU) |

**구현 단계:**
1. GPU 서버에서 ESM-2로 286K 서열 임베딩 계산 (~1시간)
2. Supabase pgvector에 저장
3. /api/copilot에서 쿼리 서열 → ESM-2 임베딩 → pgvector KNN
4. 유사 단백질의 결정화 데이터 분석 → 조건 추천

**추가 활용:**
- 단백질 클러스터링 (임베딩 K-means)
- 결정화 성공 예측 ML feature (임베딩 직접 사용)
- AI Scientist: 임베딩 공간에서 단백질 군집별 결정화 패턴 자동 발견

### F15-2. Crystallization Copilot (킬러 기능 #1)

단백질 서열 하나를 입력하면 Construct 설계 → 발현 조건 → 결정화 조건 → 실패 시 대안까지 엔드투엔드 실험 전략을 생성합니다.

**입력**: FASTA 서열 1개
**출력**: 4단계 실험 전략 (Construct 설계, 발현 조건, 결정화 상위 12조건, 실패 시 대안)

**파이프라인**:
1. 서열 → k-mer Jaccard로 유사 단백질 검색 (기존 구현)
2. 유사 단백질의 Construct/Expression/Crystallization 성공 패턴 집계
3. 성공률 기반 조건 랭킹 + 실패 패턴 분석 (피할 조건)
4. 단계별 추천 생성 (AI 요약)

**기대 효과**: 1500번 시행착오 → 12번으로 감소. 모든 구조생물학자가 매일 사용하는 서비스.

**현재 준비도**: 80% (1.16M 데이터 + k-NN + 26K expression 확보)

### F15-3. Custom Screen Designer (킬러 기능 #2)

범용 상업 스크린(96조건, 성공률 ~5%) 대신, 내 단백질에 최적화된 맞춤 스크린(24조건, 예상 성공률 ~30%)을 자동 생성합니다.

**입력**: 단백질 정보 (서열 or 유사 단백질 ID)
**출력**: 24조건 맞춤 스크린 (precipitant, buffer, pH, temp, additive 조합)

**알고리즘**:
1. 유사 단백질의 성공 조건에서 빈출 조합 추출
2. 실패 조건 제거 (pH>8.5 100% 침전 등)
3. 조건 공간을 균등 커버하는 24조건 선택 (diversity sampling)
4. 출력: 96-well plate 배치도 (PDF/Excel)

**기대 효과**: 시약 비용 75% 절감, 시간 75% 절감, 논문 가능.

### F15-4. Adaptive Feedback Loop (킬러 기능 #3)

실험 결과를 입력하면 즉시 다음 실험 조건을 추천하는 실시간 피드백 루프.

**흐름**:
1. 연구자: 96조건 결과 입력 (Quick Entry, 30초)
2. 시스템: microcrystal 3개의 공통 조건 분석
3. 시스템: Optimization 24조건 자동 생성 (pH/농도/온도 그리드)
4. 연구자: 다음 플레이트 세팅 → 결과 입력 → 반복

**현재 준비도**: 50% (Quick Entry 있음, 추천 연동 필요)

### F16. 아미노산 조성 기반 Feature Engineering
- seq_final → hydrophobic %, charged %, aromatic % 자동 계산
- IUPred disorder 예측, Kyte-Doolittle surface hydrophobicity
- ML 벤치마크 v5에 feature로 추가

### F17. Protein Family / Domain 분류
- InterPro/Pfam domain annotation 수집 (UniProt 연결 활용)
- "kinase domain은 PEG 3350에서 성공률 높다" 같은 도메인 수준 인사이트
- 도메인별 결정화 성공률 교차 분석

### F18. 데이터 논문 발행
- Nature Scientific Data 데이터셋 논문 제출
- Zenodo DOI 발행 + 벤치마크 데이터셋 공개
- PyPI 패키지 (kbsi-protein) 배포

## 5-4. Phase 6 — AI Scientist for Crystallization

### F19. AI Scientist Agent (Sakana AI 기반)

Sakana AI의 "AI Scientist" 프레임워크를 단백질 결정화 도메인에 적용하여, 자율적으로 가설을 생성하고 DB를 분석하여 새로운 패턴을 발견하고 실험을 설계하는 AI 연구자 시스템.

**아키텍처:**
```
┌─────────────────────────────────────────────┐
│              AI Scientist Agent              │
│  (Sakana 기반, 가설→검증→발견→논문 루프)      │
├─────────────────────────────────────────────┤
│         MCP (15+ 도구)                       │
│  searchProteins, predictSuccess,             │
│  searchCrystallization, getLigandBinding, ... │
├─────────────────────────────────────────────┤
│         KBSI Database                        │
│  59K proteins, 1.16M crystallization,        │
│  476K diffraction, 63K bindings, ...        │
├─────────────────────────────────────────────┤
│         실험실 (KBSI 연구자)                  │
│  Quick Entry → 실험 결과 → 피드백 루프       │
└─────────────────────────────────────────────┘
```

**자율 연구 루프:**
1. **가설 생성**: DB 메타데이터 스캔 → "kinase domain은 PEG 3350 pH 6.5에서 성공률이 높을 것"
2. **데이터 수집**: MCP 도구로 관련 데이터 쿼리 (1.16M 결정화 조건)
3. **통계 검증**: p-value, effect size, confidence interval 계산
4. **패턴 발견**: 기존에 알려지지 않은 상관관계 자동 도출
5. **실험 설계**: 검증 실험 조건 자동 생성 (24조건 맞춤 스크린)
6. **실험 요청**: KBSI 연구자에게 실험 의뢰 (Quick Entry로 결과 수신)
7. **결과 분석**: 가설 검증/기각 → 수정 가설 → 반복
8. **보고서/논문**: 발견 + 통계 + 시각화 자동 생성

**시나리오 1: 자율 패턴 발견**
```
AI Scientist 자동 분석 결과:
  발견 1: Transmembrane 단백질은 MPD > PEG (p=0.003, n=1,247)
  발견 2: MW 30-50kDa가 결정화 최적 (성공률 28% vs 평균 19%)
  발견 3: insect cell → E. coli 전환 시 결정화 2.1배 상승 (n=342)
```

**시나리오 2: 자율 실험 설계 + 검증 루프**
```
라운드 1: DB 분석 → KRAS G12C 최적 조건 12개 설계 → 연구자 실험
라운드 2: 결과 수신 → microcrystal 3개 → pH/농도 최적화 12개
라운드 3: single crystal 2개 발견 → 최적 조건 확정 → 논문 초안
```

**시나리오 3: 크로스 도메인 인사이트**
```
ChEMBL 바인딩 + 결정화 교차 분석:
  IC50 < 100nM 약물 공결정화 시 해상도 1.3Å 향상 (n=890)
  → 강한 리간드가 단백질 안정화 → 결정화 촉진
  → 결정 난이도 높은 단백질에 리간드 첨가 전략 제안
```

**Sakana AI Scientist와의 차이점:**

| 항목 | Sakana 원본 | KBSI 적용 |
|------|-----------|----------|
| 실험 환경 | ML 코드 실행 (in silico) | **실제 결정화 DB + wet lab 실험** |
| 데이터 | ML 벤치마크 | **1.16M 실험 데이터 (성공+실패)** |
| 도구 | Python 코드 실행 | **MCP 15개 도구 (DB 직접 접근)** |
| 검증 | 모델 성능 | **통계 검정 + 실험 검증** |
| 출력 | ML 논문 | **실험 프로토콜 + 결정화 논문** |
| 피드백 | 없음 (1회성) | **연구자 실험 결과 → 반복 루프** |

**구현 요구사항:**
- Sakana AI Scientist 코드 포크 및 도메인 어댑터 개발
- MCP 도구 확장 (통계 분석, 실험 설계 전용 도구)
- 가설 템플릿 라이브러리 (결정화 도메인 특화)
- 실험 요청 → Quick Entry → 결과 수신 자동화 파이프라인
- 보고서/논문 생성 템플릿 (Nature Scientific Data 형식)

**리스크 및 대응:**
- AI 제안 실험 실패 시 신뢰 상실 → 초기 "AI vs 연구자 경험" 비교 실험으로 신뢰 구축
- 가설 품질 → 도메인 전문가 검토 단계 추가 (human-in-the-loop)
- 계산 비용 → 가설 우선순위 랭킹 후 상위만 검증

### F20. MCP 기반 AI Agent 생태계

KBSI 데이터를 다양한 AI Agent에서 접근할 수 있는 개방형 생태계 구축.

**지원 Agent:**
- Claude (Anthropic) — MCP 네이티브 지원, 이미 연동 완료
- GPT (OpenAI) — Function Calling 어댑터
- 자체 Agent — Sakana AI Scientist 기반

**MCP 도구 확장 계획:**
- 현재 15개 → 25개 (통계 분석, 실험 설계, 보고서 생성 등)
- 도구 간 체이닝 지원 (서열 검색 → 유사 조건 → 예측 → 스크린 설계)
- 벌크 데이터 접근 도구 (CSV/JSON export, 벤치마크 데이터셋)

## 5-5. Phase 7 — 데이터 관리 어드민 시스템

### F21. 데이터 관리 어드민 대시보드 (/admin)

24개 수집/정제 스크립트를 웹 UI에서 관리하고, 데이터 품질을 실시간 모니터링하는 관리자 전용 시스템.

**현재 문제:**
- 스크립트 실행에 SSH/CLI 접속 필요
- 진행 상황 확인이 어려움 (tail 로그 수동 확인)
- 마지막 실행 시점, 결과 이력 관리 안 됨
- 새 세션에서 "진행 상황 확인해줘" 반복

**구성:**

```
/admin (관리자 전용, 인증 필수)
├── 데이터 현황 대시보드
│   ├── 테이블별 건수 (실시간)
│   ├── 필드 커버리지 (%) — pH, precipitant_type, gene_name 등
│   ├── 소스별 분포 (PDB, ChEMBL, PubMed, KBSI)
│   └── 최근 변동 (어제 대비 증감)
│
├── 스크립트 관리
│   ├── 24개 스크립트 목록 (수집 10, 정제 11, 합성 2, 운영 1)
│   ├── 각 스크립트: 마지막 실행일, 결과, 소요시간, 에러 수
│   ├── 실행 버튼 (--limit, --offset, --dry-run 파라미터 UI)
│   ├── 진행률 바 (실행 중인 스크립트)
│   └── 실행 이력 로그 (최근 10회)
│
├── 데이터 품질 모니터링
│   ├── LLM 추출 정확도 (81.4% — 자동 검증)
│   ├── 이상치 탐지 (pH < 2, temp > 50 등)
│   ├── 중복 서열 현황 (seq_hash 기반)
│   ├── Enrichment 진행률 (precipitant_type 커버리지)
│   └── 알림: 품질 기준 미달 시 경고
│
└── 수집 일정 관리
    ├── 정기 실행 스케줄 (주 1회 PDB sweep, 일 1회 Enrichment 등)
    ├── 자동 실행 이력
    └── 실패 시 재시도 정책
```

**스크립트 카탈로그 (24개):**

| # | 스크립트 | 유형 | 자동화 가능 | 정기 실행 |
|---|---------|------|-----------|----------|
| 1 | bulk-pdb-sweep | 수집 | ✅ | 주 1회 (신규 PDB 엔트리) |
| 2 | harvest-papers-extended | 수집 | ✅ | 주 1회 |
| 3 | harvest-pdb-ligands | 수집 | ✅ | 주 1회 |
| 4 | harvest-diffraction-from-pdb | 수집 | ✅ | 주 1회 |
| 5 | harvest-chembl-expanded | 수집 | ✅ | 월 1회 |
| 6 | bulk-enrich-conditions | 정제 | ✅ | 일 1회 |
| 7 | backfill-protein-metadata | 정제 | ✅ | 주 1회 |
| 8 | backfill-theoretical-mw | 정제 | ✅ | 주 1회 |
| 9 | backfill-space-group | 정제 | ✅ | 주 1회 |
| 10 | backfill-references | 정제 | ✅ | 주 1회 |
| 11 | backfill-ncbi-gene | 정제 | ✅ | 월 1회 |
| 12 | validate-llm-extraction | 검증 | ✅ | 주 1회 |
| 13 | dedupe-proteins | 정제 | ⚠ (수동 확인) | 월 1회 |
| 14 | ops-harness | 운영 | ✅ | 일 1회 |

### F21-1. 수집 레지스트리 (Harvest Registry)

외부 데이터 수집 이력을 테이블로 관리하여 중복 수집 방지 + 증분 수집 + 이력 추적.

**테이블: `kbsi_harvest_log`**
```sql
CREATE TABLE kbsi_harvest_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_db     TEXT NOT NULL,          -- PDB, ChEMBL, UniProt, AlphaFold, PubMed
  script_name   TEXT NOT NULL,          -- bulk-pdb-sweep.ts
  started_at    TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  status        TEXT DEFAULT 'running', -- running, completed, failed
  total_scanned BIGINT DEFAULT 0,       -- 스캔한 총 건수
  new_inserted  BIGINT DEFAULT 0,       -- 신규 삽입
  skipped_dup   BIGINT DEFAULT 0,       -- 중복 스킵
  failed        BIGINT DEFAULT 0,       -- 실패
  last_offset   BIGINT,                 -- 이어하기용 오프셋
  last_id       TEXT,                   -- 마지막 처리 ID
  params        JSONB,                  -- 실행 파라미터 (limit, offset 등)
  error_log     TEXT,                   -- 에러 메시지
  notes         TEXT
);
```

**활용:**
- 다음 실행 시: `SELECT last_offset FROM kbsi_harvest_log WHERE source_db='PDB' ORDER BY id DESC LIMIT 1` → 이어서 수집
- 중복 방지: offset 기반으로 신규분만 처리 (전체 재스캔 불필요)
- 관리자 UI: 소스별 수집 이력 타임라인 + 건수 변화 그래프

### F21-2. 외부 DB 변경 감지 + 증분 수집

외부 데이터베이스의 신규 데이터를 자동 감지하고 증분 수집.

**감지 메커니즘:**

| 소스 | 변경 감지 방법 | 주기 |
|------|-------------|------|
| RCSB PDB | Search API `audit_author.revision_date > last_harvest` | 주 1회 |
| ChEMBL | 릴리즈 버전 비교 (API) | 월 1회 |
| UniProt | 릴리즈 날짜 비교 | 월 1회 |
| AlphaFold | UniProt 신규 accession 대비 | 월 1회 |
| Europe PMC | 신규 DOI 기반 논문 | 주 1회 |

**증분 수집 흐름:**
```
정기 체크 (cron/스케줄):
  PDB 현재 엔트리 수 조회 → 220,000개
  DB 기록: 마지막 수집 시 220,000개
  → 차이 0 → 스킵

1주 후:
  PDB 현재 엔트리 수 → 221,500개
  → 차이 1,500개 감지
  → 신규 1,500건만 수집 시작
```

### F21-3. 연쇄 실행 (Chain Execution)

신규 데이터 수집 완료 시 관련 backfill 스크립트를 자동 연쇄 실행.

**연쇄 체인 정의:**
```
PDB 신규 수집 완료
  → [자동] harvest-diffraction-from-pdb (신규 construct만)
  → [자동] harvest-pdb-ligands (신규 construct만)
  → [자동] backfill-structure-metadata (신규 structure만)
  → [자동] backfill-references (신규 structure만)
  → [자동] bulk-enrich-conditions (신규 crystallization만)
  → [자동] backfill-theoretical-mw (신규 construct만)
  → [자동] backfill-seq-hash (신규 construct만)
  → [자동] backfill-protein-metadata (신규 protein만)
  → 모두 완료 → validate-llm-extraction 실행
  → 대시보드 stats 자동 갱신

ChEMBL 신규 릴리즈 감지
  → [자동] harvest-chembl-expanded (기존 gene_name 대상)
  → 완료 → 대시보드 갱신

UniProt 월간 릴리즈
  → [자동] backfill-uniprot-ids (미연결 protein 대상)
  → [자동] backfill-ncbi-gene (신규 UniProt 대상)
  → [자동] harvest-alphafold (신규 UniProt 대상)
```

**체인 설정 UI:**
```
관리자가 체인을 정의:
  체인명: "PDB 신규 수집 풀 체인"
  트리거: bulk-pdb-sweep 완료
  순서:
    1. harvest-diffraction (filter: new constructs)
    2. harvest-pdb-ligands (filter: new constructs)
    3. backfill-structure-metadata (filter: new structures)
    ...
  알림: 완료/실패 시 이메일 또는 Slack
```

### F21-4. Backfill 재실행 관리

기존 데이터에 대한 backfill을 주기적으로 또는 조건부로 재실행.

**재실행 시나리오:**
- 스크립트 버그 수정 후: "space_group backfill 재실행 (이전 결과 NULL인 것만)"
- 외부 API 변경: "UniProt API 응답 형식 변경 → gene_name 재추출"
- 데이터 품질 개선: "LLM 프롬프트 개선 후 Characterization 재추출"
- 새 필드 추가: "새 컬럼 추가 → 기존 데이터 backfill"

**재실행 안전장치:**
- 모든 스크립트가 `WHERE field IS NULL` 또는 중복 체크 → 안전하게 재실행
- 재실행 전 dry-run 강제 (UI에서 먼저 미리보기)
- 재실행 이력 기록 (이전 결과와 비교)

**기술 구현:**
- Next.js API Routes로 스크립트 실행 (child_process 또는 Edge Function)
- kbsi_harvest_log 테이블로 실행 이력/상태 관리
- WebSocket 또는 SSE로 진행률 실시간 표시
- 체인 실행 엔진 (선행 스크립트 완료 감지 → 후속 자동 시작)
- 관리자 인증: Supabase Auth role='admin' 체크

**기대 효과:**
- CLI 없이 브라우저에서 데이터 관리
- 중복 수집 방지 → 비용/시간 절감
- 증분 수집 → 항상 최신 데이터 유지
- 연쇄 실행 → 수동 개입 최소화
- 실행 이력 → "언제 마지막으로 돌렸지?" 해결
- 품질 모니터링 → 문제 조기 발견

## 5-6. Phase 8 — 검색 고도화

### F22. 통합 키워드 테이블 + 검색 로그

현재 검색은 kbsi_protein 테이블을 직접 ilike 쿼리. 통합 키워드 테이블로 전환하여 속도 향상 + 다중 엔티티 검색 + 검색 분석.

**테이블: `kbsi_search_keywords`**
```sql
CREATE TABLE kbsi_search_keywords (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword    TEXT NOT NULL,
  type       TEXT NOT NULL,    -- gene_name, organism, precipitant, host, pdb_id, ...
  entity_id  BIGINT,           -- 연결된 protein/construct ID (nullable)
  frequency  INTEGER DEFAULT 0 -- 검색 빈도
);
CREATE INDEX idx_keywords_keyword ON kbsi_search_keywords USING gin(keyword gin_trgm_ops);
```

**테이블: `kbsi_search_log`**
```sql
CREATE TABLE kbsi_search_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query      TEXT NOT NULL,
  user_id    UUID,
  result_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**키워드 소스:**
- gene_name (9.7K) → type='gene_name'
- abbreviation (13K) → type='abbreviation'
- organism (고유값 ~5K) → type='organism'
- precipitant_type (고유값 ~100) → type='precipitant'
- expression_system (고유값 ~50) → type='host'
- pdb_id (286K) → type='pdb_id'

**활용:**
- 검색 시 키워드 테이블에서 빠른 매칭 (trigram index)
- 빈도 기반 정렬 (많이 검색된 것 상위)
- 인기 검색어 대시보드 (관리자)
- 검색 패턴 분석 → 데이터 수집 우선순위

**동기화 전략: Trigger + 배치 조합**

1. **DB Trigger (실시간)**: 데이터 INSERT/UPDATE 시 keyword 자동 동기화
```sql
CREATE FUNCTION sync_keyword_from_protein() RETURNS TRIGGER AS $$
BEGIN
  -- gene_name
  IF NEW.gene_name IS NOT NULL THEN
    INSERT INTO kbsi_search_keywords (keyword, type, entity_id)
    VALUES (NEW.gene_name, 'gene_name', NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  -- abbreviation
  IF NEW.abbreviation IS NOT NULL THEN
    INSERT INTO kbsi_search_keywords (keyword, type, entity_id)
    VALUES (NEW.abbreviation, 'abbreviation', NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  -- organism (entity_id NULL — 종은 단일 엔티티 아님)
  IF NEW.organism IS NOT NULL THEN
    INSERT INTO kbsi_search_keywords (keyword, type, entity_id)
    VALUES (NEW.organism, 'organism', NULL)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protein_keyword
  AFTER INSERT OR UPDATE ON kbsi_protein
  FOR EACH ROW EXECUTE FUNCTION sync_keyword_from_protein();
```

유사 trigger를 kbsi_crystallization (precipitant_type), kbsi_construct (expression_system) 등에도 적용.

2. **배치 전체 재구축 (주기적)**: 누락 방지 + frequency 갱신
```bash
# 어드민 시스템(F21) 연쇄 실행 체인에 포함
# PDB 수집 완료 → keyword 재구축
npx tsx scripts/rebuild-search-keywords.ts
```
- TRUNCATE → 전체 재생성 (깨끗한 상태 보장)
- frequency 업데이트 (search_log에서 집계)
- 일 1회 또는 수집 후 자동 실행

3. **Materialized View (대안)**
```sql
CREATE MATERIALIZED VIEW kbsi_search_keywords_mv AS
  SELECT gene_name AS keyword, 'gene_name' AS type, id AS entity_id
    FROM kbsi_protein WHERE gene_name IS NOT NULL
  UNION ALL
  SELECT DISTINCT organism, 'organism', NULL
    FROM kbsi_protein WHERE organism IS NOT NULL
  UNION ALL
  SELECT DISTINCT precipitant_type, 'precipitant', NULL
    FROM kbsi_crystallization WHERE precipitant_type IS NOT NULL;

REFRESH MATERIALIZED VIEW CONCURRENTLY kbsi_search_keywords_mv;
```
- 단순하지만 실시간 반영 안 됨 → Trigger 보조로 사용

---

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
