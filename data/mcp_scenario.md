# KBSI MCP 활용 시나리오 — AI의 추론 능력을 100% 활용하기

## MCP 연동 현황

**15개 도구**가 claude.ai, Claude Code 등 AI Agent에서 즉시 사용 가능:

| 도구 | 기능 |
|------|------|
| search_proteins | 단백질 검색 (이름, 유전자명, 약어) |
| search_constructs | Construct 검색 (단백질 ID, 이름) |
| get_experiments | 실험 데이터 조회 (6개 타입) |
| get_statistics | DB 통계 |
| recommend_crystallization | 결정화 조건 추천 (k-NN) |
| predict_success | 성공 확률 예측 |
| search_crystallization_conditions | 조건별 검색 (pH, 온도, 침전제) |
| sequence_search | 서열 유사도 검색 |
| search_ligands | 리간드 검색 (이름, SMILES) |
| get_bindings | 바인딩 데이터 (IC50, Kd, Ki) |
| search_structures | 3D 구조 검색 (PDB ID, 방법) |
| get_data_quality | 데이터 품질 요약 |
| search_characterizations | 특성분석 검색 (DLS, Tm 등) |
| search_diffractions | 회절 데이터 검색 (해상도, 공간군) |
| get_ligand_binding_network | 단백질-리간드 네트워크 |

---

## 시나리오 1: 신약 타겟 단백질 종합 분석

### 연구자 질문
> "EGFR에 대해 알려줘. 구조, 결정화 조건, 바인딩 약물, 발현 조건까지 전부."

### AI 추론 과정
```
1. search_proteins("EGFR")
   → protein_id=232, organism=Homo sapiens

2. search_constructs(protein_id=232)
   → 15개 construct (full-length, kinase domain, 다양한 mutant)

3. get_experiments(construct_id=XXX, type="expression")
   → E. coli, insect cells 비교 → "insect cells에서 수율 더 높음"

4. get_experiments(construct_id=XXX, type="crystallization")
   → 200건 조건 → pH 6.5-7.5, PEG 3350 20% 최다

5. search_diffractions(protein_name="EGFR")
   → 1.5-3.0Å 해상도 분포, "kinase domain이 해상도 높음"

6. get_ligand_binding_network(protein_name="EGFR")
   → Gefitinib IC50=33nM, Erlotinib IC50=2nM, Osimertinib IC50=12nM

7. predict_success(ph=7.0, temperature=18, precipitant_type="PEG 3350")
   → 성공 확률 67%
```

### AI 종합 답변
> "EGFR은 인간 유래 수용체 tyrosine kinase로, 15개 construct가 등록되어 있습니다.
>
> **발현**: insect cells(Sf9)에서 평균 수율 8mg/L로, E. coli보다 3배 높습니다.
> **결정화**: kinase domain(residue 696-1022)이 가장 잘 결정화됩니다.
> 최적 조건: PEG 3350 20%, Bis-Tris pH 6.5, 18°C (성공 확률 67%)
> **구조**: 1.5Å까지 해상도 달성, 총 N개 구조 등록
> **약물**: 3세대 TKI Osimertinib이 T790M 변이에 효과적 (IC50=12nM)
>
> 추천: kinase domain construct, insect cells 발현, PEG 3350 pH 6.5로 시작하세요."

---

## 시나리오 2: 결정화 실패 원인 분석

### 연구자 질문
> "p53 단백질을 결정화하는데 계속 precipitate만 나와. 왜 그런지 분석해줘."

### AI 추론 과정
```
1. search_proteins("p53")
   → protein_id=XXX, Homo sapiens, Tumor protein p53

2. search_crystallization_conditions(precipitant_type=null, outcome="precipitate")
   → p53 관련 실패 조건 패턴 분석

3. search_crystallization_conditions(outcome="single_crystal")
   → p53 성공 조건과 비교

4. search_characterizations(protein_name="p53")
   → DLS: polydisperse → "단백질 품질 문제 가능성"
   → Tm: 42°C → "열안정성 낮음"

5. get_experiments(type="expression")
   → 다양한 construct 비교 → "DNA-binding domain만 결정화 성공"
```

### AI 종합 답변
> "p53의 결정화 실패 원인을 분석했습니다:
>
> **근본 원인**: p53 full-length는 본질적으로 유연(intrinsically disordered)합니다.
>
> **데이터 근거**:
> - DLS에서 polydisperse → 다양한 올리고머 상태 혼재
> - Tm 42°C → 체온에서도 불안정
> - Full-length 결정화 시도 47건 중 성공 0건
> - DNA-binding domain(94-292) 결정화 성공률 23%
>
> **추천**:
> 1. **Construct 변경**: DNA-binding domain(94-292)으로 전환
> 2. **안정화**: DNA 올리고와 복합체 형성 (성공률 2배)
> 3. **온도**: 4°C (열 불안정 보상)
> 4. **침전제**: PEG 4000 15-20%, pH 6.0-6.5
>
> 유사 단백질 성공 사례 3건을 참고하세요: [construct 상세 링크]"

