# AI Scientist for Protein Crystallization Research

## 비전: 과학적 발견 공장 (Discovery Factory)

KBSI 단백질 결정화은행의 1.16M 실험 데이터를 기반으로, Sakana AI Scientist 프레임워크를 결정화 도메인에 적용하여 **자율적으로 가설을 생성하고, 검증하고, 논문을 생산하는 시스템**을 구축한다.

**핵심 차별점**: AlphaFold가 "구조 예측"을 혁신했다면, 이 시스템은 **"실험 과정 자체"를 혁신**한다. 실험을 대체하는 것이 아니라, **실험을 더 똑똑하게** 만든다.

---

## 1. 기반 자산 (현재 보유)

| 자산 | 규모 | 차별점 |
|------|------|--------|
| 결정화 데이터 | 1,161,043건 | **성공+실패 모두 포함** (세계 유일) |
| 단백질 | 59,349종 | Dedupe 완료, gene_name 9.7K |
| Expression | 26,201건 | 논문 LLM 추출 (host, strain, temp, yield) |
| Purification | 12,014건 | 논문 LLM 추출 |
| Characterization | 8,373건 | DLS, SEC-MALS, Tm 등 |
| Diffraction | 476,186건 | resolution, space_group, beamline |
| Ligands | 19,072종 | PDB HET + ChEMBL |
| Bindings | 62,624건 | IC50, Kd, Ki |
| References | 42,046 논문 | DOI, 저자, 저널 연결 |
| Construct MW/pI | 279,772건 | 서열 기반 자동 계산 |
| expression_system | 241,592건 | PDB API backfill |
| MCP 도구 | 15개 | AI Agent 즉시 접근 가능 |
| Copilot 프로토타입 | 동작 중 | 서열→실험 전략 추천 |
| ML 벤치마크 | 91.9% | k-NN 기반 |

---

## 2. AI Scientist 자율 연구 루프

```
┌─────────────────────────────────────────────────────────┐
│                  AI Scientist Agent                      │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ 1. 가설  │───→│ 2. 검증  │───→│ 3. 발견  │           │
│  │   생성   │    │ (DB분석) │    │  (통계)  │           │
│  └──────────┘    └──────────┘    └──────────┘           │
│       ↑                                │                 │
│       │          ┌──────────┐    ┌─────↓────┐           │
│       └──────────│ 7. 반복  │←───│ 4. 실험  │           │
│                  │  (학습)  │    │   설계   │           │
│                  └──────────┘    └──────────┘           │
│                       ↑               │                  │
│                  ┌────┴─────┐    ┌────↓─────┐           │
│                  │ 6. 결과  │←───│ 5. 실험  │           │
│                  │   분석   │    │ (연구자) │           │
│                  └──────────┘    └──────────┘           │
│                                                          │
│  → 8. 논문 자동 생성 (발견 + 통계 + 시각화)              │
└─────────────────────────────────────────────────────────┘
         │                              ↑
    ┌────↓────┐                    ┌────┴────┐
    │  MCP    │                    │  Quick  │
    │ 15 도구 │                    │  Entry  │
    └─────────┘                    └─────────┘
         │                              ↑
    ┌────↓────────────────────────────────┐
    │         KBSI Database               │
    │  59K proteins, 1.16M conditions     │
    └─────────────────────────────────────┘
```

### 각 단계 상세

**1단계: 가설 생성**
- DB 메타데이터 스캔 (테이블별 필드 분포, NULL 비율)
- 변수 간 조합 탐색 (pH × MW, 침전제 × organism 등)
- 기존 문헌과의 차이점 식별
- 가설 템플릿: "변수 A가 X 범위일 때, 변수 B에 유의한 영향을 미칠 것이다"

**2단계: 데이터 수집 (MCP)**
- searchCrystallizationConditions: 조건별 결정화 데이터
- searchProteins: 단백질 메타데이터
- searchCharacterizations: 특성분석 데이터
- searchDiffractions: 회절 데이터
- getLigandBindingNetwork: 약물-타겟 바인딩

