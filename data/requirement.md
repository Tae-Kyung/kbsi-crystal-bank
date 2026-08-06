# 단백질 구조 연구 데이터베이스 시스템 요구사항 정리

## 1. 프로젝트 개요

연구자가 개발하고자 하는 시스템은 **"단백질 결정화은행(Crystallization Bank) 기반 신약개발 AI 데이터 허브"**이다. 이 시스템은 두 가지 핵심 축으로 구성된다:

1. **단백질 구조 연구 데이터베이스** — 개인 실험 기록과 LLM 기반 문헌 자동 추출 데이터를 통합 관리하는 관계형 DB
2. **신약개발 AI 데이터 허브 플랫폼** — 데이터 수집·저장·분석·서비스를 위한 클라우드 기반 통합 플랫폼

---

## 2. 시스템 목적

- 단백질 결정화 및 X-ray 구조해석 데이터를 효율적으로 축적·공유
- 구조기반 신약개발(SBDD) 연구에 최적화된 데이터 플랫폼 제공
- AI/ML 기반 결정화 예측 모델 및 신약 후보물질 설계에 활용
- 실험 데이터(성공+실패)를 체계적으로 기록하여 **조건-결과 관계 추론**에 활용
- 개별 연구 종료 시 소멸되는 실험데이터를 표준화·자산화

---

## 3. 데이터베이스 설계 요구사항

### 3.1 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **Construct 중심 축** | 실험 결과는 단백질이 아니라 특정 construct에 귀속. `protein → construct → 실험` 계층 구조 |
| **실패 데이터 포함** | 성공 사례뿐 아니라 실패 데이터도 기록 (추론 목적) |
| **NULL과 실패의 구분** | '시도하지 않음(NULL)'과 '시도했으나 실패(등급 값 존재)'를 엄격히 구분 |
| **롱/와이드 혼합** | 고정 컬럼 실험(발현·정제)은 와이드, 이질적 특성분석은 롱포맷 |
| **입력 부담 최소화** | 핵심 변수만 정량 컬럼, 세부 프로토콜은 자유 텍스트, 범주형은 lookup |
| **출처 추적** | 모든 데이터에 experimental/literature/database 출처 기록, 문헌은 reference 연결 |
| **LLM 추출 staging** | LLM 추출 값은 staging 테이블에 적재 후 사람 검토를 거쳐 승인된 것만 본 테이블로 이관 |
| **대리키(surrogate key)** | 모든 테이블은 자동 증가 정수 id를 기본키로 사용 |

### 3.2 데이터 계층 구조

```
원천 계층: reference (논문 메타데이터, 원문 근거 스니펫)
    ↓
추출 계층: extraction_staging (LLM raw 값 + 신뢰도 + 모델 버전 + 원문 스니펫) — 미검증
    ↓
검증 계층: 본 테이블 — 사람 승인 후 추론에 사용 가능
```

### 3.3 주요 테이블 구성

| 테이블 | 설명 | 관계 |
|--------|------|------|
| `protein` | 최상위 — 생물학적 정체성 (이름, 유전자, 생물종) | - |
| `database_id` | 외부 DB ID (UniProt, NCBI 등) | protein 1:N |
| `construct` | 실험의 중심 축 (잔기 범위, 벡터, 서열, 태그 등) | protein 1:N |
| `mutation` | 변이 정보 | construct 1:N |
| `expression` | 발현 실험 (와이드 — 숙주, 온도, 수율, 결과등급) | construct 1:N |
| `purification` | 정제 실행 (와이드) | construct 1:N |
| `purification_step` | 정제 단계 (컬럼/레진, 버퍼 등) | purification 1:N |
| `characterization` | 특성분석 (롱포맷 — DLS, DSC, SEC-MALS, MS 등) | construct 1:N |
| `storage` | 보관 배치 (농도, 부피, 버퍼, 위치) | construct 1:N |
| `crystallization` | 결정화 조건 (침전제, pH, 온도, 결과등급) | construct 1:N |
| `diffraction` | 회절 데이터 (해상도, 공간군, 빔라인) | construct 1:N |
| `nmr_experiment` | NMR 실험 | construct 1:N |
| `nmr_spectrum` | NMR 스펙트럼 | nmr_experiment 1:N |
| `cryoem_session` | Cryo-EM 세션 | construct 1:N |
| `structure` | 최종 구조 통합 (방법 무관 — X-ray/NMR/Cryo-EM) | construct 1:N |
| `reference` | 논문 메타데이터 (제목, 저자, DOI, PMID) | 다대다 |
| `extraction_staging` | LLM 추출 대기 (검증 전) | reference 연결 |
| `attachment` | 파일 참조 (SDS-PAGE, SEC profile, 결정 이미지 등) | 다중 테이블 공유 |