---

## 시나리오 3: 유사 단백질 기반 실험 설계

### 연구자 질문
> "새로운 kinase를 결정화하려고 해. 비슷한 kinase들은 어떤 조건에서 성공했어?"

### AI 추론 과정
```
1. search_proteins("kinase")
   → 수천 개 kinase → 분류 필요

2. AI 추론: "어떤 kinase인지 좁혀야 함"
   → "어떤 kinase인가요? gene name이나 서열을 알려주세요."

3. sequence_search(sequence="사용자 서열")
   → 유사 kinase 10개 (CDK2 45%, ABL1 38%, EGFR 32%)

4. 유사 kinase들의 결정화 조건 집계:
   search_crystallization_conditions(precipitant_type="PEG 3350")
   search_crystallization_conditions(precipitant_type="Ammonium Sulfate")
   → PEG 3350 pH 7.0 18°C에서 62% 성공

5. recommend_crystallization(ph=7.0, temperature=18, precipitant_type="PEG 3350")
   → 상위 5개 조건 추천

6. get_experiments(type="expression")
   → "kinase domain만 발현하면 수율 5배"
```

### AI 종합 답변
> "입력하신 서열과 유사한 kinase 10개를 분석했습니다.
>
> **최적 조건 (상위 3개)**:
> 1. PEG 3350 20%, HEPES pH 7.5, 18°C — 성공률 62%
> 2. PEG 4000 25%, Bis-Tris pH 6.5, 20°C — 성공률 48%
> 3. (NH4)2SO4 2M, Tris pH 8.0, 18°C — 성공률 35%
>
> **피해야 할 조건**: pH 5 이하 (100% 침전), MPD (85% 실패)
>
> **Construct 추천**: kinase domain만 (residue 250-530), His6-tag, E. coli BL21
> → 유사 kinase에서 이 설계가 발현 수율 5배, 결정화 성공률 3배"

---

## 시나리오 4: 약물-타겟 상호작용 네트워크

### 연구자 질문
> "KRAS G12C에 결합하는 약물들 비교해줘. 어떤 게 가장 강하게 붙어?"

### AI 추론 과정
```
1. search_proteins("KRAS")
   → protein_id=1

2. get_ligand_binding_network(protein_name="KRAS")
   → 387개 ligand, IC50/Kd 값 포함

3. AI 추론: 바인딩 데이터 정렬, 약물 분류
   → 공유결합 억제제 vs 비공유결합
   → G12C 선택적 vs 범용

4. search_structures(pdb_id="6OIM") — Sotorasib 복합체
   → 해상도 1.65Å, 결합 부위 분석

5. search_ligands("Sotorasib")
   → MW=560.6, SMILES 구조
```

### AI 종합 답변
> "KRAS G12C에 대한 387개 바인딩 데이터를 분석했습니다.
>
> **FDA 승인 약물**:
> | 약물 | 타입 | IC50 | PDB |
> |------|------|------|-----|
> | Sotorasib (AMG-510) | 공유결합 | ~90nM | 6OIM |
> | Adagrasib (MRTX849) | 공유결합 | ~5nM | 6USX |
>
> **주요 발견**:
> - 공유결합 억제제가 비공유결합보다 10-100배 강력
> - Switch II pocket을 타겟하는 것이 핵심
> - Adagrasib이 Sotorasib보다 IC50 기준 18배 강력
> - 하지만 Sotorasib이 먼저 FDA 승인 (2021)
>
> **구조 기반 분석**: 6OIM (1.65Å)에서 Sotorasib은 Cys12에 공유결합 형성.
> His95와 수소결합이 선택성을 결정합니다."

---

## 시나리오 5: 데이터 품질 감사 & 보고서

### 연구자/관리자 질문
> "현재 DB 데이터 품질이 어떤지 전체적으로 평가해줘."

### AI 추론 과정
```
1. get_statistics()
   → 전체 테이블별 건수

2. get_data_quality()
   → 필드 커버리지, outcome 분포, 합성 비율

3. AI 추론: 각 지표를 기준값과 비교
   → pH 98.9% (우수), precipitant 54% (개선 필요)
   → 합성 데이터 비율 80% → "실험 데이터 확보 필요"

4. search_crystallization_conditions(outcome="diffraction_quality")
   → 성공 데이터 소스 분포

5. AI 추론: 종합 판정 + 개선 방안
```

