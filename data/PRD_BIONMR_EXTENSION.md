# PRD: BioNMR 연구그룹 연계 시스템 고도화 방안

## 이동한 박사팀 (BioNMR Lab) 연구성과 및 관심분야 정리

> 작성일: 2026-10-15
> 목적: KBSI 이동한 박사 BioNMR 연구그룹의 연구역량과 결정화은행 시스템의 시너지 분석 및 고도화 방안 도출

---

## 1. 이동한 박사팀 프로필

| 항목 | 내용 |
|------|------|
| 소속 | KBSI 단백질구조약물기전연구센터 / NMR-Biophysics 연구유닛 |
| 겸임 | UST (과학기술연합대학원대학교) 교수 |
| 연구실 | BioNMR Lab (bionmr.org) |
| 핵심 장비 | **1.2 GHz NMR** (Bruker Avance, 2024 설치 — 아시아 최초, 세계 10번째) |
| 슬로건 | "Life, in motion" — 단백질 동역학 중심 연구 |

---

## 2. 핵심 연구 분야

### 2.1 단백질 동역학 (Protein Dynamics)

이동한 박사팀의 가장 핵심적인 연구 분야. NMR relaxation dispersion, CEST(Chemical Exchange Saturation Transfer) 기법을 활용하여 **"보이지 않는(invisible)" 단백질 들뜬 상태(excited states)**를 관측.

**대표 성과:**
- **p53 N-terminal 구조 동역학** — "Hierarchical multi-timescale structural dynamics of the disordered N-terminal of p53" (Nature Communications, 2026)
  - 내인성 무질서 단백질(IDP) p53-TAD의 다중 시간 스케일 구조 동역학 규명
  - NMR + 비편향 원자론적 시뮬레이션 결합
- **Ubiquitin 분자 인식 메커니즘** — 약한 장거리 상관운동(weak long-range correlated motions)이 분자 인식에 관여 (182회 인용)
- **NMR relaxation interference** — 효과적 회전 상관 시간 측정법 (314회 인용, 최다 피인용 논문)
- **Transient binding 분류** — "A litmus test for classifying recognition mechanisms of transiently binding proteins" (Nature Communications, 2022)

**핵심 기법:**
- Relaxation dispersion (R₂ dispersion, CPMG)
- CEST (Chemical Exchange Saturation Transfer)
- ¹⁵N/¹³C 표지 기반 다핵 NMR
- 1.2 GHz 초고자장 NMR

### 2.2 AI + NMR 융합

**대표 성과:**
- **Deep Learning NMR 신호 분석** — "A robust, deep learning-based analysis of time-domain signals for NMR spectroscopy" (Journal of Analytical Science and Technology, 2025)
  - 신경망을 이용한 NMR time-domain 신호의 자동화된 분석
  - 복잡한 NMR 스펙트럼에서 AI 기반 자동 피크 검출/할당
- **ONEST 플랫폼** — "ONEST: a web-based platform for the rapid and robust analysis of protein excited states through CEST spectroscopy" (Bioinformatics, 2026)
  - CEST NMR 데이터의 웹 기반 자동 분석 플랫폼
  - 들뜬 상태 단백질 분석의 계산 비용 문제 해결
- **NMR + ML 구조 앙상블 예측** — NMR chemical shift 기반 단백질 구조 앙상블 최적화 시스템 (특허 출원, 2025)
- **Invisible excited state 구조 가시화** — "Making invisible excited state protein structures visible by combining NMR and machine learning" (bioRxiv preprint, 2025)

### 2.3 구조 기반 신약개발 (SBDD)

**타겟 단백질:**
- **PTP4A3 (PRL-3)** — 암 관련 인산화효소. FDA 승인약물 라이브러리에서 NMR 기반 억제제 스크리닝
- **BLVRB** — 빌리루빈 환원효소. AI 가상 스크리닝 + NMR 검증으로 소분자 억제제 발견
- **p53-MDM2/MDMX** — 종양 억제 단백질. IDP 상호작용 메커니즘 규명
- **Tau 단백질** — Tau-tubulin 상호작용에서 Methylene Blue의 이황화 결합 유도 메커니즘 (JACS Au, 2024)