### 3.4 공통 컬럼 (모든 실험 테이블)

- `id` (PK), `construct_id` (FK), `attempt_number`, `source_type`, `reference_id`
- `is_validated`, `performed_by`, `performed_on`, `notes`
- `created_at`, `updated_at`

### 3.5 Lookup (순서형 등급)

| 항목 | 값 (낮음→높음) |
|------|----------------|
| construct_type | full-length, domain, truncation, fusion, mutant |
| source_type | experimental, literature, database |
| expression.result_level | no_expression, insoluble, low, moderate, high |
| purification.result_level | failed, low, acceptable, high |
| crystallization.outcome | clear, precipitate, phase_separation, microcrystal, single_crystal, diffraction_quality |
| structure.method | X-ray, NMR, Cryo-EM |
| review_status | pending, approved, rejected |

---

## 4. 플랫폼 기능 요구사항

### 4.1 데이터 수집 체계

- **연구워크플로우 기반 입력**: 연구자가 자신의 연구과정을 워크플로우로 도식화하고, 이를 템플릿으로 데이터 입력
- **LLM 기반 문헌 자동 추출**: 논문에서 단백질 발현·정제·결정화 조건을 자동 추출, staging 후 검증
- **K-BDS 표준 메타데이터 연계**: 국가바이오 데이터스테이션 표준과 연동
- **기관별 온-프레미스 저장소 연계**: SSO, API 기반 데이터 연계

### 4.2 데이터 저장 및 관리

- **MongoDB(BSON) 기반 저장**: 복잡한 구조의 연구데이터를 효율적으로 관리
- **관계형 DB (SQLite/PostgreSQL)**: 구조화된 실험 데이터용 (스키마 문서 기준)
- **클라우드 인프라**: 공공기관 공인 클라우드, 쿠버네티스 컨테이너 환경

### 4.3 AI/ML 기능

- 데이터 처리 파이프라인(워크플로우) 구성
- Python 스크립트 작성 및 노드화된 데이터 파이프라인
- 데이터 분석 및 통계 시각화 (분포도, 상관관계, Pearson plot 등)
- AI 모델 개발 (regression, KNN, XGBoost 등)
- 개발 모델의 테스트셋 예측 결과 시각화
- 타 연구자 모델 실행 및 결과 확인

### 4.4 신약개발 포털 기능

- 첨단바이오 대형 연구장비(NMR, X-ray, Cryo-EM 등) 활용 원스톱 시스템
- 프로젝트 컨설팅 위원회 운영
- 연구 커뮤니티 네트워킹 및 교육 프로그램
- 기업 NDA 기반 권한별 접근 체계

---

## 5. 데이터 확보 전략

| 데이터 유형 | 출처 | 확보 방법 |
|-------------|------|-----------|
| 단백질 3차원 구조 | PDB | 공공 다운로드 |
| AI 예측 구조 | AlphaFold DB | 공공 다운로드 |
| 약물-표적 상호작용 | ChEMBL, PubChem, BindingDB | 공공 다운로드 + 문헌 수집 |
| 단백질 서열 | UniProt, NCBI | 공공 다운로드 |
| 발현·정제·결정화 조건 | 자체 생산 | 핵심과제 연구 수행 중 축적 |
| NMR 동적구조 | 자체 생산 | KBSI 1.2 GHz NMR 등 대형장비 실험 |
| Cryo-EM 구조 다양성 | 자체 생산 | KBSI Cryo-EM 실험 |
| Bio-SAXS 산란 | 자체 생산 | KBSI Bio-SAXS 실험 |
| 분자동력학 시뮬레이션 | 자체 생산 | 충북대·KBSI 계산과학 수행 |
| 기업 MOA 분석 | 민간(NDA) | NDA 기반 공동연구 |

---

## 6. 미결정 사항