### AI 종합 답변
> "KBSI 데이터베이스 품질 감사 결과입니다.
>
> **전체 규모**: 2.8M 레코드 (13개 테이블)
>
> **품질 등급**:
> | 항목 | 커버리지 | 등급 |
> |------|---------|------|
> | pH | 98.9% | A |
> | Temperature | 94.2% | A |
> | Outcome | 98.7% | A |
> | Precipitant | 54% | C (Enrichment 진행) |
> | Expression host | 89.8% | B |
> | gene_name | 51% | C |
>
> **교차 검증**: PDB 원본 대비 100% 일치 (100건 샘플)
> **Enrichment 정확도**: 98.5% (LLM 파싱 오류 1.5%)
>
> **개선 권고**:
> 1. precipitant_type: 나머지 46% Enrichment 완료 필요
> 2. gene_name: SIFTS 매핑 추가 (51% → 80% 가능)
> 3. 실험 데이터 비율: 현재 20% → Quick Entry로 확대"

---

## 시나리오 6: 논문 작성 지원

### 연구자 질문
> "KRAS 결정화 조건 비교표를 논문용으로 만들어줘."

### AI 추론 과정
```
1. search_proteins("KRAS")
2. search_constructs(protein_id=1)
3. get_experiments(type="crystallization") — 각 construct별
4. search_diffractions(protein_name="KRAS")
5. search_structures(pdb_id 목록)

6. AI 추론: 논문 형식에 맞게 테이블 구성
   → Construct, 조건, 결과, 해상도, PDB ID 정리
   → 참고문헌 자동 연결 (References)
```

### AI 종합 답변
> "KRAS 결정화 조건 비교표입니다 (논문 Table 형식):
>
> | Construct | Precipitant | pH | Temp | Outcome | Resolution | PDB |
> |-----------|------------|-----|------|---------|-----------|-----|
> | G12D 1-169 | PEG 3350 20% | 6.5 | 18°C | Crystal | 1.71Å | 6GOD |
> | G12C 1-169 | PEG 4000 25% | 7.0 | 20°C | Crystal | 1.65Å | 6OIM |
> | G12V 1-169 | AmSO4 2M | 7.5 | 18°C | Crystal | 2.0Å | 4TQ9 |
> | WT 1-189 | PEG 3350 22% | 6.0 | 4°C | Precip | - | - |
>
> 참고문헌:
> [1] Canon et al., Nature, 2019 (DOI: 10.1038/...)
> [2] ..."

---

## 시나리오 7: 실험 계획 코파일럿

### 연구자 질문
> "내일 결정화 실험할 건데, 96-well plate에 넣을 조건 24개를 추천해줘.
> 단백질은 CDK2, 농도 10mg/mL이야."

### AI 추론 과정
```
1. search_proteins("CDK2")
   → 유사 단백질 + 결정화 이력 조회

2. search_crystallization_conditions 반복
   → 성공 조건 집계, 실패 조건 제외

3. recommend_crystallization 반복
   → pH 5-8, 온도 4/18/20°C, 침전제 4종 × 농도 3단계

4. AI 추론: 조건 공간을 균등 커버하는 24조건 설계
   → 성공 확률 높은 순 정렬
   → 다양성 보장 (같은 조건 반복 방지)
```

### AI 종합 답변
> "CDK2 맞춤 24조건 스크린입니다.
>
> **A열 (PEG 3350)**:
> A1: 15% pH 6.0 18°C | A2: 20% pH 6.5 18°C | A3: 25% pH 7.0 18°C
> A4: 15% pH 7.5 18°C | A5: 20% pH 6.5 4°C  | A6: 25% pH 7.0 4°C
>
> **B열 (PEG 4000)**:
> B1-B6: ...
>
> **C열 (AmSO4)**:
> C1-C6: ...
>
> **D열 (MPD + additives)**:
> D1-D6: ...
>
> 예상 성공률: 24조건 중 3-5개 hit (12-21%)
> 상업 스크린(96조건) 대비: 4배 적은 조건으로 동일 히트율"

---

## 시나리오 8: 크로스 도메인 인사이트

### 연구자 질문
> "열안정성이 높은 단백질은 결정화가 더 잘 되나?"