**접근법:**
1. AI 가상 스크리닝 → 후보 화합물 선별
2. NMR 기반 실험적 검증 (화학적 이동 교란, STD-NMR 등)
3. 약물-타겟 결합 메커니즘 규명 (MOA, 물리적 약물 기전 분석)
4. 구조 최적화 → 리드 화합물 도출

### 2.4 내인성 무질서 단백질 (IDP) 연구

기존 X-ray 결정학으로는 관측 불가능한 IDP의 구조/동역학을 NMR로 규명:
- p53 N-terminal (TAD domain)
- Tau 단백질 (알츠하이머 관련)
- Aβ (아밀로이드 베타)
- TDP-43 (ALS 관련)

### 2.5 1.2 GHz 초고자장 NMR 활용

2024년 설치된 1.2 GHz NMR의 활용 분야:
- **In-cell NMR** — 세포 내 단백질 구조/동역학 관측
- **IDP 고해상도 분석** — 초고자장에서 향상된 감도/분해능
- **약물-표적 결합** — 미세한 결합 변화 감지
- **실시간 단백질 접힘** — 구조 재배열 과정 관찰

---

## 3. BioNMR × 결정화은행 시너지 분석

### 3.1 데이터 보완 관계

```
BioNMR Lab (이동한 박사팀)          결정화은행 (현재 시스템)
──────────────────────              ─────────────────────
NMR 구조 (용액상)         ←→       X-ray 결정 구조 (고체상)
단백질 동역학             ←→       결정화 조건 1.16M건
IDP 앙상블               ←→       ESM-2 임베딩 284K
약물 결합 메커니즘        ←→       Ligand/Binding 520K
단백질 안정성/접힘        ←→       Characterization 7.2K (Tm, DLS)
AI NMR 분석              ←→       AI 예측/Copilot
```

### 3.2 상호 강화 포인트

| # | 결정화은행 → BioNMR | BioNMR → 결정화은행 |
|---|---------------------|---------------------|
| 1 | ESM-2 유사 서열 검색으로 NMR 타겟 선정 가속 | NMR 동역학 데이터로 결정화 난이도 예측 보강 |
| 2 | 결정화 조건 DB로 NMR 샘플 버퍼 최적화 참고 | IDP 여부 판별 → "결정화 불가" 사전 경고 |
| 3 | Ligand/Binding DB로 약물 스크리닝 타겟 목록 | 약물 결합 Kd/kon/koff → Binding DB 확장 |
| 4 | XGBoost 성공 예측 → NMR/X-ray 방법 선택 지원 | NMR chemical shift → 단백질 상태 annotation |

---

## 4. 시스템 고도화 방안

### Phase N1: NMR 데이터 통합 (단기, 1-2개월)

#### N1-1. NMR 구조 데이터 수집 파이프라인

현재 결정화은행은 X-ray 결정학 데이터만 포함. NMR로 결정된 구조(PDB method = "SOLUTION NMR")를 통합.

**구현 내용:**
- PDB에서 NMR 구조 수집 (약 13,000건, 전체 PDB의 ~7%)
- `kbsi_structure` 테이블에 `method` 컬럼 활용 (이미 존재)
- NMR 특유 메타데이터: `nmr_conformer_count`, `nmr_restraints`, `chemical_shift_completeness`
- BMRB (Biological Magnetic Resonance Bank) 연결 — chemical shift 데이터