- **DBMS 선택**: 개인/소규모 → SQLite, 다중 사용자/웹 UI → PostgreSQL 권장
- **버퍼·조건의 정량화 수준**: 현재 핵심 변수(pH, 온도, 침전제)만 분리, 추후 확장 검토
- **status 다중값 처리**: construct 진행 상태를 별도 lookup 테이블로 정규화할지 여부
- **characterization value 정규화**: LLM 추출 시 단위 정규화 규칙 정의 필요
- **계산과학 시뮬레이션 도구 표준화**: VASP, Quantum Espresso, WIEN2k, LAMMPS 등 입출력 데이터 형식 통일

---

## 7. 기술적 타당성 검토

### 7.1 강점 (Well-Designed)

**DB 스키마 설계가 실무적으로 우수하다.**
- Construct 중심 축 설계는 구조생물학 실험의 실제 워크플로우를 정확히 반영한다. 같은 단백질이라도 construct(잔기 범위, 태그, 벡터)에 따라 결과가 완전히 달라지므로 이 설계가 맞다.
- 실패 데이터 포함 + NULL/실패 구분은 ML 학습에서 결정적 차이를 만든다. 문헌 데이터의 발표 편향(publication bias)을 명시적으로 인지한 점이 좋다.
- LLM staging → 사람 검증 → 본 테이블 3계층 구조는 데이터 신뢰성을 보장하면서도 대량 데이터 수집을 가능하게 하는 현실적 설계다.

**Lookup 값의 순서형 설계가 ML-friendly하다.**
- 결정화 outcome을 `clear → ... → diffraction_quality`로 순서 정의한 것은 ordinal regression이나 ranking 모델에 직접 활용 가능하다.

**롱/와이드 혼합 전략이 적절하다.**
- 발현·정제처럼 변수가 고정된 실험은 와이드, 특성분석처럼 측정 종류가 계속 늘어나는 데이터는 롱포맷으로 분리한 것은 실용적 판단이다.

### 7.2 기술적 리스크 및 개선 권고

#### R1. 듀얼 DB 전략(MongoDB + RDBMS)의 복잡성

현재 문서에서 MongoDB(BSON)와 관계형 DB(PostgreSQL/SQLite)를 동시에 사용하는 구조가 제시되어 있으나, 두 DB 간 데이터 정합성 유지 전략이 부재하다.

| 구분 | 권고 |
|------|------|
| 핵심 실험 데이터 | PostgreSQL 단일로 충분. JSONB 컬럼으로 반정형 데이터도 처리 가능 |
| 워크플로우/비정형 데이터 | MongoDB가 유리하나, PostgreSQL JSONB로 대체 가능 여부 먼저 검토 |
| 동기화 | 듀얼 DB를 유지할 경우 CDC(Change Data Capture) 또는 ETL 파이프라인 명세 필요 |

**권고**: 초기에는 PostgreSQL + JSONB로 단일화하고, 데이터 규모·접근 패턴이 명확해진 후 MongoDB 분리를 검토하는 것이 운영 부담을 줄인다.

#### R2. LLM 추출 파이프라인의 구체화 필요

`extraction_staging` 테이블은 잘 설계되었으나, 실제 파이프라인 동작에 대한 명세가 부족하다.

보완이 필요한 항목:
- **입력 전처리**: 논문 PDF → 텍스트/테이블 추출 방법 (GROBID, Nougat 등)
- **프롬프트 설계**: 테이블별로 다른 추출 스키마를 어떻게 LLM에 전달할지
- **신뢰도 기준**: `extraction_confidence` 임계값에 따른 자동 승인/수동 검토 분기
- **환각 검증**: `source_snippet`이 원문에 실제 존재하는지 확인하는 후처리 로직
- **배치 처리**: 대량 논문 처리 시 비용·속도 관리 (rate limiting, 캐싱)

#### R3. 데이터 품질 관리 체계 미비

현재 `is_validated` boolean만으로는 데이터 품질을 충분히 관리할 수 없다.

추가 고려 사항:
- **검증 이력 관리**: 누가 언제 어떤 근거로 승인/거부했는지 audit trail
- **데이터 버전 관리**: 같은 행의 값이 수정될 때 변경 이력 추적 (temporal table 또는 audit log)
- **중복 탐지**: `seq_hash`가 construct에만 있으나, 논문에서 추출한 데이터 간 중복 병합 규칙 필요
- **단위 정규화 파이프라인**: characterization의 `unit_raw → unit_normalized` 변환 규칙 라이브러리

