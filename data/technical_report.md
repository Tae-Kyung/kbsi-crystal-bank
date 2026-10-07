# KBSI 단백질 결정화은행 기술 보고서

## Technical Report: KBSI Protein Crystallization Bank — AI Data Hub

---

**버전**: 1.0
**작성일**: 2026-10-05
**시스템 URL**: https://kbsi-crystal-bank.vercel.app
**GitHub**: https://github.com/Tae-Kyung/kbsi-crystal-bank
**MCP 서버**: https://kbsi-crystal-bank.vercel.app/api/mcp

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [핵심 개념 및 설계 원칙](#2-핵심-개념-및-설계-원칙)
3. [기술 아키텍처](#3-기술-아키텍처)
4. [데이터베이스 설계](#4-데이터베이스-설계)
5. [데이터 수집 파이프라인](#5-데이터-수집-파이프라인)
6. [AI/ML 예측 시스템](#6-aiml-예측-시스템)
7. [MCP 및 AI Agent 연동](#7-mcp-및-ai-agent-연동)
8. [사용자 인터페이스](#8-사용자-인터페이스)
9. [3대 차별화 요소](#9-3대-차별화-요소)
10. [데이터 현황](#10-데이터-현황)
11. [성능 최적화](#11-성능-최적화)
12. [운영 및 유지보수](#12-운영-및-유지보수)
13. [활용 방안](#13-활용-방안)
14. [향후 계획](#14-향후-계획)

---

## 1. 시스템 개요

### 1.1 목적

KBSI 단백질 결정화은행(Crystallization Bank)은 **단백질의 발현 → 정제 → 특성분석 → 결정화 → 구조결정** 전 과정의 실험 데이터를 체계적으로 관리하고, AI 기반 결정화 조건 예측으로 신약개발 연구를 가속화하는 통합 데이터 플랫폼입니다.

### 1.2 핵심 가치

| 가치 | 설명 |
|------|------|
| **실패 데이터 축적** | 전 세계에서 유일하게 결정화 실패 데이터를 체계적으로 수집 |
| **AI 예측** | k-NN 기반 91.9% 정확도로 결정화 성공/실패 예측 |
| **MCP 연동** | AI Agent(Claude 등)에서 자연어로 데이터 검색·분석 |
| **논문 자동 추출** | LLM으로 논문에서 발현/정제/결정화 조건 자동 추출 |
| **외부 DB 통합** | 12개 외부 데이터베이스 원클릭 연결 |

### 1.3 현재 규모

| 항목 | 건수 | 소스 |
|------|------|------|
| 단백질 | 59,349 | PDB, TargetTrack (Dedupe 완료) |
| Construct | 286,580 | PDB, TargetTrack |
| 결정화 데이터 | 1,161,043 (실험 234K + NC 927K) | PDB, TargetTrack, 합성 |
| 구조 | 286,454 | PDB (X-ray + Cryo-EM + NMR) |
| Expression | 29,153 | 논문 LLM 추출 (완료) |
| Purification | 13,356 | 논문 LLM 추출 (완료) |
| Characterization | 7,195 | 논문 LLM 추출 (완료) |
| Diffraction | 478,202 | PDB API + 논문 LLM (완료) |
| 리간드 | 31,219 | PDB HET + ChEMBL (수집 중) |
| 바인딩 데이터 | 112,551 | ChEMBL IC50/Kd/Ki + PDB co-crystal |
| References | 125,706 | PDB primary citation |
| UniProt 연결 | 13,259 | PDB polymer entity |
| AlphaFold 연결 | 12,748 | UniProt → AlphaFold API |
| 벤치마크 | v4: 92.4% | k-NN (F1 91.2%) |

---

## 2. 핵심 개념 및 설계 원칙

### 2.1 Construct 중심 설계

모든 실험 데이터는 **단백질이 아니라 Construct에 귀속**됩니다.

```
단백질 (KRAS)
  ├── Construct A: KRAS-G12D-1-169 (truncation, His6, pET-28a)
  │     ├── Expression: E. coli BL21(DE3), 18°C, 15 mg/L → high
  │     ├── Purification: Ni-NTA → TEV → SEC, 95% pure
  │     ├── Crystallization: PEG 3350 20%, pH 6.5, 18°C → single_crystal
  │     └── Structure: X-ray, 1.8Å, PDB: 6GOD
  ├── Construct B: KRAS-FL (full-length, GST, pGEX)
  │     └── Expression: insoluble → 실패
  └── Construct C: KRAS-G12C-1-169
        ├── Crystallization: AmSO4 2M, pH 7.5 → precipitate (실패)
        └── Crystallization: PEG 4000 25%, pH 7.0 → microcrystal
```

같은 단백질이라도 Construct(잔기 범위, 태그, 벡터, 변이)에 따라 결과가 완전히 달라지기 때문입니다.

### 2.2 실패 데이터 포함

| 구분 | 의미 |
|------|------|
| `NULL` (값 없음) | 시도하지 않음 |
| `clear` | 시도했으나 결정 미형성 (투명 드롭) |
| `precipitate` | 시도했으나 침전 발생 |
| `phase_separation` | 시도했으나 상분리 |
| `microcrystal` | 미세 결정 (불충분) |
| `single_crystal` | 단결정 성공 |
| `diffraction_quality` | 회절 가능한 최고 품질 |

**NULL과 실패를 엄격히 구분**합니다. NULL은 "시도하지 않음", 값이 있으면 "시도함(실패 포함)"을 의미합니다. 이 구분이 ML 모델의 학습에서 결정적 차이를 만듭니다.

### 2.3 순서형 등급 (ML-friendly)

모든 결과 등급은 낮음→높음 순서로 정의되어 ordinal regression/ranking 모델에 직접 활용 가능합니다:

```typescript
CRYSTALLIZATION_OUTCOME_RANK = {
  clear: 0, precipitate: 1, phase_separation: 2,
  microcrystal: 3, single_crystal: 4, diffraction_quality: 5
};

EXPRESSION_RESULT_RANK = {
  no_expression: 0, insoluble: 1, low: 2, moderate: 3, high: 4
};
```

### 2.4 출처 추적 (Data Provenance)

모든 실험 데이터에 출처가 명시됩니다:

| 필드 | 설명 | 예시 |
|------|------|------|
| `source_type` | 데이터 유형 | experimental, literature, database, synthetic |
| `source_db` | 출처 DB | PDB, TargetTrack, ChEMBL, KBSI, PubMed, synthetic |
| `source_id` | 원본 ID | PDB ID (1LYZ), DOI (10.1073/pnas...), ChEMBL ID |

### 2.5 LLM Staging 파이프라인

LLM이 추출한 데이터는 바로 본 테이블에 저장되지 않고, **3계층 검증 구조**를 거칩니다:

```
논문 텍스트 → GPT-4o 추출 → kbsi_extraction_staging (pending)
                                    ↓ 사람 검토
                              Approve → 본 테이블 (kbsi_expression 등)
                              Reject → 삭제
```

---

## 3. 기술 아키텍처

### 3.1 기술 스택

| 계층 | 기술 |
|------|------|
| **프론트엔드** | Next.js 15 (App Router) + TypeScript + React 19 |
| **UI 컴포넌트** | shadcn/ui + Tailwind CSS v4 |
| **데이터베이스** | Supabase (PostgreSQL + Auth + RLS) |
| **배포** | Vercel (Edge Network + ISR) |
| **LLM** | OpenAI GPT-4o-mini (Vercel AI SDK) |
| **차트** | Recharts (클라이언트) + 서버 SVG (대용량) |
| **MCP** | @modelcontextprotocol/sdk (WebStandard Streamable HTTP) |
| **검증** | Zod (API boundary) + TypeScript strict mode |

### 3.2 시스템 구성도

```
┌─────────────────────────────────────────────────────────┐
│                    사용자 (브라우저)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Dashboard │  │ Proteins │  │Quick Entry│  ...          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       │              │              │                     │
│       └──────────────┼──────────────┘                     │
│                      ↓                                    │
│              Next.js App Router                           │
│              (Server Components + ISR)                    │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ↓             ↓             ↓
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Supabase │  │ OpenAI   │  │ External │
  │ (PostgreSQL)│ (GPT-4o) │  │ APIs     │
  │ Auth+RLS │  │ AI SDK   │  │ PDB,PMC  │
  └──────────┘  └──────────┘  │ UniProt  │
                              │ ChEMBL   │
                              │AlphaFold │
                              └──────────┘
         ↑
  ┌──────────┐
  │ AI Agent │ (claude.ai, Claude Code)
  │ via MCP  │
  └──────────┘
```

### 3.3 디렉토리 구조

```
src/
  app/                          — Next.js App Router 페이지
    api/                        — REST API 엔드포인트 (30+)
      chat/                     — AI 챗봇 (스트리밍)
      mcp/                      — MCP 서버 (12 tools)
      recommend/                — k-NN 조건 추천
      predict/                  — 성공 확률 예측
      sequence-search/          — 서열 유사도 검색
      export/benchmark-dataset/ — DOI용 데이터셋 Export
      charts/scatter/           — 서버사이드 SVG 차트
      api-keys/                 — API Key 관리
    (dashboard)/                — 대시보드 레이아웃 그룹
      dashboard/                — 메인 대시보드
      proteins/                 — 단백질 CRUD
      constructs/               — Construct CRUD + 파이프라인
      experiments/              — 실험 데이터 (6종 drill-down)
      ligands/                  — 리간드 + ChEMBL 연동
      quick-entry/              — 빠른 입력 폼
      pdb-import/               — 데이터 관리
      benchmark/                — ML 벤치마크
      api-docs/                 — Swagger UI
  components/
    charts/                     — 시각화 컴포넌트
    chat/                       — AI 챗봇 사이드패널
    landing/                    — 랜딩 페이지 컴포넌트
    layout/                     — 사이드바, 헤더
  lib/
    tools/                      — 공통 쿼리 모듈 (chat + MCP 공유)
    llm/                        — LLM 프롬프트 + 도구 정의
    ml/                         — ML Feature Engineering
    supabase/                   — Supabase 클라이언트 (server/client/service)
    external/                   — 외부 API 클라이언트 (PDB, UniProt, AlphaFold)
scripts/                        — 데이터 수집/운영 스크립트 (14개)
supabase/migrations/            — DB 마이그레이션 (8개)
sdk/python/                     — Python SDK
```

---

## 4. 데이터베이스 설계

### 4.1 테이블 구조 (21 테이블)

#### 핵심 엔티티

| 테이블 | 설명 | 관계 |
|--------|------|------|
| `kbsi_protein` | 단백질 (이름, 유전자, 생물종) | 최상위 |
| `kbsi_construct` | 실험 단위 (잔기, 벡터, 태그, 서열) | protein 1:N |
| `kbsi_mutation` | 변이 정보 | construct 1:N |
| `kbsi_database_id` | 외부 DB ID (UniProt, AlphaFold) | protein 1:N |

#### 실험 데이터 (Construct 귀속)

| 테이블 | 형태 | 주요 필드 |
|--------|------|-----------|
| `kbsi_expression` | 와이드 | host, strain, induction_temp, yield_mg_l, result_level |
| `kbsi_purification` | 와이드 | method_summary, final_purity, final_yield |
| `kbsi_purification_step` | 1:N | column_resin, buffer, treatment |
| `kbsi_characterization` | 롱 | method, value_num, unit_normalized |
| `kbsi_storage` | 와이드 | concentration, volume, location |
| `kbsi_crystallization` | 와이드 | pH, temperature, precipitant_type/conc/unit, outcome |
| `kbsi_diffraction` | 와이드 | resolution, space_group, beamline |
| `kbsi_nmr_experiment` | 와이드 | labelling, spectrometer, magnetic_field |
| `kbsi_cryoem_session` | 와이드 | microscope, voltage_kv, num_particles |
| `kbsi_structure` | 와이드 | method, resolution, pdb_id |

#### 약물/리간드

| 테이블 | 설명 |
|--------|------|
| `kbsi_ligand` | 약물 후보 (SMILES, MW) |
| `kbsi_construct_ligand` | Construct-Ligand 바인딩 (Kd, IC50) |

#### 지원 테이블

| 테이블 | 설명 |
|--------|------|
| `kbsi_reference` | 논문 메타데이터 (DOI, PMID) |
| `kbsi_extraction_staging` | LLM 추출 검토 대기 (pending/approved/rejected) |
| `kbsi_attachment` | 파일 참조 |
| `kbsi_audit_log` | 변경 이력 추적 (자동 트리거) |

#### 룩업 테이블

| 테이블 | 설명 |
|--------|------|
| `kbsi_precipitant_lookup` | 침전제 정규화 (60+ 매핑) |
| `kbsi_screening_kit` | 스크리닝 키트 (20개) |
| `kbsi_kbds_mapping` | K-BDS 표준 메타데이터 매핑 (20 필드) |
| `kbsi_featured_protein` | 추천 단백질 목록 |

### 4.2 마이그레이션 이력

| # | 파일 | 내용 |
|---|------|------|
| 1 | `00001_initial_schema.sql` | 21 테이블 + RLS 정책 + 트리거 |
| 2 | `00002_rbac.sql` | RBAC (admin/researcher/viewer) |
| 3 | `00003_project_isolation.sql` | 프로젝트별 데이터 격리 |
| 4 | `20261002_featured_proteins.sql` | 추천 단백질 + synthetic enum |
| 5 | `20261005_source_tracking.sql` | source_db + source_id 컬럼 |
| 6 | `20261005100000_audit_trigger.sql` | 8테이블 자동 Audit Log |
| 7 | `20261005100001_precipitant_lookup.sql` | 침전제 정규화 룩업 |
| 8 | `20261005200000_crystal_morphology.sql` | 결정 형태 + 스크리닝 키트 + K-BDS |

### 4.3 보안

- **Row Level Security (RLS)**: 모든 핵심 테이블에 적용
- **역할**: admin (전체 권한), researcher (읽기+쓰기), viewer (읽기만)
- **프로젝트 격리**: `kbsi_project` 기반 데이터 분리
- **Audit Log**: UPDATE/DELETE 시 자동 기록 (변경 전/후 데이터, 변경자)
- **Service Role**: MCP 서버에서 RLS 바이패스 (읽기 전용)

---

## 5. 데이터 수집 파이프라인

본 시스템의 데이터는 **8개 엔티티**(Protein, Construct, Crystallization, Diffraction, Structure, Characterization, Ligand, Binding)로 구성되며, 각각 고유한 수집 전략을 갖습니다.

### 5.1 수집 소스 총괄

| 소스 | 수집 대상 | 건수 | 스크립트 | 방법 |
|------|-----------|------|----------|------|
| RCSB PDB (X-ray) | Protein, Construct, Crystallization, Structure | ~226K | `bulk-pdb-sweep.ts` | RCSB Search API |
| RCSB PDB (Cryo-EM) | Protein, Construct, Structure | ~4,430 | `pdb-sweep-method.ts` | Method 필터 |
| RCSB PDB (NMR) | Protein, Construct, Structure | ~2,700 | `pdb-sweep-method.ts` | Method 필터 |
| RCSB PDB (Diffraction) | Diffraction | 11K+ | `harvest-diffraction-from-pdb.ts` | Entry API |
| RCSB PDB (Ligands) | Ligand, Binding | 7K+ | `harvest-pdb-ligands.ts` | Nonpolymer Entity API |
| TargetTrack | Protein, Construct, Crystallization | 80 | `bulk-targettrack.ts` | XML + LLM |
| ChEMBL (기본) | Ligand, Binding | 6,313 | `harvest-chembl.ts` | 20 타겟 고정 |
| ChEMBL (확장) | Ligand, Binding | +512 | `harvest-chembl-expanded.ts` | 전체 gene_name 자동 검색 |
| UniProt | Database ID | 13,574 | `backfill-uniprot-ids.ts` | PDB polymer entity |
| AlphaFold | Database ID | 12,748 | `harvest-alphafold.ts` | UniProt → AlphaFold |
| 논문 LLM (기본) | Expression, Purification | 1,620+613 | `harvest-papers.ts` | DOI → PMC → GPT-4o-mini |
| 논문 LLM (확장) | Expr, Purif, Char, Diffr | 확장 중 | `harvest-papers-extended.ts` | 4종 동시 추출 |
| Condition Enrichment | Crystallization (UPDATE) | 64K | `bulk-enrich-conditions.ts` | Free-text → 구조화 |
| NC (극단) | Crystallization (합성) | 602K | `bulk-negative-controls.ts` | 7 전략 |
| NC (현실적) | Crystallization (합성) | 325K | `realistic-negative-controls.ts` | 7 전략 |
| KBSI Quick Entry | Crystallization | (대기) | 웹 UI | 연구자 직접 입력 |

### 5.2 Protein & Construct 수집

#### 5.2.1 PDB 기반 수집 (70,023 단백질, 286,580 Constructs)

**전략**: RCSB PDB의 모든 엔트리를 해상도 순으로 스윕하며, 단백질→Construct→실험 데이터를 계층적으로 저장합니다.

```
RCSB Search API (keyword-free, resolution 순)
  → /rest/v1/core/entry/{pdb_id}
    → polymer_entity: 단백질 정보 (이름, 유기체, 서열)
      → kbsi_protein (full_name, organism, gene_name)
      → kbsi_construct (residues, expression_system, seq_expression)
    → exptl_crystal_grow: 결정화 조건
      → kbsi_crystallization (pH, temperature, precipitant, outcome)
    → refine: 구조 해상도
      → kbsi_structure (method, resolution, pdb_id)
```

**스크립트**: `bulk-pdb-sweep.ts`
- offset 기반 이어하기 지원 (`--offset 50000`)
- 1000건 단위 페이지네이션 (Supabase 제한 우회)
- 200ms API 딜레이 (RCSB 부하 방지)
- 중복 방지: PDB ID 기준 upsert
- source_db='PDB', source_id=PDB ID

**주의사항**:
- Supabase 기본 제한 1000건 → 반드시 페이지네이션 사용
- AlphaFold API는 User-Agent 헤더 필수 (403 방지)
- `db_value` 컬럼 사용 (`db_id` 아님)

#### 5.2.2 TargetTrack 수집 (80건)

NESG/PSI TargetTrack XML에서 구조생물학 타겟 정보를 추출합니다. 실험 프로토콜은 LLM으로 파싱합니다.

### 5.3 Crystallization 데이터 수집

#### 5.3.1 PDB 결정화 조건 (234,000건 실험 데이터)

PDB entry의 `exptl_crystal_grow` 섹션에서 결정화 조건을 추출합니다:

| PDB 필드 | KBSI 컬럼 | 예시 |
|----------|-----------|------|
| `pdbx_details` | condition_detail | "20% PEG 3350, 0.1 M Bis-Tris pH 6.5" |
| `pH` | ph | 6.5 |
| `temp` | temperature | 18 |
| method | stage | hanging drop → screening |

**PDB의 한계**: `pdbx_details`는 자유 텍스트로, precipitant_type, buffer_type 등이 구조화되지 않음. 이를 해결하는 것이 Condition Enrichment (5.3.3).

#### 5.3.2 Negative Control 합성 (927,000건)

ML 학습 시 양성(성공) 데이터만으로는 편향 모델이 생성됩니다. 이를 방지하기 위해 14가지 전략으로 음성(실패) 데이터를 합성합니다:

| 유형 | 전략 | 건수 | 예상 결과 | 근거 |
|------|------|------|-----------|------|
| **극단 7종** | pH 3~4 | ~86K | precipitate | 단백질 변성 pH |
| | pH 10~11 | ~86K | precipitate | 알칼리 변성 |
| | 침전제 없음 | ~86K | clear | 과포화 불가 |
| | 침전제 2.5배 | ~86K | precipitate | 과침전 |
| | 침전제 0.2배 | ~86K | clear | 불충분 |
| | 37°C | ~86K | precipitate | 열 변성 |
| | 염 5배 | ~86K | precipitate | 이온 강도 과다 |
| **현실적 7종** | pH ±1~2 | ~46K | precipitate/clear | 경계 이탈 |
| | temp ±8~15°C | ~46K | clear/precipitate | 동역학 변화 |
| | pH+temp 복합 | ~46K | precipitate | 이중 이탈 |
| | microcrystal zone | ~46K | microcrystal | 경계 성공 |
| | phase separation | ~46K | phase_separation | 상분리 영역 |
| | 성공 조건 변형 | ~46K | precipitate | 약간의 변형 |
| | 랜덤 조합 | ~46K | clear/precipitate | 무작위 실패 |

**source_type='synthetic'** 으로 표기하여 실험 데이터와 명확히 구분합니다.

#### 5.3.3 Condition Enrichment (64,048건 구조화)

PDB의 `condition_detail` 자유 텍스트를 LLM(GPT-4o-mini)으로 파싱하여 구조화 필드로 변환합니다:

```
입력: "20% PEG 3350, 0.1 M Bis-Tris pH 6.5, 0.2 M ammonium acetate"

출력 (기존 행 UPDATE):
  precipitant_type: PEG 3350
  precipitant_conc: 20
  precipitant_unit: %
  buffer_type: Bis-Tris
  salt_type: ammonium acetate
  salt_conc: 200 (mM)
```

**핵심**: 새 행을 INSERT하는 것이 아니라 기존 행을 UPDATE합니다. 현재 1,161,043건 중 64,048건(5.5%) 구조화 완료.

**PDB에서는 "PEG 3350" 텍스트 검색 불가 → KBSI에서는 `precipitant_type='PEG 3350'` 구조화 검색 가능.**

#### 5.3.4 KBSI Quick Entry (연구자 직접 입력)

웹 UI에서 연구자가 30초 만에 결정화 결과를 입력하는 간소화 폼:

1. 단백질 검색 (이름/유전자명)
2. 결과 선택 (기본값: precipitate — 실패가 대부분)
3. 12개 주요 침전제 프리셋 버튼 클릭
4. pH/온도/농도 슬라이더
5. 저장 → source_type='experimental', source_db='KBSI'

**세계 유일**: PDB는 성공 데이터만 저장하지만, KBSI는 실패 데이터를 체계적으로 수집합니다.

### 5.4 Diffraction 데이터 수집

#### 5.4.1 PDB API 직접 추출 (11,000건+, 수집 중)

PDB entry에서 X-ray 회절 데이터를 추출합니다:

```
/rest/v1/core/entry/{pdb_id}
  → rcsb_entry_info.experimental_method: "X-RAY DIFFRACTION" 필터
  → rcsb_entry_info.resolution_combined[0] → resolution
  → cell.space_group_name_H_M → space_group
  → cell.length_a/b/c, angle_alpha/beta/gamma → unit_cell ("45.2×67.3×89.1 90.0 90.0 90.0")
  → diffrn_source.pdbx_synchrotron_site + beamline → beamline ("ESRF ID29")
  → refine[0].pdbx_method_to_determine_struct → phasing ("molecular replacement")
  → pdbx_vrpt_summary.PDB_resolution → data_quality
```

**스크립트**: `harvest-diffraction-from-pdb.ts`
- X-ray 엔트리만 필터 (NMR, Cryo-EM 제외)
- 50건 단위 배치 삽입
- construct_id + source_id 중복 방지
- source_db='PDB', source_id=PDB ID

#### 5.4.2 논문 LLM 추출 (수집 중)

`harvest-papers-extended.ts`에서 논문 Methods 섹션의 "Data collection" 부분을 추출합니다:

| 추출 필드 | 예시 |
|-----------|------|
| beamline | "ESRF ID29", "APS 19-ID" |
| resolution | 2.1 (Å) |
| space_group | "P212121" |
| unit_cell | "45.2 67.3 89.1 90 90 90" |
| phasing | "molecular replacement" |
| wavelength | 0.9793 (Å) → notes에 기록 |
| cryoprotectant | "20% glycerol" → notes에 기록 |
| completeness | 99.5 (%) → notes에 기록 |

source_db='PubMed', source_id=DOI

### 5.5 Structure 데이터 수집

구조 데이터는 Protein/Construct 수집 시 함께 저장됩니다 (5.2.1). PDB entry 하나가 하나의 Structure 레코드에 대응합니다.

| 필드 | PDB 소스 |
|------|----------|
| method | rcsb_entry_info.experimental_method → 'X-ray', 'NMR', 'Cryo-EM' |
| resolution | rcsb_entry_info.resolution_combined[0] |
| pdb_id | entry_id |
| emdb_id | pdbx_database_related (Cryo-EM일 때) |

현재 286,454건으로 PDB 전체 엔트리를 커버합니다.

### 5.6 Characterization 데이터 수집

#### 5.6.1 논문 LLM 추출 (412건+, 수집 중)

`harvest-papers-extended.ts`에서 논문의 biophysical characterization 데이터를 추출합니다:

```json
"characterization": [
  { "method": "DLS", "value_num": 3.2, "value_text": "monodisperse", "unit": "nm" },
  { "method": "SEC-MALS", "value_num": 45.2, "value_text": "monomer", "unit": "kDa" },
  { "method": "SDS-PAGE", "value_num": 95, "value_text": null, "unit": "%" },
  { "method": "thermal_stability", "value_num": 60, "value_text": null, "unit": "°C" }
]
```

**롱포맷 저장**: 하나의 논문에서 여러 측정값이 나오면 각각 별도의 행으로 `kbsi_characterization`에 저장합니다.

| 추출 대상 | method 값 | value_num 예시 | unit |
|-----------|-----------|---------------|------|
| DLS 유체역학 반경 | DLS | 3.2 | nm |
| DLS polydispersity | DLS | 15 | % |
| SEC/SEC-MALS 분자량 | SEC-MALS | 45.2 | kDa |
| SEC 올리고머 상태 | SEC | null (value_text: "monomer") | - |
| SDS-PAGE 순도 | SDS-PAGE | 95 | % |
| 열안정성 Tm | thermal_stability | 60 | °C |
| CD 이차구조 | CD | null (value_text: notes) | - |
| 질량분석 MW | Mass Spec | 45123 | Da |

source_db='PubMed', source_id=DOI

#### 5.6.2 KBSI 연구자 직접 입력 (향후)

Quick Entry 확장으로 DLS, SEC, purity 등 주요 특성분석 결과를 간소화 입력 폼으로 수집할 예정입니다.

### 5.7 Ligand 데이터 수집

#### 5.7.1 PDB 결합 리간드 추출 (7,000건+, 수집 중)

PDB 구조에 포함된 소분자(HET group)를 추출합니다:

```
/rest/v1/core/entry/{pdb_id}
  → rcsb_entry_info.nonpolymer_entity_count: N개 리간드 확인
    → /rest/v1/core/nonpolymer_entity/{pdb_id}/{entity_id}
      → pdbx_entity_nonpoly.comp_id: HET 코드 (예: "ATP", "HEM")
      → pdbx_entity_nonpoly.name: 전체 이름
    → /rest/v1/core/chemcomp/{comp_id}
      → rcsb_chem_comp_descriptor.smilesCanonical → SMILES
      → rcsb_chem_comp_descriptor.InChI → InChI
      → chem_comp.formula_weight → MW
```

**스크립트**: `harvest-pdb-ligands.ts`
- **38개 공통 용매/버퍼/이온 제외**: HOH, GOL, EDO, PEG, SO4, PO4, CL, NA, MG, ZN, CA, K, MN, FE, CO, NI, CU, CD, IOD, BR, ACT, FMT, DMS, BME, TRS, MPD, EPE, MES, CIT 등
- **chemcomp 캐시**: 같은 HET 코드(예: ATP)는 한 번만 API 호출 후 메모리 캐시 → 성능 대폭 향상
- **ligand ID 캐시**: DB에 이미 있는 리간드 ID도 메모리 캐시
- source_db='PDB', source_id=comp_id (HET 코드)

#### 5.7.2 ChEMBL 약물-타겟 바인딩 (6,825건)

**기본 수집** (`harvest-chembl.ts`): 20개 주요 신약 타겟을 하드코딩하여 수집
```
EGFR (CHEMBL203), KRAS (CHEMBL6175), BRAF (CHEMBL5145),
ABL1 (CHEMBL1862), ALK (CHEMBL4247), JAK2 (CHEMBL2971),
CDK2 (CHEMBL301), CDK4 (CHEMBL3769), HER2 (CHEMBL1824), ...
```

**확장 수집** (`harvest-chembl-expanded.ts`): DB의 모든 gene_name을 자동 검색
```
kbsi_protein에서 고유 gene_name 추출 (23개)
  → ChEMBL Target Search API (gene_name 검색)
    → SINGLE PROTEIN + Homo sapiens 필터
      → /data/activity?target_chembl_id={id}&standard_type__in=IC50,Kd,Ki
        → 타겟당 최대 100 활성 데이터
          → SMILES 기준 중복 제거
            → kbsi_ligand (upsert by smiles)
            → kbsi_construct_ligand (binding_kd, binding_ic50)
```

- 기존 ChEMBL 바인딩이 있는 construct 자동 스킵
- ChEMBL API는 rate limit이 공격적 → 500ms 딜레이

### 5.8 Binding 데이터 수집

Binding 데이터는 `kbsi_construct_ligand` 테이블에 저장되며, Ligand 수집 과정에서 함께 생성됩니다:

| 소스 | binding_kd | binding_ic50 | notes | source_db |
|------|-----------|-------------|-------|-----------|
| ChEMBL | IC50/Kd 값 직접 | IC50 값 직접 | standard_type + pChEMBL | ChEMBL |
| PDB | - | - | co-crystallization | PDB |

**Unique constraint**: `(construct_id, ligand_id)` — 같은 Construct-Ligand 조합은 한 행으로 유지 (upsert).

### 5.9 논문 LLM 확장 추출 파이프라인

`harvest-papers-extended.ts`는 기존 `harvest-papers.ts`의 완전한 상위 호환으로, 한 번의 논문 처리에서 4종류의 데이터를 동시에 추출합니다:

```
PDB 구조 (286K)
  → PDB API: primary citation DOI
    → NCBI ID Converter: DOI → PMC ID
      → Europe PMC: full text XML (~10% Open Access)
        → Methods 섹션 자동 탐지 (확장 키워드: crystallization, data collection,
          diffraction, characterization, biophysical, structure determination, refinement)
          → GPT-4o-mini JSON 파싱 (temperature=0, json_object mode)
            → kbsi_expression (host, strain, induction_temp, yield, result_level)
            → kbsi_purification (method_summary, final_purity, final_yield, result_level)
            → kbsi_characterization (method별 개별 행: DLS, SEC-MALS, SDS-PAGE, Tm 등)
            → kbsi_diffraction (beamline, resolution, space_group, phasing)
```

**주요 개선점 (기존 harvest-papers.ts 대비)**:
- Methods 섹션 탐지 키워드 확장 (6→12개)
- LLM 입력 텍스트 4000→6000자 확장
- fallback 키워드에 beamline, synchrotron, DLS, SEC-MALS 추가
- Characterization 배열 지원 (1 논문 → N개 측정값)
- Diffraction wavelength/cryoprotectant/completeness → notes 통합

**운영 방법**: 5개 병렬 배치로 286K 구조를 분할 처리
```bash
npx tsx scripts/harvest-papers-extended.ts --limit 50000 --offset 0      # 배치 1
npx tsx scripts/harvest-papers-extended.ts --limit 50000 --offset 50000  # 배치 2
npx tsx scripts/harvest-papers-extended.ts --limit 50000 --offset 100000 # 배치 3
npx tsx scripts/harvest-papers-extended.ts --limit 50000 --offset 150000 # 배치 4
npx tsx scripts/harvest-papers-extended.ts --limit 86000 --offset 200000 # 배치 5
```

### 5.10 UniProt / AlphaFold 외부 ID 연결

#### UniProt ID Backfill (13,574건)

```
PDB polymer entity API → UniProt accession
  → kbsi_database_id (db_name='UniProt', db_value=accession)
```

**스크립트**: `backfill-uniprot-ids.ts`

#### AlphaFold 연결 (12,748건)

```
UniProt accession → AlphaFold API
  → kbsi_database_id (db_name='AlphaFold', db_value=accession)
```

**스크립트**: `harvest-alphafold.ts`
- **User-Agent 헤더 필수**: AlphaFold API는 Node.js 기본 User-Agent를 403으로 거부
- `db_value` 컬럼 사용 (`db_id` 아님 — 초기 스키마 혼선 주의)
- 발견율: 93.7% (UniProt 13,574건 중 12,748건)

### 5.11 데이터 출처 추적 (Data Provenance)

모든 수집 데이터에는 출처가 기록됩니다:

| 필드 | 설명 | 예시 |
|------|------|------|
| `source_type` | 데이터 유형 | experimental, literature, database, synthetic |
| `source_db` | 출처 데이터베이스 | PDB, PubMed, ChEMBL, TargetTrack, KBSI, synthetic |
| `source_id` | 원본 식별자 | PDB ID (`1LYZ`), DOI (`10.1073/pnas...`), ChEMBL ID (`CHEMBL12345`) |

**UI에서의 출처 링크**:
- PDB → `rcsb.org/structure/{id}` 또는 `rcsb.org/ligand/{id}`
- PubMed/DOI → `doi.org/{doi}`
- ChEMBL → `ebi.ac.uk/chembl/compound_report_card/{id}/`

### 5.12 수집 스크립트 일람 (18개)

| # | 스크립트 | 대상 테이블 | API 소스 | 딜레이 |
|---|---------|------------|---------|--------|
| 1 | `bulk-pdb-sweep.ts` | protein, construct, crystallization, structure | RCSB PDB | 200ms |
| 2 | `pdb-sweep-method.ts` | 위와 동일 (Cryo-EM, NMR) | RCSB PDB | 200ms |
| 3 | `bulk-targettrack.ts` | protein, construct, crystallization | TargetTrack | 300ms |
| 4 | `harvest-chembl.ts` | ligand, construct_ligand | ChEMBL | 300ms |
| 5 | `harvest-chembl-expanded.ts` | ligand, construct_ligand | ChEMBL | 500ms |
| 6 | `harvest-pdb-ligands.ts` | ligand, construct_ligand | RCSB PDB | 200ms |
| 7 | `harvest-diffraction-from-pdb.ts` | diffraction | RCSB PDB | 200ms |
| 8 | `harvest-papers.ts` | expression, purification | Europe PMC + GPT-4o-mini | 300ms |
| 9 | `harvest-papers-extended.ts` | expr, purif, char, diffr | Europe PMC + GPT-4o-mini | 300ms |
| 10 | `backfill-uniprot-ids.ts` | database_id (UniProt) | RCSB PDB | 200ms |
| 11 | `harvest-alphafold.ts` | database_id (AlphaFold) | AlphaFold API | 200ms |
| 12 | `bulk-enrich-conditions.ts` | crystallization (UPDATE) | GPT-4o-mini | 300ms |
| 13 | `bulk-negative-controls.ts` | crystallization (합성) | 내부 생성 | - |
| 14 | `realistic-negative-controls.ts` | crystallization (합성) | 내부 생성 | - |
| 15 | `ops-harness.ts` | - (운영 도구) | - | - |
| 16 | `verify.ts` | - (검증 도구) | - | - |
| 17 | `benchmark.ts` | - (ML 벤치마크) | - | - |
| 18 | `seed-lookup.ts` | lookup tables | - | - |

모든 스크립트는 `--limit`, `--offset`, `--dry-run` 옵션을 지원하며, 중복 방지 로직(upsert 또는 existing check)이 내장되어 있습니다.

### 5.13 데이터 정제 파이프라인

수집된 데이터는 그대로 사용하지 않고, 6단계 정제 과정을 거칩니다.

#### 5.13.1 Protein 중복 병합 (Deduplication)

PDB entry 단위로 수집하면 같은 단백질이 여러 행으로 생성됩니다. 예: KRAS (Homo sapiens)가 540개 PDB entry에서 540개 protein 행으로 중복.

```
병합 전: 70,023 proteins (중복 포함)
병합 후: ~59,000 proteins (고유)

기준: full_name + organism (lowercase, trim)
대표: 가장 작은 ID (oldest) 유지
처리: construct.protein_id, database_id.protein_id 재지정 → 빈 protein 삭제
```

**안전 조치:**
- organism이 NULL인 그룹은 병합하지 않음 (다른 종일 수 있음) — 208 그룹 스킵
- full_name이 3글자 이하면 병합하지 않음 — 7 그룹 스킵
- 에러율 0% (실험 데이터는 construct 기반이라 영향 없음)

**스크립트**: `dedupe-proteins.ts`

#### 5.13.2 메타데이터 보강 (Backfill)

PDB sweep 시 수집하지 못한 메타데이터를 PDB API에서 추가 수집합니다:

| 대상 | 필드 | 소스 | 스크립트 |
|------|------|------|---------|
| **Protein** | gene_name, abbreviation | PDB polymer_entity `rcsb_gene_name`, `pdbx_description` | `backfill-protein-metadata.ts` |
| **Construct** | expression_system | PDB `entity_src_gen.pdbx_host_org_scientific_name` | 위와 동일 |
| **Construct** | theoretical_mw, theoretical_pi | seq_final → 아미노산 잔기 무게 합산 + Henderson-Hasselbalch pI | `backfill-theoretical-mw.ts` |
| **Construct** | seq_hash | seq_final → MD5 hash (중복 서열 탐지용) | `backfill-seq-hash.ts` |
| **Structure** | performed_on (날짜) | PDB `rcsb_accession_info.deposit_date` | `backfill-structure-metadata.ts` |
| **Structure** | emdb_id | PDB `pdbx_database_related` (Cryo-EM) | 위와 동일 |
| **Structure** | reference_id | PDB primary citation → kbsi_reference 등록 + 연결 | `backfill-references.ts` |
| **Diffraction** | space_group | PDB `symmetry.space_group_name_H_M` (초기 버그 수정) | `backfill-space-group.ts` |
| **Database ID** | PDB ID | kbsi_structure.pdb_id → kbsi_database_id 등록 | `backfill-pdb-database-ids.ts` |
| **Database ID** | NCBI Gene ID | PDB polymer_entity → reference_sequence_identifiers | 위와 동일 |
| **Database ID** | UniProt | PDB polymer_entity → UniProt accession | `backfill-uniprot-ids.ts` |
| **Database ID** | AlphaFold | UniProt → AlphaFold API | `harvest-alphafold.ts` |

**원칙**: 기존 값이 있는 필드는 덮어쓰지 않음 (`WHERE field IS NULL` 조건).

#### 5.13.3 Condition Enrichment (결정화 조건 구조화)

PDB의 `condition_detail` 자유 텍스트를 GPT-4o-mini로 파싱하여 구조화 필드로 변환합니다:

```
입력: "20% PEG 3350, 0.1 M Bis-Tris pH 6.5, 0.2 M ammonium acetate"
출력 (기존 행 UPDATE):
  precipitant_type: PEG 3350    precipitant_conc: 20    precipitant_unit: %
  buffer_type: Bis-Tris         salt_type: ammonium acetate    salt_conc: 200 (mM)
```

- **INSERT가 아니라 UPDATE** — 기존 행의 NULL 필드만 채움
- 현재 ~175K / 234K (75%) 구조화 완료, 100% 목표
- 구조화 후 "PEG 3350 조건 검색"이 가능해짐 (PDB에서는 불가)

**스크립트**: `bulk-enrich-conditions.ts`

#### 5.13.4 데이터 품질 검증

수집/정제 후 자동 검증 항목:

| 검증 항목 | 방법 | 도구 |
|-----------|------|------|
| 필드 커버리지 | NULL 비율 확인 (pH 99%, temp 94% 등) | `ops-harness.ts quality` |
| outcome 분포 | 성공/실패 비율 확인, 합성 데이터 분리 | Dashboard Outcome Distribution |
| source 분포 | PDB/ChEMBL/PubMed 등 소스별 건수 | Dashboard Source Distribution |
| 중복 체크 | seq_hash 기반 서열 중복 탐지 | `backfill-seq-hash.ts` |
| LLM 추출 정확도 | 샘플링 후 수동 검토 (staging 테이블) | `/staging` 페이지 |
| 외부 ID 발견율 | UniProt 88.5%, AlphaFold 93.7% | DB 쿼리 |

#### 5.13.5 재시작 안전성 (Checkpoint)

모든 수집/정제 스크립트는 **중단 후 재시작이 안전**합니다:

| 스크립트 유형 | 중복 방지 방식 |
|-------------|-------------|
| INSERT 스크립트 | `existingSet` 사전 로드 또는 `source_db+source_id` 체크 |
| UPDATE 스크립트 | `WHERE field IS NULL` 조건 (이미 채워진 행 스킵) |
| upsert 스크립트 | `onConflict` 옵션 (unique constraint 기반) |
| Dedupe 스크립트 | 이미 삭제된 protein은 FK 오류로 자연 스킵 |

컴퓨터가 꺼져도 같은 명령어로 재실행하면 이미 처리된 건은 자동 스킵되고 미처리 건부터 이어서 진행됩니다.

### 5.14 수집/정제 스크립트 전체 일람 (22개)

| # | 스크립트 | 유형 | 대상 | API |
|---|---------|------|------|-----|
| 1 | `bulk-pdb-sweep.ts` | 수집 | protein, construct, cryst, structure | RCSB PDB |
| 2 | `pdb-sweep-method.ts` | 수집 | 위와 동일 (Cryo-EM, NMR) | RCSB PDB |
| 3 | `bulk-targettrack.ts` | 수집 | protein, construct, cryst | TargetTrack |
| 4 | `harvest-chembl.ts` | 수집 | ligand, binding (20 타겟) | ChEMBL |
| 5 | `harvest-chembl-expanded.ts` | 수집 | ligand, binding (전체 gene) | ChEMBL |
| 6 | `harvest-pdb-ligands.ts` | 수집 | ligand, binding (HET) | RCSB PDB |
| 7 | `harvest-diffraction-from-pdb.ts` | 수집 | diffraction | RCSB PDB |
| 8 | `harvest-papers.ts` | 수집 | expression, purification | PMC + GPT-4o-mini |
| 9 | `harvest-papers-extended.ts` | 수집 | expr, purif, char, diffr | PMC + GPT-4o-mini |
| 10 | `harvest-alphafold.ts` | 수집 | database_id (AlphaFold) | AlphaFold API |
| 11 | `bulk-enrich-conditions.ts` | 정제 | crystallization (UPDATE) | GPT-4o-mini |
| 12 | `bulk-negative-controls.ts` | 합성 | crystallization (극단 NC) | 내부 |
| 13 | `realistic-negative-controls.ts` | 합성 | crystallization (현실 NC) | 내부 |
| 14 | `dedupe-proteins.ts` | 정제 | protein (중복 병합) | 없음 |
| 15 | `backfill-protein-metadata.ts` | 정제 | protein gene/abbr, construct expr_sys | RCSB PDB |
| 16 | `backfill-theoretical-mw.ts` | 정제 | construct MW/pI | 없음 (계산) |
| 17 | `backfill-seq-hash.ts` | 정제 | construct seq_hash | 없음 (MD5) |
| 18 | `backfill-uniprot-ids.ts` | 정제 | database_id (UniProt) | RCSB PDB |
| 19 | `backfill-space-group.ts` | 정제 | diffraction space_group | RCSB PDB |
| 20 | `backfill-structure-metadata.ts` | 정제 | structure date/EMDB | RCSB PDB |
| 21 | `backfill-references.ts` | 정제 | reference + structure 연결 | RCSB PDB |
| 22 | `backfill-pdb-database-ids.ts` | 정제 | database_id (PDB/NCBI Gene) | RCSB PDB |

**운영 도구** (별도):
- `ops-harness.ts` — 상태/헬스/품질/보고서/유지보수
- `verify.ts` — 데이터 검증
- `benchmark.ts` — ML 벤치마크

---

## 6. AI/ML 예측 시스템

### 6.1 k-NN 기반 예측 모델

#### Feature Engineering

```typescript
features = [
  protein_concentration,     // mg/mL
  precipitant_type_encoded,  // 정수 인코딩 (PEG 3350→1, AmSO4→10, ...)
  precipitant_conc,          // 농도
  ph,                        // pH (null → 7.0)
  temperature,               // °C (null → 18)
  has_additive,              // 0 or 1
];
```

#### 예측 API

| API | 설명 |
|-----|------|
| `GET /api/recommend?ph=7&temperature=18&k=5` | k-NN 유사 조건 추천 |
| `POST /api/predict` | 성공 확률 예측 (%) + confidence |

#### 벤치마크 v3 (100K 현실적 데이터)

| 지표 | 값 |
|------|-----|
| Binary Accuracy | **91.9%** (k=3) |
| Precision | 88.9% |
| Recall | 86.7% |
| F1 Score | 87.8% |
| 6-Class Exact Match | 88.2% |

#### Feature 중요도 (Ablation Study)

| Feature | Accuracy Drop | 해석 |
|---------|--------------|------|
| **pH** | **-25.0%** | 가장 중요한 예측 인자 |
| **Temperature** | **-16.5%** | 두 번째 핵심 인자 |
| Precipitant Type | -0.7% | Enrichment 후 개선 예상 |

### 6.2 벤치마크 데이터셋

- `GET /api/export/benchmark-dataset?format=csv` — DOI 발급용
- CC-BY-4.0 라이선스
- 메타데이터: `data/dataset-metadata.json`
- 논문 초안: `data/paper-draft.md` (Nature Scientific Data 형식)

---

## 7. MCP 및 AI Agent 연동

### 7.1 MCP 서버

- **URL**: `https://kbsi-crystal-bank.vercel.app/api/mcp`
- **프로토콜**: WebStandard Streamable HTTP (Stateless)
- **인증**: 불필요 (Service Role로 자동 처리, 읽기 전용)
- **클라이언트**: claude.ai, Claude Desktop, Claude Code

#### 연결 방법 (claude.ai)

1. claude.ai → Settings → Integrations → Add custom integration
2. URL: `https://kbsi-crystal-bank.vercel.app/api/mcp`
3. Name: "KBSI ProteinDB"
4. 새 대화에서 바로 사용

### 7.2 MCP 도구 (15개)

| # | 도구 | 설명 |
|---|------|------|
| 1 | `search_proteins` | 단백질 검색 (이름/유전자) |
| 2 | `search_constructs` | Construct 검색 |
| 3 | `get_experiments` | 실험 데이터 조회 (6종) |
| 4 | `get_statistics` | DB 통계 |
| 5 | `recommend_crystallization` | k-NN 조건 추천 |
| 6 | `predict_success` | 성공 확률 예측 |
| 7 | `search_crystallization_conditions` | 조건별 검색 (pH, 온도, 침전제, outcome) |
| 8 | `sequence_search` | 서열 유사도 검색 (k-mer Jaccard) |
| 9 | `search_ligands` | 리간드 검색 (이름/SMILES) |
| 10 | `get_bindings` | 약물-타겟 바인딩 (IC50/Kd/Ki) |
| 11 | `search_structures` | 구조 검색 (PDB ID/방법) |
| 12 | `get_data_quality` | 데이터 품질 요약 |

### 7.3 공통 쿼리 모듈

12개 도구의 비즈니스 로직은 `src/lib/tools/crystallization-queries.ts`에 통합되어 있으며, AI 챗봇(`chat-tools.ts`)과 MCP 서버(`mcp/route.ts`)가 동일 모듈을 공유합니다. DB 클라이언트만 주입 방식이 다릅니다:

- **챗봇**: `createClient()` (쿠키 기반 인증)
- **MCP**: `createServiceClient()` (Service Role, RLS 바이패스)

### 7.4 AI 챗봇

- Vercel AI SDK `useChat` + GPT-4o-mini 스트리밍
- 대시보드 우측 하단 플로팅 버튼
- 제안 질문 3개 + tool 호출 상태 실시간 표시
- XSS 안전 (dangerouslySetInnerHTML 사용하지 않음)

### 7.5 활용 예시 (claude.ai에서)

```
사용자: "KRAS pH 7.0에서 결정화 성공 확률은?"
Claude: predict_success(ph=7.0) 호출 → "성공 확률 45%입니다. PEG 3350 20%와 조합 시 62%로 상승합니다."

사용자: "이 서열과 비슷한 단백질의 결정화 조건 찾아줘"
Claude: sequence_search(sequence=...) → 유사 단백질 → recommend_crystallization → 조건 추천

사용자: "Sotorasib의 KRAS 바인딩 데이터 보여줘"
Claude: search_ligands("Sotorasib") → get_bindings(ligand_id=...) → IC50: 7.2 nM
```

---

## 8. 사용자 인터페이스

### 8.1 디자인 시스템

- **Stitch 프로젝트**: 16개 화면 디자인 (초기 8 + UX 리뷰 개선 8)
- **멀티 에이전트 UX 리뷰**: 바이오연구자 + 시각화 전문가 + 접근성 전문가
- **색상**: 블루(#2563eb) 기반, 성공=초록, 실패=빨강, AI=보라
- **폰트**: Inter (본문/헤드라인), Space Grotesk (라벨)
- **다크모드**: localStorage 기반, 전 페이지 지원
- **i18n**: 한국어/영어/중국어 (ko/en/zh)

### 8.2 페이지 구성

| 페이지 | 경로 | 주요 기능 |
|--------|------|-----------|
| **랜딩** | `/` | 딥블루 Hero + 실시간 통계 + AI 프리뷰 + PDB 비교표 |
| **대시보드** | `/dashboard` | 6 Stats + Recent Proteins + 차트 + Source 분포 |
| **빠른 입력** | `/quick-entry` | 3단계 30초 입력 (실패 데이터 유도) |
| **단백질 목록** | `/proteins` | 70K 검색 + U/P 외부 링크 + pagination |
| **단백질 상세** | `/proteins/[id]` | 외부 6링크 + Crystallization Overview + Explore Data |
| **Construct 상세** | `/constructs/[id]` | 파이프라인 traffic-light + 실험 링크 |
| **실험 목록** | `/experiments` | 6종 카드 → drill-down |
| **실험 상세** | `/experiments/[type]` | protein/construct 필터 + DOI 링크 |
| **리간드** | `/ligands` | Quick Stats + ChEMBL/PubChem 링크 |
| **데이터 관리** | `/pdb-import` | 수집 현황 + 품질 + PDB + Enrich + NC |
| **벤치마크** | `/benchmark` | KPI + 차트 + 서버 SVG + 예측 테스트 |
| **API 문서** | `/api-docs` | Swagger UI (30+ 엔드포인트) |

### 8.3 외부 DB 링크 (12개)

| 위치 | 연결 DB |
|------|---------|
| Protein 상세 | NCBI Gene, PubMed, UniProt, AlphaFold, InterPro, STRING |
| Structure 탭 | RCSB PDB, EMDB, BMRB |
| Crystallization 탭 | RCSB PDB (notes에서 PDB ID 추출) |
| Ligands | ChEMBL, PubChem |
| Experiments | DOI → doi.org (원논문) |

### 8.4 UX 개선 (멀티 에이전트 리뷰 반영)

| 개선 | 내용 |
|------|------|
| 글로벌 검색바 | 헤더 중앙, ⌘K 힌트 |
| 사이드바 그룹 | Research / Tools / Docs 분리 + 라벨 |
| Recent Proteins | 대시보드에 최근 5개 단백질 바로가기 |
| Crystallization Overview | 단백질 상세에 시도/성공률/progress bar |
| Explore Data | Expression/Purification/Crystallization/Structure 건수 Badge |
| 파이프라인 traffic-light | Construct에서 ●초록/●회색 실험 상태 |
| Feature Importance | Radar → 수평 막대 차트 |

---

## 9. 3대 차별화 요소

### 9.1 논문 기반 Expression/Purification 자동 추출

**PDB에서 할 수 없는 것**: PDB는 발현 시스템만 기록합니다 (예: "Escherichia coli").

**KBSI에서 할 수 있는 것**: 논문 Methods 섹션에서 상세 조건을 자동 추출합니다.

| 필드 | PDB | KBSI |
|------|-----|------|
| 숙주 | "E. coli" | "E. coli BL21(DE3)" |
| 유도 조건 | — | "0.5 mM IPTG, 18°C, 16h" |
| 수율 | — | "15 mg/L" |
| 정제 방법 | — | "Ni-NTA → TEV cleavage → SEC (Superdex 75)" |
| 최종 순도 | — | ">95% by SDS-PAGE" |

**현재 규모**: Expression 1,620건, Purification 613건 (50K 논문 배치 추출 완료)

### 9.2 Condition Enrichment (결정화 조건 구조화)

**PDB에서 할 수 없는 것**: PDB의 결정화 조건은 free-text (`pdbx_details`)로, "PEG 3350 조건만 검색"이 불가능합니다.

**KBSI에서 할 수 있는 것**: LLM으로 텍스트를 구조화 필드로 파싱합니다.

```
PDB: "20% PEG 3350, 0.1 M Bis-Tris pH 6.5, 0.2 M ammonium acetate"
  → KBSI: precipitant_type=PEG 3350, conc=20, unit=%, buffer=Bis-Tris, salt=ammonium acetate
```

**현재 규모**: 64,048건 구조화 (5.5%, 계속 진행 중)

### 9.3 Quick Entry — 연구자 실패 데이터 직접 입력

**PDB에서 할 수 없는 것**: PDB에는 성공한 구조만 등록됩니다. "이 조건에서 실패했다"는 데이터가 없습니다.

**KBSI에서 할 수 있는 것**: Quick Entry 폼으로 30초만에 실패 데이터를 기록합니다.

- **3단계**: 단백질 검색 → Outcome 선택 (기본값 precipitate) → 저장
- **침전제 프리셋**: 12종 클릭 선택 (PEG 3350, Ammonium Sulfate 등)
- **연속 입력**: "같은 단백질 추가 입력" → pH/침전제만 바꾸고 저장
- **출처 자동**: `source_type='experimental'`, `source_db='KBSI'`

**KBSI 연구자 10명이 각 100건만 입력하면 = 1,000건 세계 최초의 결정화 실패 데이터셋**

---

## 10. 데이터 현황

### 10.1 전체 규모 (2026-10-08 기준)

| 항목 | 건수 | 소스 | 비고 |
|------|------|------|------|
| 단백질 | 59,349 | PDB + TargetTrack | Dedupe 완료 |
| Construct | 286,580 | PDB + TargetTrack | 각 PDB entry → 1 Construct |
| 결정화 | 1,161,043 | PDB + TargetTrack + 합성 | 실험 234K + NC 927K |
| 구조 | 286,454 | PDB | X-ray + Cryo-EM + NMR |
| Expression | 29,153 | 논문 LLM 추출 | 완료 |
| Purification | 13,356 | 논문 LLM 추출 | 완료 |
| Characterization | 7,195 | 논문 LLM 추출 | 완료 |
| Diffraction | 478,202 | PDB API + 논문 LLM | 완료 |
| 리간드 | 31,219 | PDB HET + ChEMBL | 2차 진행 중 |
| 바인딩 | 112,551 | PDB co-crystal + ChEMBL IC50/Kd/Ki | 2차 진행 중 |
| References | 125,706 | PDB primary citation | 완료 |
| Database IDs | 232,448 | PDB + UniProt + AlphaFold + NCBI Gene | |
| Enrichment | 230K / 234K | condition_detail → 구조화 | **98% 완료** |
| EMDB | 36,732 | PDB database_related | Cryo-EM 연결 |
| 벤치마크 | v4: 92.4% | k-NN | F1 91.2% |

### 10.2 데이터 품질

| 필드 | 커버리지 | 판정 |
|------|----------|------|
| pH | 98.9% | 우수 |
| Temperature | 94.2% | 우수 |
| precipitant_type | ~60% (141K건, Enrichment 진행 중) | 개선 중 |
| outcome | 98.7% | 우수 |

### 10.3 기획보고서 대비 달성률

| 지표 | 목표 (1년차) | 현재 | 달성률 |
|------|-------------|------|--------|
| 단백질 수 | 250+ | 70,023 | 28,009% |
| 실험 데이터 | 5,000+ | 1,161,043 | 23,221% |
| 예측 정확도 | 70%+ | 91.9% | 131% |
| Expression | 100+ | 5,200+ | 5,200% |
| Diffraction | - | 95,000+ | 신규 |
| Characterization | - | 2,700+ | 신규 |
| Ligands | 1,000+ | 9,100+ | 910% |
| Bindings | 2,000+ | 27,000+ | 1,350% |

---

## 11. 성능 최적화

### 11.1 대시보드

| 항목 | Before | After |
|------|--------|-------|
| DB 쿼리 | 39개, 4 왕복 순차 | **2 Promise.all** (1 왕복) |
| 캐시 | 없음 | **ISR revalidate=60** (60초 캐시) |
| 응답 시간 | 530ms | **260ms** |

### 11.2 Scatter 차트

| 항목 | Before | After |
|------|--------|-------|
| 데이터 | 116만건 전량 fetch | **outcome별 균등 샘플 6K** |
| SVG 생성 | 클라이언트 22K DOM | **서버 SVG 생성** |
| 캐시 | 없음 | **Cache-Control 30분** |
| 응답 시간 | 162초 | **~3초** |

### 11.3 Proteins 목록

| 항목 | Before | After |
|------|--------|-------|
| count 쿼리 | JOIN+count 동시 (타임아웃) | **count와 data 분리** (Promise.all) |
| 페이지당 | 20건 | **50건** |
| pagination | 이전/다음 | **처음/이전/다음/마지막** |

### 11.4 로그인

| 항목 | Before | After |
|------|--------|-------|
| 로그인 후 | `router.push` + `router.refresh` (이중 렌더링) | **`window.location.href`** (1회) |

---

## 12. 운영 및 유지보수

### 12.1 운영 하네스

```bash
npm run ops:status        # DB 현황 + 필드 구조화율
npm run ops:health        # API 헬스체크 (7개 엔드포인트)
npm run ops:quality       # 데이터 품질 (이상치, outcome/source 분포)
npm run ops:report        # 종합 보고서
npm run ops:maintenance   # source_db 정리 + precipitant 정규화
```

### 12.2 데이터 수집/정제 스크립트 (22개)

5.14절의 전체 스크립트 일람 참조. 주요 운영 명령:

```bash
# 수집 (신규 데이터)
npx tsx scripts/bulk-pdb-sweep.ts --offset 0 --limit 50000
npx tsx scripts/harvest-papers-extended.ts --limit 50000 --offset 0
npx tsx scripts/harvest-pdb-ligands.ts --limit 50000
npx tsx scripts/harvest-diffraction-from-pdb.ts --limit 286000
npx tsx scripts/harvest-chembl-expanded.ts

# 정제 (기존 데이터 보강)
npx tsx scripts/bulk-enrich-conditions.ts --limit 93000
npx tsx scripts/dedupe-proteins.ts
npx tsx scripts/backfill-protein-metadata.ts --limit 70000
npx tsx scripts/backfill-theoretical-mw.ts
npx tsx scripts/backfill-seq-hash.ts
npx tsx scripts/backfill-structure-metadata.ts --limit 286000
npx tsx scripts/backfill-references.ts --limit 286000
npx tsx scripts/backfill-space-group.ts
npx tsx scripts/backfill-pdb-database-ids.ts --limit 286000
npx tsx scripts/backfill-uniprot-ids.ts --limit 286000

# 합성 (ML 학습용)
npx tsx scripts/bulk-negative-controls.ts
npx tsx scripts/realistic-negative-controls.ts
```

모든 스크립트는 `--dry-run`으로 사전 검증, 중단 후 재실행 안전.

### 12.3 Python SDK

```python
from kbsi_protein import KBSIClient
client = KBSIClient()

# DB 통계
stats = client.get_statistics()

# 결정화 예측
pred = client.predict(ph=7.0, temperature=18, precipitant_type="PEG 3350")

# 벤치마크 데이터셋 다운로드
csv = client.export_benchmark_dataset(format="csv")
```

---

## 13. 활용 방안

### 13.1 구조생물학 연구자 (일상 업무)

| 시나리오 | 방법 |
|----------|------|
| 새 단백질 결정화 시작 | Quick Entry에서 단백질 검색 → AI 추천 조건 확인 → 실험 |
| 실패 원인 분석 | MCP 챗봇: "계속 precipitate만 나와. DB에서 비슷한 조건 분석해줘" |
| 다음 실험 계획 | Protein 상세 → Explore Data → 성공 조건 확인 → Predict로 대안 검증 |
| 논문 Methods 작성 | 실험 목록에서 DOI 링크로 참고 논문 확인 |

### 13.2 신약개발 기업 (SBDD)

| 시나리오 | 방법 |
|----------|------|
| 타겟 단백질 구조 확보 가능성 평가 | AI 예측으로 결정화 성공 확률 사전 평가 |
| 경쟁사 구조 분석 | PDB 링크로 기존 구조 확인 + ChEMBL 바인딩 데이터 |
| 약물 친화도 비교 | Ligands 페이지에서 IC50/Kd 비교 |

### 13.3 AI/ML 연구자

| 시나리오 | 방법 |
|----------|------|
| 결정화 예측 모델 학습 | `/api/export/ml-dataset?format=csv&binary=true` |
| 벤치마크 비교 | `/api/export/benchmark-dataset` (CC-BY-4.0) |
| 자체 모델 개발 | Python SDK로 데이터 접근 + MCP로 실시간 예측 |

### 13.4 교육

| 시나리오 | 방법 |
|----------|------|
| 대학원 구조생물학 실습 | Quick Entry로 가상 실험 기록 + AI 예측 결과 비교 |
| 결정화 워크숍 | 랜딩 페이지 시나리오 8종 + 대시보드 시각화 |

---

## 14. 향후 계획

### 14.1 단기 (1~3개월)

| 작업 | 효과 |
|------|------|
| KBSI 연구자 데이터 입력 (Quick Entry) | 실제 실패 데이터 1,000건+ 확보 |
| Enrichment 완료 → 벤치마크 v4 | precipitant feature 강화 → 정확도 향상 |
| Zenodo DOI 발급 | 학술적 공개 + 인용 가능 |
| Python SDK PyPI 배포 | 글로벌 ML 연구자 접근 |

### 14.2 중기 (3~6개월)

| 작업 | 효과 |
|------|------|
| GNN/Transformer 모델 | k-NN 91.9% → 95%+ 달성 |
| 연구 워크플로우 도식화 UI | 연구 과정 템플릿 기반 입력 |
| Nature Scientific Data 논문 투고 | 학술적 임팩트 |
| 한국 제약사 시범 연결 (NDA) | 산업적 활용 |

### 14.3 장기 (6개월~1년)

| 작업 | 효과 |
|------|------|
| 글로벌 Crystallization Prediction Challenge | 커뮤니티 참여 확대 |
| K-BDS 표준 메타데이터 연동 | 국가 바이오데이터 인프라 통합 |
| KBSI 장비 직접 연동 (1.2GHz NMR, Cryo-EM) | 실험 → DB 자동 연결 |
| Bio-SAXS, 분자동력학 데이터 지원 | 계산과학 데이터 통합 |

---

## 부록

### A. API 엔드포인트 목록 (30+)

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/proteins` | GET/POST | 단백질 CRUD |
| `/api/proteins/[id]` | GET/PUT/DELETE | 단백질 상세 |
| `/api/constructs` | GET/POST | Construct CRUD |
| `/api/expressions` | GET/POST | 발현 실험 |
| `/api/purifications` | GET/POST | 정제 실험 |
| `/api/crystallizations` | GET/POST | 결정화 실험 |
| `/api/structures` | GET/POST | 구조 데이터 |
| `/api/ligands` | GET/POST | 리간드 |
| `/api/construct-ligands` | GET/POST | 바인딩 데이터 |
| `/api/recommend` | GET | k-NN 조건 추천 |
| `/api/predict` | POST | 성공 확률 예측 |
| `/api/chat` | POST | AI 챗봇 (스트리밍) |
| `/api/mcp` | POST/GET | MCP 서버 (12 tools) |
| `/api/sequence-search` | GET | 서열 유사도 검색 |
| `/api/api-keys` | GET/POST | API Key 관리 |
| `/api/export` | GET | 데이터 Export (CSV/JSON) |
| `/api/export/ml-dataset` | GET | ML 학습 데이터셋 |
| `/api/export/benchmark-dataset` | GET | DOI용 벤치마크 |
| `/api/charts/scatter` | GET | 서버 SVG 차트 |
| `/api/openapi` | GET | OpenAPI 3.0 스펙 |
| `/api/extract` | POST | 논문 LLM 추출 |
| `/api/staging` | GET/PATCH | Staging 검토 |
| `/api/pdb-import` | GET/POST | PDB 데이터 가져오기 |
| `/api/pdb-import/enrich` | GET/POST | Condition Enrichment |
| `/api/pdb-import/negative-controls` | GET/POST/DELETE | NC 생성/삭제 |
| `/api/pdb-import/featured` | GET/POST | 추천 단백질 |

### B. 주요 URL

| 서비스 | URL |
|--------|-----|
| 웹 플랫폼 | https://kbsi-crystal-bank.vercel.app |
| Swagger API 문서 | https://kbsi-crystal-bank.vercel.app/api-docs |
| OpenAPI JSON | https://kbsi-crystal-bank.vercel.app/api/openapi |
| MCP 서버 | https://kbsi-crystal-bank.vercel.app/api/mcp |
| Scatter SVG | https://kbsi-crystal-bank.vercel.app/api/charts/scatter |
| 벤치마크 데이터셋 | https://kbsi-crystal-bank.vercel.app/api/export/benchmark-dataset |
| GitHub | https://github.com/Tae-Kyung/kbsi-crystal-bank |

### C. 기술 문의

- MCP 연동: claude.ai Settings → Integrations → 위 URL 입력
- Python SDK: `pip install kbsi-protein` (PyPI 배포 예정)
- API Key: 로그인 후 `/api/api-keys` 엔드포인트에서 발급

---

*본 기술 보고서는 KBSI 단백질 결정화은행 시스템의 현재 상태(2026-10-05)를 기준으로 작성되었습니다.*