**DB 확장:**
```sql
-- kbsi_structure에 NMR 관련 필드 추가
ALTER TABLE kbsi_structure ADD COLUMN nmr_conformer_count INTEGER;
ALTER TABLE kbsi_structure ADD COLUMN bmrb_id VARCHAR(20);

-- NMR 제약 조건 테이블
CREATE TABLE kbsi_nmr_restraint (
  id SERIAL PRIMARY KEY,
  structure_id INTEGER REFERENCES kbsi_structure(id),
  restraint_type VARCHAR(50),  -- 'NOE', 'dihedral', 'RDC', 'hydrogen_bond'
  restraint_count INTEGER,
  completeness NUMERIC(5,2)
);

-- Chemical shift 테이블
CREATE TABLE kbsi_chemical_shift (
  id SERIAL PRIMARY KEY,
  structure_id INTEGER REFERENCES kbsi_structure(id),
  bmrb_id VARCHAR(20),
  nucleus VARCHAR(10),  -- '1H', '13C', '15N'
  assignment_count INTEGER,
  completeness NUMERIC(5,2)
);
```

**MCP 도구 확장:**
- `search_nmr_structures` — NMR 구조 검색 (method, restraints, BMRB 연결)
- `get_nmr_details` — 특정 구조의 NMR 상세 정보

#### N1-2. 방법론 비교 대시보드

동일 단백질에 대해 X-ray와 NMR 양쪽 구조가 있는 경우 비교:
- 같은 단백질의 X-ray resolution vs NMR conformer 수 비교
- 구조 결정 방법 선택 가이드: MW, IDP 비율, 발현 수율 기반

### Phase N2: 단백질 동역학 예측 모듈 (단기, 2-3개월)

#### N2-1. Disorder/Flexibility 예측 통합

이동한 박사팀의 IDP 연구와 직접 연결되는 기능:

**구현 내용:**
- ESM-2 임베딩에서 per-residue flexibility score 추출
- IDP 비율 계산 → Crystallizability Score에 반영
- Disorder region → "이 영역을 truncation하면 결정화 성공률 향상" 자동 추천

**활용:**
```
사용자: KRAS 서열 입력
Copilot 결과:
  결정화 성공 확률: 94.1%
  Disorder 비율: 12% (N-terminal 1-15, C-terminal 170-189)
  추천: "C-terminal flexible tail 삭제 시 확률 97%로 향상"
  NMR 적합성: "Disorder region 연구에는 NMR 권장 (1.2 GHz 가용)"
```

#### N2-2. 방법론 추천 엔진 (X-ray vs NMR vs Cryo-EM)

단백질 특성에 따라 최적 구조결정 방법을 추천:

| 판단 기준 | X-ray 결정학 | NMR | Cryo-EM |
|-----------|-------------|-----|---------|
| MW | < 150 kDa | **< 40 kDa** | > 100 kDa |
| IDP 비율 | < 20% | **> 30%** | < 30% |
| 결정화 성공 예측 | > 60% | < 40% | any |
| 약물 결합 동역학 | 정적 구조 | **동적 관찰** | 정적 구조 |
| 시료량 | mg | **mg (¹⁵N 표지)** | μg |
| 해상도 | 1-3 Å | 주로 앙상블 | 2-4 Å |

```python
def recommend_method(mw, disorder_ratio, cryst_score, need_dynamics):
    scores = {'xray': 0, 'nmr': 0, 'cryoem': 0}

    if mw < 40000:
        scores['nmr'] += 3
    if mw < 150000:
        scores['xray'] += 2
    if mw > 100000:
        scores['cryoem'] += 3

    if disorder_ratio > 0.3:
        scores['nmr'] += 4  # NMR이 IDP에 압도적으로 유리
        scores['xray'] -= 2
    elif disorder_ratio < 0.2:
        scores['xray'] += 2

    if cryst_score > 60:
        scores['xray'] += 3
    elif cryst_score < 40:
        scores['nmr'] += 2
        scores['cryoem'] += 2

    if need_dynamics:
        scores['nmr'] += 5  # 동역학 필요 시 NMR 필수

    return max(scores, key=scores.get), scores
```