#### R4. construct 간 관계 모델링 부재

현재 스키마에서 construct는 독립적이지만, 실제로는 관계가 있다:
- **파생 관계**: construct A에서 mutation을 추가하여 construct B를 만든 경우
- **비교 실험**: 동일 조건에서 여러 construct를 비교한 실험
- **복합체**: 두 개 이상의 construct가 complex를 형성하는 경우

`construct` 테이블에 `parent_construct_id` (자기참조 FK) 추가, 또는 `construct_complex` 연결 테이블 신설을 권고한다.

#### R5. 결정화 조건의 정량화 확장

현재 침전제(precipitant)가 TEXT 단일 컬럼이나, AI/ML 학습을 위해서는 정량화가 필수적이다:
- `precipitant_type` (PEG, Ammonium Sulfate 등) + `precipitant_concentration` (수치) + `precipitant_unit` (%, M, mM)
- `salt_type` + `salt_concentration`
- `buffer_type` + `buffer_concentration`
- `drop_ratio` (단백질:침전제 비율, 수치화)

이는 ML 모델의 feature engineering에 직접적으로 영향을 미치므로, "추후 확장"이 아니라 초기 설계에 반영해야 한다.

#### R6. 검색·조회 인터페이스 명세 부재

데이터를 축적하는 스키마는 상세하나, 연구자가 실제로 데이터를 어떻게 찾고 사용할지에 대한 명세가 없다:
- **핵심 쿼리 패턴**: "이 단백질과 유사한 단백질의 결정화 성공 조건은?", "특정 pH 범위에서의 결정화 성공률은?" 등
- **유사도 검색**: 서열 유사도(BLAST), 조건 유사도 기반 검색
- **대시보드**: 프로젝트별 진행 상황, 성공/실패 통계 시각화

---

## 8. 연구 임팩트 평가

### 8.1 높은 임팩트 요소

| 영역 | 임팩트 |
|------|--------|
| **실패 데이터의 체계적 축적** | 전 세계적으로 결정화 실패 데이터는 거의 공유되지 않는다. 이를 체계적으로 수집하면 ML 학습에 유일무이한 데이터셋이 된다. 논문으로 발표 시 매우 높은 관심 예상. |
| **조건-결과 추론** | 충분한 데이터가 축적되면 "이 특성의 단백질에는 이 결정화 조건이 효과적"이라는 예측이 가능해지며, 이는 실험 시간·비용을 획기적으로 단축한다. |
| **LLM 기반 문헌 추출** | 수만 건의 논문에서 결정화 조건을 자동 추출하면, 현재 PDB에 등록되지 않는 실패 사례나 세부 조건까지 수집 가능. 기존 데이터베이스(PDB, TargetTrack 등)와 차별화. |
| **KBSI 장비 연계** | 1.2 GHz NMR, Cryo-EM 등 국내 최고 수준 장비와 데이터 플랫폼이 결합되면, 장비 활용 효율성이 크게 향상된다. |

### 8.2 임팩트 강화를 위한 제안

1. **벤치마크 데이터셋 공개**: 축적된 결정화 조건-결과 데이터를 익명화하여 벤치마크 데이터셋으로 공개하면 학술적 임팩트가 극대화된다 (Nature Scientific Data 등 데이터 저널 게재 가능).
2. **기존 DB와의 연계**: PDB의 deposition 데이터, TargetTrack(PSI:Biology), MPSTRUC(membrane protein) 등 기존 구조생물학 DB와의 데이터 교환 인터페이스를 구축하면 글로벌 활용도가 높아진다.
3. **예측 모델 API 공개**: 결정화 조건 예측 모델을 REST API로 공개하면 커뮤니티 기여 및 검증이 가능하다.

---

## 9. 추가 보완 권고사항

### 9.1 단계별 구현 로드맵 수립

현재 문서는 최종 목표 상태를 기술하고 있으나, 구현 순서가 없다. 아래와 같은 단계적 접근을 권고한다:

| 단계 | 범위 | 산출물 |
|------|------|--------|
| **Phase 1 (MVP)** | PostgreSQL 스키마 구축 + 웹 기반 CRUD UI + 수동 데이터 입력 | 운영 가능한 실험 기록 시스템 |
| **Phase 2** | LLM 문헌 추출 파이프라인 + staging/검증 워크플로우 | 문헌 데이터 반자동 수집 체계 |
| **Phase 3** | 데이터 분석·시각화 + 기초 ML 모델 (결정화 성공 예측) | 조건-결과 추론 기능 |
| **Phase 4** | 클라우드 배포 + 기관간 연계 + AI 모델 고도화 | 통합 데이터 허브 |

### 9.2 보안 및 접근 제어

기업 NDA 데이터를 다루므로 다음이 필수적이다:
- **RBAC(Role-Based Access Control)**: 프로젝트별·기관별 데이터 접근 권한 분리
- **감사 로그(Audit Log)**: 누가 어떤 데이터에 언제 접근했는지 기록
- **데이터 암호화**: 저장 시(at-rest) 및 전송 시(in-transit) 암호화
- **익명화 파이프라인**: AI 학습용 데이터에서 기업 식별 정보 제거

### 9.3 외부 DB 동기화 전략

공공 데이터(PDB, UniProt, AlphaFold DB 등)를 참조하는 구조이나, 동기화 전략이 없다:
- **초기 적재**: 전체 다운로드 또는 관심 단백질만 선택적 임포트
- **갱신 주기**: PDB 주간 릴리스, UniProt 월간 릴리스에 맞춘 증분 업데이트
- **ID 매핑 관리**: UniProt accession이 변경(merge/demerge)되는 경우의 처리

### 9.4 데이터 입력 UX 고려

"입력 부담 최소화"가 설계 원칙이나, 이를 실현할 구체적 방안이 필요하다:
- **자동 완성**: 단백질명, 생물종, 벡터 등 반복 입력 필드에 기존 데이터 기반 자동완성
- **서열 기반 자동 계산**: DNA/단백질 서열 입력 시 MW, pI, codon optimization 여부 자동 계산
- **템플릿 복제**: 기존 construct를 복제하여 mutation만 변경하는 기능
- **벌크 임포트**: 엑셀/CSV 일괄 업로드 기능 (기존 연구자 데이터 마이그레이션용)
- **이미지 자동 분류**: SDS-PAGE 겔 이미지, 결정 사진 등 첨부 시 자동 태깅

### 9.5 스키마 보완 상세

| 항목 | 현재 상태 | 보완 권고 |
|------|-----------|-----------|
| `crystallization.precipitant` | TEXT 단일 컬럼 | `precipitant_type` + `precipitant_conc` + `precipitant_unit`으로 분리 |
| `construct` 간 관계 | 독립적 | `parent_construct_id` 자기참조 FK 추가 |
| 복합체(complex) | 미반영 | `complex` 테이블 + `complex_member` 연결 테이블 신설 |
| 리간드/약물 | 미반영 | `ligand` 테이블 (SMILES, InChI, MW 등) 추가 — SBDD 지원에 필수 |
| 실험 프로토콜 | notes에 혼재 | `protocol` 테이블 분리 → 재사용 가능한 프로토콜 관리 |
| 데이터 변경 이력 | 미반영 | audit_log 또는 temporal table 도입 |

---

## 10. 핵심 요약

> KBSI 연구자는 **단백질의 발현 → 정제 → 특성분석 → 결정화 → 구조결정** 전 과정의 실험 데이터(성공·실패 모두)를 체계적으로 기록·관리하는 데이터베이스를 구축하고, 여기에 LLM을 활용한 문헌 데이터 자동 추출·검증 파이프라인을 결합하여, 궁극적으로 **AI/ML 기반 결정화 조건 예측 및 구조기반 신약개발(SBDD)**을 지원하는 통합 데이터 플랫폼을 개발하고자 한다.
>
> **기술적으로 타당하며 연구 임팩트가 높은 프로젝트다.** 특히 실패 데이터의 체계적 축적과 LLM 기반 문헌 추출은 기존 DB(PDB, TargetTrack)와 차별화되는 핵심 가치다. 다만 (1) 듀얼 DB 전략의 단순화, (2) 결정화 조건의 정량화 확장, (3) 리간드/복합체 모델링 추가, (4) 단계별 구현 로드맵 수립이 초기 단계에서 반영되어야 프로젝트의 성공 가능성이 높아진다.