### AI 추론 과정
```
1. search_characterizations(method="thermal_stability")
   → Tm 데이터 있는 단백질 목록

2. 각 단백질의 결정화 성공률 조회:
   search_crystallization_conditions(outcome="single_crystal")
   search_crystallization_conditions(outcome="precipitate")

3. AI 추론: Tm과 결정화 성공률 상관관계 분석
   → Tm > 60°C: 성공률 45%
   → Tm < 40°C: 성공률 12%
   → 통계적 유의성 검정 (p < 0.001)

4. get_experiments(type="expression")
   → Tm 높은 단백질의 발현 수율도 높은지 확인
```

### AI 종합 답변
> "열안정성과 결정화 성공률의 상관관계를 분석했습니다.
>
> **결론: 강한 양의 상관관계 (r=0.67, p<0.001)**
>
> | Tm 범위 | 결정화 성공률 | 데이터 수 |
> |---------|-------------|----------|
> | > 70°C | 52% | 234건 |
> | 50-70°C | 38% | 1,450건 |
> | 40-50°C | 21% | 890건 |
> | < 40°C | 12% | 320건 |
>
> **해석**: 열안정성이 높으면 결정 성장 중 변성 위험 감소.
> **실용 제안**: Tm < 40°C인 단백질은 안정화 변이(예: surface entropy reduction)
> 또는 리간드 복합체로 Tm을 올린 후 결정화 시도 추천.
>
> **이 발견은 논문감입니다**: 7,195건 특성분석 + 1.16M 결정화 데이터 교차 분석"

---

## 시나리오 9: 다기관 공동연구 지원

### 연구자 질문
> "우리 연구실에서 발현 성공한 단백질인데, 다른 연구실에서는 어떤 조건으로 결정화했는지 알려줘."

### AI 추론 과정
```
1. 연구자가 gene_name 또는 서열 제공
2. search_proteins → 해당 단백질 찾기
3. get_experiments(type="crystallization") → 전체 결정화 이력
4. References 연결 → 어떤 연구실(논문)에서 어떤 조건을 사용했는지

5. AI 추론: 연구실별 (논문별) 조건 비교
   → "A 연구실은 PEG 3350, B 연구실은 AmSO4 사용"
   → "A 연구실의 해상도가 더 높음 (1.5 vs 2.3Å)"
```

### AI 종합 답변
> "이 단백질의 결정화 이력을 논문별로 정리했습니다.
>
> | 논문 | 조건 | 결과 | 해상도 |
> |------|------|------|--------|
> | Smith et al. 2020 | PEG 3350 20% pH 6.5 | Crystal | 1.5Å |
> | Lee et al. 2022 | AmSO4 1.8M pH 7.5 | Crystal | 2.3Å |
> | Park et al. 2023 | PEG 4000 22% pH 7.0 | Micro | - |
>
> **추천**: Smith et al.의 조건이 가장 좋은 결과.
> 차이점은 protein concentration (Smith: 15mg/mL vs Lee: 8mg/mL)."

---

## 시나리오 10: AI Scientist 자율 발견

### AI가 스스로 질문하고 답하는 루프

```
AI Scientist:
  "가설: MW 30-50kDa 범위의 단백질이 결정화 성공률이 가장 높을 것이다."

  1. get_statistics() → 전체 데이터 확인
  2. search_crystallization_conditions 반복 (MW별 필터링)
  3. 통계 분석: MW별 성공률 계산

  결과:
    MW 10-30kDa: 성공률 31% (n=45,000)
    MW 30-50kDa: 성공률 28% (n=38,000)
    MW 50-100kDa: 성공률 19% (n=22,000)
    MW >100kDa: 성공률 8% (n=5,000)

  "가설 부분적 지지. MW가 작을수록 결정화 용이.
   30-50kDa가 최적이 아니라 10-30kDa가 최적.
   → 다음 가설: 10-30kDa에서 pI가 영향을 미치는가?"
```

---

## MCP 연동 설정 방법

### claude.ai에서 연결

```json
{
  "mcpServers": {
    "kbsi-protein": {
      "url": "https://kbsi-crystal-bank.vercel.app/api/mcp"
    }
  }
}
```

### 사용 예시 (claude.ai에서)

```
사용자: "KRAS의 결정화 조건을 추천해줘"

Claude: [search_proteins 호출] → [get_experiments 호출] →
        [recommend_crystallization 호출] → 종합 답변
```

---

## 핵심 메시지

> **MCP + LLM의 힘은 "도구를 순서대로 호출하는 것"이 아니라,
> "어떤 도구를 어떤 순서로, 어떤 맥락에서 호출할지 AI가 스스로 판단하는 것"입니다.**
>
> 15개 도구 × AI 추론 능력 = 무한한 분석 시나리오
>
> 연구자는 질문만 하면, AI가 데이터를 탐색하고, 패턴을 발견하고,
> 실험 전략을 제안하고, 논문 테이블까지 생성합니다.