### Phase N3: NMR-Crystallization 교차 분석 (중기, 3-4개월)

#### N3-1. NMR Chemical Shift → 결정화 조건 상관 분석

**가설**: 단백질의 NMR chemical shift 패턴(secondary structure propensity)이 최적 결정화 조건과 상관관계를 가진다.

**분석 방법:**
1. BMRB에서 chemical shift 데이터 수집 (약 12,000 엔트리)
2. 동일 단백질의 결정화 조건과 매칭
3. Secondary structure propensity (SSP) score → 결정화 pH/침전제 상관 분석
4. α-helix 풍부 단백질 vs β-sheet 풍부 단백질의 결정화 패턴 차이

**논문 가능성:**
> "NMR Chemical Shift-Derived Secondary Structure Propensity Predicts Optimal Crystallization Conditions"
> - BMRB 12K × PDB 결정화 조건 교차 분석
> - 저널: Acta Crystallographica Section D 또는 J. Biomol. NMR

#### N3-2. Dynamics-Crystallizability 상관 연구

**가설**: NMR relaxation 데이터(S² order parameter, Rex)로 측정된 단백질 유연성이 결정화 성공률과 음의 상관관계를 가진다.

**데이터:**
- BMRB에서 ¹⁵N relaxation 데이터 수집
- S² (backbone order parameter) → 전체 단백질 rigidity score
- Rex (chemical exchange) → 구조적 불안정성 지표
- 결정화 성공 여부와 cross-reference

**예상 발견:**
- 평균 S² > 0.85인 단백질: 결정화 성공률 높음
- Rex가 큰 영역이 많은 단백질: 결정화 어려움
- → **NMR relaxation 데이터가 결정화 난이도 예측의 새로운 feature가 될 수 있음**

### Phase N4: AI 신약 스크리닝 통합 플랫폼 (중기, 4-6개월)

#### N4-1. NMR 기반 Fragment Screening 데이터 통합

이동한 박사팀의 NMR 기반 약물 스크리닝과 결정화은행의 Ligand/Binding DB를 통합:

**워크플로우:**
```
1. 타겟 단백질 선정 (결정화은행 Copilot)
   └→ ESM-2 유사 검색 → 기존 리간드/결합 데이터 확인

2. Fragment 스크리닝 (BioNMR NMR)
   └→ STD-NMR, WaterLOGSY, HSQC 기반 히트 확인
   └→ 결합 부위 매핑 (CSP: Chemical Shift Perturbation)

3. Hit-to-Lead (결정화은행 + BioNMR)
   └→ Copilot 조건 추천 → 공결정화
   └→ X-ray 구조 → NMR 동역학 → 결합 메커니즘

4. 데이터 축적
   └→ NMR Kd, kon/koff → kbsi_binding 확장
   └→ CSP 데이터 → 결합 부위 annotation
```

**DB 확장:**
```sql
-- NMR 스크리닝 결과 테이블
CREATE TABLE kbsi_nmr_screening (
  id SERIAL PRIMARY KEY,
  construct_id INTEGER REFERENCES kbsi_construct(id),
  ligand_id INTEGER REFERENCES kbsi_ligand(id),
  method VARCHAR(30),  -- 'STD-NMR', 'WaterLOGSY', 'HSQC', 'CEST'
  hit BOOLEAN,
  kd_nm NUMERIC(12,3),
  kon NUMERIC(12,3),   -- on-rate (s⁻¹M⁻¹)
  koff NUMERIC(12,3),  -- off-rate (s⁻¹)
  csp_max NUMERIC(6,4),  -- max chemical shift perturbation (ppm)
  binding_site_residues TEXT,  -- e.g., 'K45,E89,R120'
  temperature_k NUMERIC(5,1),
  field_mhz INTEGER,   -- 600, 800, 950, 1200
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### N4-2. KBSI 내부 Drug Discovery 파이프라인 연결

```
결정화은행 (데이터)         BioNMR (실험)            통합 AI
─────────────────          ──────────────           ──────────
Ligand DB 182K종     →     NMR 스크리닝 대상 선별
Binding DB 520K건    →     기존 결합 데이터 참조
ESM-2 유사 검색      →     타겟 단백질 선정
XGBoost 예측        →     결정화 가능성 사전 평가
                    ←     NMR Kd/kinetics 데이터
                    ←     결합 부위 매핑 (CSP)
                    ←     IDP 동역학 정보
                           ↓
                    AI 기반 약물-표적 결합 예측 모델
                    (ESM-2 + NMR dynamics + Binding data)
