'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LandingNav } from '@/components/layout/landing-nav';
import { type Locale, t, getLocaleFromStorage } from '@/lib/i18n';

const FEATURE_KEYS = [
  { titleKey: 'feature.protein.title' as const, descKey: 'feature.protein.desc' as const, icon: '🧬' },
  { titleKey: 'feature.pipeline.title' as const, descKey: 'feature.pipeline.desc' as const, icon: '🔬' },
  { titleKey: 'feature.ai.title' as const, descKey: 'feature.ai.desc' as const, icon: '🤖' },
  { titleKey: 'feature.llm.title' as const, descKey: 'feature.llm.desc' as const, icon: '📄' },
  { titleKey: 'feature.db.title' as const, descKey: 'feature.db.desc' as const, icon: '🔗' },
  { titleKey: 'feature.export.title' as const, descKey: 'feature.export.desc' as const, icon: '📊' },
];

const FEATURES = [
  {
    title: '단백질·Construct 관리',
    description: '단백질 기본 정보부터 Construct 설계, 서열 분석, MW/pI 자동 계산까지 체계적으로 관리합니다.',
    icon: '🧬',
  },
  {
    title: '실험 파이프라인 추적',
    description: '발현 → 정제 → 특성분석 → 결정화 → 회절 → 구조결정의 전 과정을 한곳에서 기록하고 추적합니다.',
    icon: '🔬',
  },
  {
    title: 'AI 결정화 예측',
    description: 'k-NN 기반 유사 조건 추천과 성공 확률 예측으로 결정화 실험 설계를 지원합니다.',
    icon: '🤖',
  },
  {
    title: 'LLM 문헌 추출',
    description: '논문 텍스트에서 실험 조건을 AI로 자동 추출하고, 검토 후 데이터베이스에 통합합니다.',
    icon: '📄',
  },
  {
    title: '외부 DB 연동',
    description: 'UniProt, PDB, AlphaFold DB와 자동 연동하여 단백질 정보를 즉시 조회합니다.',
    icon: '🔗',
  },
  {
    title: '데이터 시각화·Export',
    description: '파이프라인 현황, 결정화 성공률 차트, CSV/JSON Export로 데이터를 분석·활용합니다.',
    icon: '📊',
  },
];