**3단계: 통계 검증**
- t-test, chi-squared test, ANOVA
- 다중 비교 보정 (Bonferroni, FDR)
- Effect size (Cohen's d, odds ratio)
- Confidence interval
- Sample size adequacy check

**4단계: 실험 설계**
- 검증 실험 24조건 자동 생성 (Custom Screen Designer)
- 양성/음성 대조군 포함
- 통계적 검정력 확보를 위한 반복수 계산

**5단계: 실험 (KBSI 연구자)**
- AI가 설계한 조건을 Quick Entry로 결과 입력
- 실험 프로토콜 자동 생성 (PDF)

**6단계: 결과 분석**
- 가설 검증/기각 판정
- 예상과 다른 결과 → 새로운 가설 생성

**7단계: 반복**
- 검증된 가설 → 더 깊은 탐구
- 기각된 가설 → 수정 가설 생성
- 새로운 데이터 축적 → 모델 업데이트

**8단계: 논문 생성**
- 발견 요약 (Abstract)
- 데이터 분석 (Methods + Results)
- 시각화 (차트, 테이블 자동 생성)
- 참고문헌 (DB에서 관련 논문 자동 연결)

---

## 3. 논문 생산 계획

### Tier 1: 데이터셋 논문 (즉시 가능)

| # | 제목 | 저널 | 상태 |
|---|------|------|------|
| 1 | "KBSI-CrystalBank: A Comprehensive Database of 1.16M Protein Crystallization Conditions Including Failure Data" | Nature Scientific Data | 데이터 준비 완료 |
| 2 | "Large-scale LLM Extraction of Expression and Purification Conditions from 286K PDB Structures" | Scientific Data | 데이터 준비 완료 |
| 3 | "A Benchmark Dataset for Protein Crystallization Outcome Prediction" | Data in Brief | 벤치마크 v4 후 |

### Tier 2: AI Scientist 자동 발견 논문

**단백질 물성 × 결정화 조건:**

| # | 가설 | 분석 방법 | 예상 데이터 |
|---|------|----------|-----------|
| 4 | "pI와 최적 결정화 pH의 관계" | pI 계산 (280K) × pH (94%) 상관분석 | 충분 |
| 5 | "MW별 최적 침전제 농도 가이드라인" | MW (280K) × precipitant_conc (28%) | 가능 |
| 6 | "아미노산 조성과 결정화 성공률" | seq_final (286K) → 조성 분석 | 풍부 |
| 7 | "Hydrophobicity score와 PEG 농도의 관계" | Kyte-Doolittle 계산 필요 | 중간 |

**발현 → 결정화 연결:**

| # | 가설 | 데이터 |
|---|------|--------|
| 8 | "발현 시스템이 결정화 성공률에 미치는 영향" | 242K expression_system × 1.16M |
| 9 | "수율 > 10mg/L이 결정화 필요조건인가?" | 26K expression × crystallization |
| 10 | "태그 종류(His6/GST/MBP)와 결정 품질" | construct tag × resolution |
| 11 | "유도 온도와 단백질 가용성의 정량적 관계" | 2.7K induction_temp × result_level |

**종(Organism)별 패턴:**

| # | 가설 | 데이터 |
|---|------|--------|
| 12 | "인간 vs 박테리아 단백질: 최적 결정화 조건 차이" | 35K human + 15K bacterial |
| 13 | "열안정성 생물 유래 단백질의 결정화 우위" | thermophile organism 필터 |

**약물 × 구조:**

| # | 가설 | 데이터 |
|---|------|--------|
| 14 | "리간드 결합이 결정화를 촉진하는가?" | 63K binding × crystallization |
| 15 | "IC50 < 100nM 약물의 공결정화 성공률" | ChEMBL IC50 × PDB co-crystal |

**시간 트렌드:**

| # | 가설 | 데이터 |
|---|------|--------|
| 16 | "30년간 결정화 조건 트렌드 분석" | deposit_date (backfill 중) |
| 17 | "Cryo-EM 시대에 X-ray 결정학이 유효한 영역" | method × year × resolution |

### Tier 3: 방법론 논문

| # | 제목 | 저널 |
|---|------|------|
| 18 | "AI Scientist for Protein Crystallization: Autonomous Hypothesis-Validation Loop" | Nature Methods |
| 19 | "MCP-based AI Agent Architecture for Structural Biology Databases" | Bioinformatics |
| 20 | "LLM-based Extraction of Experimental Conditions from Scientific Papers: Accuracy 81.4%" | J. Chem. Inf. Model. |
| 21 | "Negative Control Synthesis Strategies for ML-based Crystallization Prediction" | Acta Cryst. D |

---

## 4. "공장" 운영 모델

### 주간 사이클

```
월요일: AI Scientist가 10개 가설 자동 생성
화요일: MCP로 DB 분석 + 통계 검증 자동 실행
수요일: 유효한 3-4개 발견 필터링 (p < 0.01, n > 100)
목요일: 시각화 + 논문 초안 자동 생성
금요일: 도메인 전문가 검토 → 저널 제출
```

### 예상 산출물

| 기간 | 논문 수 | 누적 |
|------|---------|------|
| 1개월 차 | 2-3편 (데이터셋 + 첫 발견) | 3 |
| 3개월 차 | 월 3-4편 | 12 |
| 6개월 차 | 월 4-5편 | 30 |
| 1년 차 | 누적 50편+ | 50 |

### 품질 관리

- **통계 엄격성**: 다중 비교 보정 (Bonferroni), FDR < 0.05
- **재현성**: 핵심 발견은 wet lab 검증 (KBSI 연구실)
- **도메인 검증**: 구조생물학 전문가 human-in-the-loop
- **p-hacking 방지**: 사전 등록된 가설만 논문화
- **AI 투명성**: 논문에 AI Scientist 사용 명시

---

## 5. 기술 구현 계획

### Phase A: 기반 (1-2개월)

1. 첫 번째 데이터셋 논문 작성 (Nature Scientific Data)
2. 벤치마크 v4 실행 (Enrichment 완료 후)
3. 통계 분석 모듈 구현 (t-test, ANOVA, effect size)
4. 가설 템플릿 라이브러리 (20개 초기 가설)

### Phase B: AI Scientist 구현 (2-3개월)

5. Sakana AI Scientist 포크 + 도메인 어댑터
6. MCP 도구 확장 (통계 분석, 실험 설계 전용)
7. 가설→검증→발견 자동 루프 구현
8. 논문 초안 자동 생성 파이프라인

### Phase C: 실험 연동 (3-6개월)

9. Quick Entry ↔ AI Scientist 피드백 루프 자동화
10. 실험 프로토콜 자동 생성 (PDF)
11. 결과 수신 → 가설 수정 → 재실험 사이클
12. Custom Screen Designer 통합

### Phase D: 확장 (6개월~)

13. 다른 도메인 확장 (Cryo-EM, NMR 조건 최적화)
14. 외부 연구 그룹 피드백 루프 (다기관 공동연구)
15. AI Scientist 성능 벤치마크 (AI vs 인간 연구자 비교)
16. 오픈소스 프레임워크 공개

---

## 6. Sakana AI Scientist와의 차이점

| 항목 | Sakana 원본 | KBSI 적용 |
|------|-----------|----------|
| 실험 환경 | ML 코드 실행 (in silico) | **실제 결정화 DB + wet lab** |
| 데이터 | ML 벤치마크 | **1.16M 실험 데이터 (성공+실패)** |
| 도구 | Python 코드 실행 | **MCP 15+ 도구 (DB 직접 접근)** |
| 검증 | 모델 성능 | **통계 검정 + wet lab 검증** |
| 출력 | ML 논문 (arxiv) | **실험 프로토콜 + 저널 논문** |
| 피드백 | 없음 (1회성) | **연구자 실험 → 결과 → 반복 루프** |
| 산업 임팩트 | 간접적 | **신약개발 가속화 (직접적)** |

---

## 7. 왜 지금인가?

1. **데이터 준비 완료**: 1.16M 결정화, 59K 단백질, 476K diffraction — 충분한 통계적 검정력
2. **MCP 인프라 완료**: 15개 도구로 AI Agent가 즉시 DB 접근 가능
3. **Copilot 프로토타입 동작**: 서열→추천 파이프라인 검증 완료
4. **Sakana AI Scientist 공개**: 오픈소스 프레임워크 활용 가능
5. **학술계 수요**: AI 활용 구조생물학 연구에 대한 관심 급증
6. **경쟁자 부재**: 이 조합(실패 데이터 + AI Scientist + MCP)은 세계 어디에도 없음

---

## 8. 4가지 요소의 결합이 만드는 임팩트

### 4가지 요소

```
┌──────────────────┐  ┌──────────────────┐
│  AI Scientist    │  │     MCP          │
│  (자율 연구 엔진) │  │  (AI 접근 계층)   │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         └──────────┬──────────┘
                    │
         ┌──────────↓──────────┐
         │     KBSI Database    │
         │  (1.16M 실험 데이터)  │
         └──────────┬──────────┘
                    │
         ┌──────────↓──────────┐
         │  KBSI 실험 인프라    │
         │  (연구자 + 장비)     │
         └─────────────────────┘
```

### 각 요소가 없으면?

| 빠진 요소 | 결과 | 한계 |
|----------|------|------|
| AI Scientist 없음 | DB + MCP만 있음 | 연구자가 직접 질문해야 함. 자율 발견 불가 |
| MCP 없음 | AI가 DB에 접근 못함 | AI가 수동으로 데이터 받아야 함. 자동화 불가 |
| Database 없음 | AI만 있고 데이터 없음 | 가설 검증할 수 없음. 학문적 의미 없음 |
| 실험 인프라 없음 | in silico만 가능 | 예측만 하고 검증 못함. 신뢰도 한계 |

### 4가지가 합쳐지면?

**각각은 평범하지만, 결합하면 세계에 없는 시스템이 됩니다:**

#### 임팩트 1: Closed-loop 자율 연구 (세계 최초)

```
기존 AI 연구:  AI 예측 → 끝 (검증은 사람이 나중에)
KBSI 시스템:   AI 가설 → MCP로 DB 분석 → 실험 설계 →
               KBSI 연구자 실험 → Quick Entry 결과 →
               AI가 학습 → 다음 가설 → 반복
```

- 가설에서 실험 검증까지 **1주일** (기존: 6개월~1년)
- AI가 실패에서 학습 → 다음 실험이 점점 정확해짐
- **자기 강화 루프**: 실험할수록 DB가 커지고, DB가 클수록 AI가 정확해짐

#### 임팩트 2: 실패 데이터의 가치 전환

```
기존 과학계:  실패 = 버리는 데이터 (논문에 안 씀)
KBSI 시스템:  실패 = AI 학습 데이터 (927K건 축적)
             → "하지 말아야 할 것"을 아는 유일한 시스템
             → 다른 연구자의 같은 실패를 방지
```

- 전 세계 구조생물학자가 **같은 실패를 반복하지 않게** 됨
- 연간 낭비되는 실험 비용 추정: 수억 달러 → KBSI가 절감 가능
- "실패 데이터 공유" 문화를 학술계에 확산

#### 임팩트 3: 연구 민주화

```
기존:  30년 경험의 시니어 연구자만 좋은 결정화 조건을 "감"으로 안다
       → 그 연구자 은퇴하면 지식 소멸
KBSI:  신입 연구자도 AI Copilot으로 시니어 수준의 실험 설계 가능
       → 경험이 DB에 영구 축적, 전 세계 공유
```

- 개발도상국 연구자도 **세계 최고 수준의 실험 설계** 접근
- KBSI 연구원 교체 시에도 **지식 단절 없음**
- 학생/초급 연구자의 생산성 **3-5배 향상**

#### 임팩트 4: 신약개발 가속화

```
현재 신약개발 병목:
  타겟 단백질 구조 결정 → 평균 6-12개월 → 비용 $50K-200K

KBSI 시스템 적용 시:
  AI Copilot 추천 → 1-2개월 → 비용 $5K-20K
  → 10배 빠르게, 10배 저렴하게
```

- 구조 기반 약물 설계(SBDD) 파이프라인 **6개월 단축**
- 특히 rare disease, orphan drug 등 연구비 제한 영역에서 임팩트
- 제약사 공동연구 → **수익 모델** 가능

#### 임팩트 5: 과학적 발견의 산업화

```
기존:  연구자 1명이 1년에 논문 2-3편 (수동 분석)
KBSI:  AI Scientist가 1년에 논문 50편+ (자동 발견)
       + 각 발견이 실험으로 검증됨 (in silico가 아님)
```

- 대규모 데이터에서 **인간이 보지 못하는 패턴** 발견
- 예: "MW 33-47kDa + pI 5.5-6.5 조합이 PEG 3350에서 성공률 3배" → 이런 발견은 1.16M 데이터를 통계적으로 분석해야만 가능
- 각 발견이 **즉시 실용적** (내일 실험에 적용 가능)

#### 임팩트 6: 학술 생태계 변화

```
기존 학술 생태계:
  데이터 생산 → 논문 → 끝 (데이터 재사용 안 됨)

KBSI 생태계:
  데이터 생산 → DB 축적 → AI 분석 → 새 발견 → 논문
       ↑                                    │
       └────────── 실험 검증 ←───────────────┘
```

- **데이터가 한 번 쓰이고 버려지지 않음** → 영구적으로 가치 생성
- 다른 연구 분야에도 적용 가능한 **모델 케이스**
  - 촉매 연구, 재료 과학, 합성 화학 등
- "AI Scientist + Domain DB + Wet Lab" 패러다임의 **선구자**

### 종합: 경쟁 우위 매트릭스

| 경쟁자 | Database | MCP/AI 접근 | AI Scientist | Wet Lab 루프 | 종합 |
|--------|----------|-----------|-------------|-------------|------|
| **RCSB PDB** | ✅ (성공만) | ❌ | ❌ | ❌ | 데이터 저장소 |
| **AlphaFold** | ❌ | ❌ | ❌ (구조 예측만) | ❌ | 구조 예측기 |
| **Formulatrix** | 🔶 (개별 랩) | ❌ | ❌ | 🔶 (개별 랩) | 랩 LIMS |
| **Sakana AI** | ❌ | ❌ | ✅ (ML만) | ❌ | ML 논문 생성기 |
| **KBSI 결정화은행** | ✅ **(성공+실패)** | ✅ **(15도구)** | ✅ **(도메인 특화)** | ✅ **(KBSI 인프라)** | **자율 연구 플랫폼** |

**결론: 4가지 요소를 모두 갖춘 시스템은 KBSI가 유일하며, 이 결합이 만드는 가치는 각 요소의 합보다 기하급수적으로 크다.**

---

## 9. 한 문장 요약

> **KBSI 단백질 결정화은행 + AI Scientist = 전 세계 최초로 단백질 실험의 "성공과 실패"를 학습하여 자율적으로 가설을 생성하고, 실험을 설계하고, 과학적 발견을 논문으로 생산하는 AI 기반 연구 플랫폼.**