```

### Phase N5: 들뜬 상태 단백질 구조 데이터베이스 (장기, 6개월+)

#### N5-1. Excited State Structure Bank

이동한 박사팀의 핵심 연구 — "보이지 않는 들뜬 상태" 데이터를 체계적으로 축적:

**개념:**
- 기존 PDB는 ground state 구조만 저장
- NMR relaxation dispersion/CEST로 관측된 excited state 구조는 저장소가 없음
- → KBSI가 세계 최초의 "Excited State Structure Bank" 구축

**데이터 구조:**
```sql
CREATE TABLE kbsi_excited_state (
  id SERIAL PRIMARY KEY,
  structure_id INTEGER REFERENCES kbsi_structure(id),
  protein_id INTEGER REFERENCES kbsi_protein(id),
  excited_state_population NUMERIC(5,4),  -- e.g., 0.03 (3%)
  exchange_rate_per_s NUMERIC(10,2),      -- kex (s⁻¹)
  delta_omega_ppm NUMERIC(8,4),           -- chemical shift difference
  method VARCHAR(30),    -- 'CPMG', 'CEST', 'R1rho', 'ZZ-exchange'
  field_mhz INTEGER,
  temperature_k NUMERIC(5,1),
  ph NUMERIC(4,2),
  functional_relevance TEXT,  -- e.g., 'enzyme catalysis', 'ligand binding'
  pdb_excited_state VARCHAR(10),  -- PDB ID if structure modeled
  reference_doi VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**논문:**
> "KBSI Excited State Structure Bank: A Database of Transiently Populated Protein Conformations from NMR Spectroscopy"
> - 저널: Nucleic Acids Research (Database issue) 또는 Nature Methods
> - **세계 최초**: 들뜬 상태 단백질 데이터의 체계적 데이터베이스

#### N5-2. Excited State × Crystallization 교차 분석

**가설**: 들뜬 상태 단백질의 population/exchange rate가 결정화에 영향을 미치는가?

- 들뜬 상태 population이 높은 단백질(> 5%)은 결정화가 어려운가?
- Exchange rate(kex)가 빠른 단백질은 crystal contact 형성이 불안정한가?
- 들뜬 상태를 안정화하는 리간드/변이가 결정화를 촉진하는가?

### Phase N6: 통합 AI 모델 고도화 (장기, 6-12개월)

#### N6-1. Multi-Modal 결정화 예측 모델 v2

현재 XGBoost + ESM-2 모델에 NMR 데이터를 추가:

```
현재 모델 (v1):
  Input: ESM-2 (1280) + pH + temp + precip + conc = 1284차원
  Output: 성공 확률 (91.9%)

고도화 모델 (v2):
  Input: ESM-2 (1280) + pH + temp + precip + conc
         + disorder_ratio + avg_S2 + max_Rex       ← NMR dynamics
         + secondary_structure_propensity           ← NMR chemical shift
         + excited_state_population                 ← NMR CEST/CPMG
         = ~1290차원
  Expected Output: 성공 확률 (93-95%?)
```

**핵심 질문**: NMR 동역학 feature가 결정화 예측을 추가로 개선하는가?
- 데이터 제약: NMR relaxation 데이터가 있는 단백질 수가 제한적 (~2,000건)
- 전략: BMRB 데이터 + ESM-2 예측 disorder를 proxy feature로 활용

#### N6-2. 통합 Copilot v2

```
현재 Copilot v1:
  서열 → ESM-2 유사 검색 → 결정화 조건 추천 → 성공 예측

Copilot v2 (BioNMR 통합):
  서열 → ESM-2 유사 검색
       → Disorder/flexibility 예측
       → 방법론 추천 (X-ray vs NMR vs Cryo-EM)
       → 결정화 조건 추천 (X-ray인 경우)
       → NMR 버퍼/조건 추천 (NMR인 경우)
       → 약물 결합 가능성 평가
       → 성공 확률 예측 (다중 방법론별)
       → "이 단백질은 NMR이 적합합니다. 1.2 GHz 사용 권장"
```

---

## 5. 기대 효과

### 5.1 논문 생산

| # | 제목 (안) | 저널 | 데이터 출처 |
|---|----------|------|-----------|
| 1 | NMR Chemical Shift-Derived SSP Predicts Crystallization Conditions | Acta Cryst. D | BMRB × PDB 교차 |
| 2 | Protein Dynamics as a Predictor of Crystallization Success | J. Mol. Biol. | BMRB relaxation × 결정화 |
| 3 | KBSI Excited State Structure Bank | Nucleic Acids Res. | NMR CEST/CPMG 데이터 |
| 4 | Multi-Modal Crystallization Prediction with NMR Dynamics | Bioinformatics | ESM-2 + NMR + XGBoost |
| 5 | Integrated AI Platform for Structural Method Selection | Nature Methods | 방법론 추천 엔진 |
| 6 | NMR-guided Fragment Screening Integrated with Crystallization DB | J. Med. Chem. | NMR 스크리닝 + Binding DB |

### 5.2 연구 역량 시너지

```
이동한 박사팀 역량              시스템 고도화              최종 산출물
────────────────              ────────────              ──────────
1.2 GHz NMR (세계급)    →     NMR 데이터 DB 통합    →   세계 최초 통합 구조DB
AI + NMR (ONEST 등)    →     AI 모델 v2           →   예측 정확도 향상
IDP 전문성             →     Disorder 예측 모듈    →   Crystallizability 향상
약물 스크리닝 (NMR)    →     Drug Discovery 통합   →   KBSI 신약개발 플랫폼
들뜬 상태 연구         →     Excited State Bank    →   Nature급 DB 논문
```

### 5.3 경쟁 우위 확보

| 경쟁자 | 결정화 DB | NMR 동역학 | ESM-2 임베딩 | 통합 AI | 1.2 GHz NMR |
|--------|---------|-----------|-------------|--------|------------|
| RCSB PDB | 구조만 | BMRB (별도) | ❌ | ❌ | ❌ |
| AlphaFold | ❌ | ❌ | ❌ (자체 PLM) | 구조 예측만 | ❌ |
| BMRB | ❌ | Chemical shift만 | ❌ | ❌ | ❌ |
| **KBSI (고도화)** | **1.16M (성공+실패)** | **동역학+들뜬상태** | **284K** | **통합 Copilot** | **아시아 유일** |

---

## 6. 구현 로드맵

```
2026 Q4                2027 Q1                  2027 Q2                  2027 Q3-Q4
─────────              ─────────                ─────────                ──────────
[N1] NMR 구조          [N2] Disorder/           [N3] NMR-Cryst           [N5] Excited
데이터 수집            Flexibility 예측          교차 분석                State Bank
+ 방법론 비교          + 방법론 추천                                     + 통합 AI v2
대시보드               엔진                     [N4] NMR Drug
                                                Screening 통합           [N6] Copilot v2
                                                                         Multi-Modal
```

### 우선순위 (투입 대비 효과)

| 순위 | Phase | 난이도 | 기대 효과 | 의존성 |
|------|-------|--------|----------|--------|
| **1** | N1 (NMR 구조 수집) | 낮음 | 데이터 완성도 향상 | 없음 (PDB/BMRB 공개) |
| **2** | N2 (Disorder 예측) | 중간 | Copilot 즉시 활용 | ESM-2 인프라 (완료) |
| **3** | N3 (교차 분석) | 중간 | 논문 2편+ 가능 | N1 완료 |
| **4** | N4 (Drug Screening) | 높음 | KBSI 공동연구 확대 | BioNMR 팀 협력 |
| **5** | N5 (Excited State) | 높음 | Nature급 논문 | BioNMR 팀 데이터 |
| **6** | N6 (통합 AI v2) | 매우 높음 | 예측 정확도 향상 | N1-N5 부분 완료 |

---

## 7. 핵심 메시지

> **결정화은행(X-ray 중심) + BioNMR Lab(NMR 동역학) = 단백질 구조결정의 전 과정을 아우르는 세계 유일의 통합 AI 플랫폼**

현재 결정화은행은 X-ray 결정학 파이프라인에 특화되어 있다. 이동한 박사팀의 BioNMR 역량(1.2 GHz NMR, IDP 전문성, AI+NMR 융합, 약물 스크리닝)을 통합하면:

1. **데이터 차원 확장**: 결정화 조건(1.16M) + NMR 동역학 + 들뜬 상태 → 다차원 분석
2. **예측 모델 강화**: ESM-2 + NMR feature → 결정화/방법론 예측 정확도 향상
3. **연구 범위 확대**: 결정화 가능 단백질(~70%) + IDP/NMR 대상(~30%) = 전체 단백질 커버
4. **신약개발 통합**: 구조결정 → 약물 스크리닝 → 결합 메커니즘 → 원스톱 플랫폼
5. **세계적 경쟁력**: 1.2 GHz NMR + 1.16M 결정화 DB + ESM-2 AI = 어디에도 없는 조합

---

## 참고 자료 (Sources)

- [BioNMR Lab 홈페이지](https://bionmr.org/)
- [Donghan Lee - Google Scholar](https://scholar.google.com/citations?user=EfSyUn0AAAAJ&hl=en)
- [Dynamic protein interactions probed by NMR spectroscopy (2025)](https://onlinelibrary.wiley.com/doi/10.1002/bkcs.70036)
- [Deep learning-based NMR signal analysis (2025)](https://link.springer.com/article/10.1186/s40543-025-00474-4)
- [ONEST: CEST analysis platform (Bioinformatics, 2026)](https://academic.oup.com/bioinformatics/article/42/4/btag158/8554090)
- [p53 N-terminal dynamics (Nature Communications, 2026)](https://www.nature.com/articles/s41467-026-73145-6)
- [Methylene Blue Tau mechanism (JACS Au, 2024)](https://pubs.acs.org/doi/10.1021/jacsau.4c00262)
- [Transient binding classification (Nature Communications, 2022)](https://www.nature.com/articles/s41467-022-31374-5)
- [NMR invisible excited states + ML (bioRxiv, 2025)](https://www.biorxiv.org/content/10.1101/2025.11.27.690854.full.pdf)
- [Bruker 1.2 GHz NMR at KBSI (2024)](https://ir.bruker.com/press-releases/press-release-details/2024/Bruker-Announces-Successful-Installation-of-1.2-GHz-Avance-NMR-Spectrometer-at-the-Korea-Basic-Science-Institute-KBSI/default.aspx)
- [KBSI NMR-Biophysics 연구유닛](https://kbsi.re.kr/board?boardId=BOARD00248&menuId=MENU002020108010000&siteId=SITE00002)
- [KBSI 첨단바이오의약연구부 (전자신문, 2024)](https://www.etnews.com/20241008000058)
- [PTP4A3 inhibitor screening (Nature Sci. Reports, 2021)](https://www.nature.com/articles/s41598-021-89668-5)