const PIPELINE_STEPS = [
  { step: '1', label: 'Expression', desc: '발현' },
  { step: '2', label: 'Purification', desc: '정제' },
  { step: '3', label: 'Characterization', desc: '특성분석' },
  { step: '4', label: 'Crystallization', desc: '결정화' },
  { step: '5', label: 'Diffraction', desc: '회절' },
  { step: '6', label: 'Structure', desc: '구조결정' },
];

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>('ko');

  useEffect(() => {
    setLocale(getLocaleFromStorage());
  }, []);

  const pipelineSteps = [
    { step: '1', label: 'Expression', desc: t('pipeline.expression', locale) },
    { step: '2', label: 'Purification', desc: t('pipeline.purification', locale) },
    { step: '3', label: 'Characterization', desc: t('pipeline.characterization', locale) },
    { step: '4', label: 'Crystallization', desc: t('pipeline.crystallization', locale) },
    { step: '5', label: 'Diffraction', desc: t('pipeline.diffraction', locale) },
    { step: '6', label: 'Structure', desc: t('pipeline.structure', locale) },
  ];

  return (
    <div className="min-h-screen">
      <LandingNav onLocaleChange={setLocale} />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950 py-20 md:py-32">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div className="mb-6 inline-block rounded-full bg-blue-100 dark:bg-blue-900 px-4 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300">
            {t('hero.badge', locale)}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white md:text-6xl">
            {t('hero.title1', locale)}
            <br />
            <span className="text-blue-600">{t('hero.title2', locale)}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400 md:text-xl">
            {t('hero.desc', locale)}
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/login">
              <Button size="lg" className="px-8 text-base">
                {t('hero.start', locale)}
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="px-8 text-base">
                {t('hero.dashboard', locale)}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Pipeline Section */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            {t('pipeline.title', locale)}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-500 dark:text-gray-400">
            {t('pipeline.desc', locale)}
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-2 md:gap-0">
            {pipelineSteps.map((s, i) => (
              <div key={s.step} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                    {s.step}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{s.label}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{s.desc}</div>
                </div>
                {i < pipelineSteps.length - 1 && (
                  <div className="mx-2 hidden h-0.5 w-8 bg-blue-300 md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            {t('features.title', locale)}
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURE_KEYS.map((f) => (
              <div
                key={f.titleKey}
                className="rounded-xl border bg-white dark:bg-gray-800 dark:border-gray-700 p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 text-3xl">{f.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t(f.titleKey, locale)}</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t(f.descKey, locale)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tutorial Section */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            {t('tutorial.title', locale)}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-500 dark:text-gray-400">
            {t('tutorial.subtitle', locale)}
          </p>

          <div className="mt-12 space-y-0">
            {[
              {
                step: 'Step 1',
                title: '회원가입 및 로그인',
                description: '이메일로 간편하게 가입하고 로그인합니다. 가입 즉시 researcher 권한이 부여되어 데이터 입력이 가능합니다.',
                details: [
                  '상단 "시작하기" 버튼을 클릭하여 로그인 페이지로 이동합니다.',
                  '이메일(예: researcher@kbsi.re.kr)과 비밀번호를 입력하여 계정을 생성합니다.',
                  '로그인하면 좌측 사이드바가 있는 대시보드 화면으로 이동합니다.',
                ],
                link: { href: '/login', label: '로그인 페이지로' },
              },
              {
                step: 'Step 2',
                title: '단백질 등록 — KRAS 예시',
                description: '신약 타겟으로 많이 연구되는 KRAS 단백질을 등록해봅니다.',
                details: [
                  '좌측 사이드바에서 Proteins 메뉴를 클릭하고, "New Protein" 버튼을 누릅니다.',
                  'Full Name: Kirsten Rat Sarcoma Viral Proto-Oncogene',
                  'Abbreviation: KRAS',
                  'Gene Name: KRAS',
                  'Organism: Homo sapiens',
                  '"Save"를 클릭하면 단백질이 등록되고 상세 페이지로 이동합니다.',
                ],
                link: { href: '/proteins/new', label: '단백질 등록하기' },
                example: {
                  title: 'Construct 추가 예시',
                  fields: [
                    { label: 'Name', value: 'KRAS-G12D-1-169' },
                    { label: 'Residues', value: '1-169' },
                    { label: 'Type', value: 'truncation' },
                    { label: 'Vector', value: 'pET-28a' },
                    { label: 'Tag', value: 'His6 (N-terminal)' },
                    { label: 'Expression System', value: 'E. coli BL21(DE3)' },
                  ],
                },
              },
              {
                step: 'Step 3',
                title: '실험 데이터 기록 — 발현부터 결정화까지',
                description: 'KRAS-G12D Construct의 발현, 정제, 결정화 실험 결과를 기록합니다. 성공뿐 아니라 실패 데이터도 함께 기록하는 것이 핵심입니다.',
                details: [
                  'Construct 상세 페이지에서 "Experiments" 탭을 클릭합니다.',
                ],
                link: { href: '/constructs', label: 'Construct 목록 보기' },
                experiments: [
                  {
                    name: 'Expression (발현)',
                    fields: [
                      { label: 'Host', value: 'E. coli' },
                      { label: 'Strain', value: 'BL21(DE3)' },
                      { label: 'Induction Temp', value: '18°C' },
                      { label: 'Yield', value: '15.5 mg/L' },
                      { label: 'Result Level', value: 'high' },
                      { label: 'Conditions', value: 'IPTG 0.5mM, 18°C, 16h' },
                    ],
                  },
                  {
                    name: 'Purification (정제)',
                    fields: [
                      { label: 'Method', value: 'Ni-NTA → TEV cleavage → SEC' },
                      { label: 'Final Purity', value: '95%' },
                      { label: 'Yield', value: '8 mg' },
                      { label: 'Result Level', value: 'high' },
                    ],
                  },
                  {
                    name: 'Crystallization (결정화) — 성공',
                    fields: [
                      { label: 'Protein Conc.', value: '10 mg/mL' },
                      { label: 'Precipitant', value: 'PEG 3350, 20%' },
                      { label: 'Buffer / pH', value: 'Bis-Tris / 6.5' },
                      { label: 'Temperature', value: '18°C' },
                      { label: 'Outcome', value: 'single_crystal' },
                      { label: 'Days to Crystal', value: '7일' },
                    ],
                  },
                  {
                    name: 'Crystallization (결정화) — 실패',
                    fields: [
                      { label: 'Protein Conc.', value: '10 mg/mL' },
                      { label: 'Precipitant', value: 'Ammonium Sulfate, 2M' },
                      { label: 'Buffer / pH', value: 'HEPES / 7.5' },
                      { label: 'Temperature', value: '18°C' },
                      { label: 'Outcome', value: 'precipitate' },
                      { label: 'Notes', value: '즉시 침전 발생' },
                    ],
                  },
                ],
              },
              {
                step: 'Step 4',
                title: 'AI 분석 — 대시보드, 조건 추천, 성공 확률 예측',
                description: '축적된 결정화 데이터를 3가지 방식으로 분석합니다: 대시보드 시각화, k-NN 기반 유사 조건 추천, 그리고 성공 확률 예측.',
                details: [
                  '대시보드 — Pipeline Funnel 차트로 발현→구조결정 전체 진행률을 확인합니다. Outcome 분포 차트에서 clear/precipitate/single_crystal 등 결정화 결과 비율을 봅니다. pH×온도 Scatter Plot으로 성공/실패 조건 분포를 파악합니다.',
                  '조건 추천 API — 새로운 결정화 실험 전에 유사 조건에서의 과거 결과를 k-NN으로 검색합니다. 성공 조건(single_crystal 이상)만 필터링하여 추천합니다.',
                  '성공 확률 예측 API — 계획 중인 조건을 입력하면 과거 데이터 기반 성공 확률(%)을 예측합니다. 데이터가 50건 이상이면 high confidence, 20건 이상이면 medium, 그 이하는 low입니다.',
                ],
                link: { href: '/dashboard', label: '대시보드 보기' },
                experiments: [
                  {
                    name: '1. 조건 추천 (GET /api/recommend)',
                    fields: [
                      { label: 'URL 예시', value: '/api/recommend?ph=7.0&temperature=18&precipitant_type=PEG 3350&k=5' },
                      { label: '파라미터', value: 'ph, temperature, precipitant_type, precipitant_conc, protein_concentration, additive, k' },
                      { label: '응답 — success_rate', value: '유사 실험 중 성공(single_crystal 이상) 비율 (%)' },
                      { label: '응답 — recommendations', value: '성공한 이웃 실험의 상세 조건 목록' },
                      { label: '응답 — nearest_neighbors', value: 'k개 최근접 이웃 실험 (distance 포함)' },
                    ],
                  },
                  {
                    name: '2. 성공 확률 예측 (POST /api/predict)',
                    fields: [
                      { label: 'Body 예시', value: '{ "ph": 7.0, "temperature": 20, "precipitant_type": "PEG 4000", "precipitant_conc": 25 }' },
                      { label: '응답 — success_probability', value: '0~100% 성공 확률' },
                      { label: '응답 — confidence', value: 'high(50건+) / medium(20건+) / low(5건+)' },
                      { label: '응답 — outcome_distribution', value: '이웃 실험의 outcome별 개수 (clear: 2, single_crystal: 3, ...)' },
                      { label: '응답 — best_match', value: '가장 유사한 성공 사례의 상세 조건' },
                    ],
                  },
                  {
                    name: '3. 대시보드 차트 3종',
                    fields: [
                      { label: 'Pipeline Funnel', value: 'Expression → Purification → Crystallization → Structure 단계별 건수' },
                      { label: 'Outcome Distribution', value: 'clear, precipitate, phase_separation, microcrystal, single_crystal, diffraction_quality 비율' },
                      { label: 'pH×Temperature Scatter', value: '결정화 조건 분포 — 성공/실패 결과별 색상 구분' },
                    ],
                  },
                ],
                example: {
                  title: 'KRAS 예제: 다음 결정화 실험 계획',
                  fields: [
                    { label: '시나리오', value: 'PEG 3350 20%/pH 6.5/18°C에서 single_crystal 성공 → 최적화 조건 탐색' },
                    { label: '추천 API 호출', value: '/api/recommend?ph=6.5&temperature=18&precipitant_type=PEG 3350&k=10' },
                    { label: '예측 API 호출', value: 'POST /api/predict → { "ph": 7.0, "temperature": 20, "precipitant_type": "PEG 4000", "precipitant_conc": 25 }' },
                    { label: '예상 결과', value: 'success_probability: 60%, confidence: medium, best_match: PEG 3350 pH 6.5 18°C' },
                  ],
                },
                aiResult: '→ k-NN 알고리즘이 유클리드 거리 기반으로 가장 유사한 과거 실험을 찾고, single_crystal/diffraction_quality 비율로 성공 확률을 계산합니다. 데이터가 쌓일수록 예측 정확도가 향상됩니다.',
              },
              {
                step: 'Step 5',
                title: 'LLM 문헌 추출, 검토, 데이터 Import/Export',
                description: '논문에서 실험 조건을 AI로 자동 추출하고, 사람이 검토한 후 본 데이터에 통합합니다. 축적된 데이터는 CSV/JSON으로 내보내거나, 기존 데이터를 CSV로 일괄 업로드합니다.',
                details: [
                  '5-1. LLM 추출 — 좌측 Staging Review 메뉴를 클릭하고, 우측 상단 "Extract from Paper" 버튼을 누릅니다. 추출 다이얼로그가 열립니다.',
                  '5-2. DOI 입력(선택) — 논문 DOI를 입력하면 CrossRef API에서 제목/저자/저널을 자동으로 가져와 참조(Reference)를 생성합니다.',
                  '5-3. Target Table 선택 — 추출할 데이터 유형을 선택합니다: kbsi_expression(발현), kbsi_purification(정제), kbsi_crystallization(결정화).',
                  '5-4. 논문 텍스트 붙여넣기 — Methods 섹션 또는 관련 텍스트를 Paper Text 영역에 붙여넣고 "Extract" 버튼을 클릭합니다.',
                  '5-5. 검토 — 추출된 데이터가 Staging의 Pending 탭에 나타납니다. 원문 스니펫과 추출값을 비교한 후 Approve(승인) 또는 Reject(거부)합니다.',
                  '5-6. 승인 시 — 본 테이블(예: kbsi_expression)에 자동 이관됩니다.',
                ],
                link: { href: '/staging', label: 'Staging Review' },
                experiments: [
                  {
                    name: '실습: KRAS 논문 텍스트로 추출하기',
                    fields: [
                      { label: 'Target Table', value: 'kbsi_expression' },
                      { label: 'DOI (선택)', value: '10.1016/j.jmb.2024.168456' },
                      { label: 'Paper Text', value: '아래 예시 텍스트를 복사하여 붙여넣기 →' },
                    ],
                  },
                  {
                    name: '실습: 결정화 조건 추출하기',
                    fields: [
                      { label: 'Target Table', value: 'kbsi_crystallization' },
                      { label: 'Paper Text', value: '아래 예시 텍스트를 복사하여 붙여넣기 →' },
                      { label: '추출 결과 예시', value: 'precipitant_type: PEG 3350, ph: 6.5, temperature: 18, outcome: single_crystal' },
                    ],
                  },
                ],
                example: {
                  title: '복사해서 사용할 논문 텍스트 예시',
                  text: 'KRAS G12D (residues 1-169) was cloned into pET-28a with an N-terminal His6 tag and expressed in E. coli BL21(DE3). Cells were grown at 37°C and induced with 0.5 mM IPTG at 18°C for 16 hours. The protein was purified by Ni-NTA affinity chromatography followed by TEV protease cleavage and size exclusion chromatography (Superdex 75), yielding 15 mg of >95% pure protein per liter of culture. Crystallization was performed by hanging-drop vapor diffusion at 18°C. Diffraction-quality crystals appeared in 7 days from 20% PEG 3350, 0.1 M Bis-Tris pH 6.5 with a protein concentration of 10 mg/mL. A second screen with 2 M ammonium sulfate, 0.1 M HEPES pH 7.5 resulted in immediate precipitation.',
                },
                exportExample: {
                  title: 'Data Export / Import',
                  items: [
                    'CSV Export: /api/export?table=kbsi_crystallization&format=csv → 결정화 데이터 CSV 다운로드',
                    'JSON Export: /api/export?table=kbsi_protein&format=json → 단백질 데이터 JSON 다운로드',
                    'Construct 필터: /api/export?table=kbsi_expression&construct_id=1&format=csv → 특정 Construct의 발현 데이터만',
                    'CSV Import: POST /api/import (FormData: table=kbsi_protein, file=data.csv) → 기존 데이터 일괄 업로드',
                    '지원 테이블: kbsi_protein, kbsi_construct, kbsi_expression, kbsi_purification, kbsi_crystallization, kbsi_characterization',
                  ],
                },
              },
            ].map((tutorial, i) => (
              <div key={tutorial.step} className="relative flex gap-6 pb-12 last:pb-0">
                {/* Timeline line */}
                {i < 4 && (
                  <div className="absolute left-5 top-12 h-full w-0.5 bg-blue-200" />
                )}
                {/* Step circle */}
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {i + 1}
                </div>
                {/* Content */}
                <div className="flex-1 rounded-xl border bg-gray-50 p-6">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      {tutorial.step}
                    </span>
                    <h3 className="text-lg font-semibold text-gray-900">{tutorial.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    {tutorial.description}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {tutorial.details.map((detail, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                        {detail}
                      </li>
                    ))}
                  </ul>

                  {/* Example fields table */}
                  {'example' in tutorial && tutorial.example && 'fields' in tutorial.example && (
                    <div className="mt-4 rounded-lg border bg-white p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                        {tutorial.example.title}
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                        {(tutorial.example.fields as { label: string; value: string }[])?.map((f, k) => (
                          <div key={k} className="flex gap-2">
                            <span className="text-gray-500 shrink-0">{f.label}:</span>
                            <span className="font-medium text-gray-900">{f.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Example text block */}
                  {'example' in tutorial && tutorial.example && 'text' in tutorial.example && (
                    <div className="mt-4 rounded-lg border bg-white p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                        {tutorial.example.title}
                      </h4>
                      <p className="text-sm text-gray-700 italic leading-relaxed bg-gray-50 p-3 rounded border-l-2 border-blue-400">
                        {tutorial.example.text}
                      </p>
                    </div>
                  )}

                  {/* Experiment cards */}
                  {'experiments' in tutorial && tutorial.experiments && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {tutorial.experiments.map((exp: { name: string; fields: { label: string; value: string }[] }, k: number) => (
                        <div key={k} className="rounded-lg border bg-white p-4">
                          <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full ${exp.name.includes('실패') ? 'bg-red-400' : 'bg-green-400'}`} />
                            {exp.name}
                          </h4>
                          <div className="space-y-1 text-xs">
                            {exp.fields.map((f, l) => (
                              <div key={l} className="flex gap-2">
                                <span className="text-gray-500 shrink-0 w-28">{f.label}:</span>
                                <span className="font-medium text-gray-800">{f.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI result note */}
                  {'aiResult' in tutorial && tutorial.aiResult && (
                    <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <p className="text-sm text-blue-800 font-medium">{tutorial.aiResult}</p>
                    </div>
                  )}

                  {/* Export example */}
                  {'exportExample' in tutorial && tutorial.exportExample && (
                    <div className="mt-4 rounded-lg border bg-white p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                        {tutorial.exportExample.title}
                      </h4>
                      <div className="space-y-1.5">
                        {tutorial.exportExample.items.map((item: string, k: number) => (
                          <p key={k} className="text-xs font-mono text-gray-700 bg-gray-50 p-2 rounded">
                            {item}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <Link href={tutorial.link.href}>
                      <Button variant="outline" size="sm">
                        {tutorial.link.label} &rarr;
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: '21+', labelKey: 'stats.tables' as const },
              { value: '6', labelKey: 'stats.stages' as const },
              { value: '3', labelKey: 'stats.db' as const },
              { value: 'AI', labelKey: 'stats.ai' as const },
            ].map((stat) => (
              <div key={stat.labelKey} className="text-center">
                <div className="text-3xl font-bold text-blue-600 md:text-4xl">{stat.value}</div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(stat.labelKey, locale)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-blue-600">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            {t('cta.title', locale)}
          </h2>
          <p className="mt-4 text-blue-100">
            {t('cta.desc', locale)}
          </p>
          <div className="mt-8">
            <Link href="/login">
              <Button size="lg" variant="secondary" className="px-8 text-base">
                {t('cta.button', locale)}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white dark:bg-gray-950 dark:border-gray-800 py-8">
        <div className="mx-auto max-w-5xl px-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>&copy; {new Date().getFullYear()} {t('footer.org', locale)}. All rights reserved.</p>
          <p className="mt-1">{t('footer.desc', locale)}</p>
        </div>
      </footer>
    </div>
  );
}
