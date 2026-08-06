import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white py-20 md:py-32">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div className="mb-6 inline-block rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700">
            KBSI 한국기초과학지원연구원
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 md:text-6xl">
            단백질 결정화은행
            <br />
            <span className="text-blue-600">AI 데이터 허브</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 md:text-xl">
            단백질의 발현부터 구조결정까지, 전 과정의 실험 데이터를 체계적으로 관리하고
            AI 기반 결정화 조건 예측으로 신약개발 연구를 가속화합니다.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/login">
              <Button size="lg" className="px-8 text-base">
                시작하기
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="px-8 text-base">
                대시보드 보기
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Pipeline Section */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 md:text-3xl">
            실험 파이프라인 전 과정을 한 플랫폼에서
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-500">
            실패 데이터를 포함한 모든 실험 기록을 체계적으로 축적하여 데이터 기반 연구를 지원합니다.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-2 md:gap-0">
            {PIPELINE_STEPS.map((s, i) => (
              <div key={s.step} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                    {s.step}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900">{s.label}</div>
                  <div className="text-xs text-gray-500">{s.desc}</div>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="mx-2 hidden h-0.5 w-8 bg-blue-300 md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 md:text-3xl">
            주요 기능
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 text-3xl">{f.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tutorial Section */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 md:text-3xl">
            사용 가이드
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-500">
            KRAS 단백질을 예시로 따라하는 결정화 데이터 관리
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
                title: 'AI 예측 — 다음 실험 조건 추천받기',
                description: '축적된 결정화 데이터를 기반으로 AI가 최적 조건을 추천합니다. 아래 조건을 입력해보세요.',
                details: [
                  '대시보드에서 파이프라인 현황과 결정화 성공률 차트를 확인합니다.',
                ],
                link: { href: '/dashboard', label: '대시보드 보기' },
                example: {
                  title: 'AI 예측 입력 예시',
                  fields: [
                    { label: 'Protein Conc.', value: '12 mg/mL' },
                    { label: 'Precipitant', value: 'PEG 4000' },
                    { label: 'Precipitant Conc.', value: '25%' },
                    { label: 'pH', value: '7.0' },
                    { label: 'Temperature', value: '20°C' },
                  ],
                },
                aiResult: '→ AI가 유사 실험 데이터를 분석하여 성공 확률과 추천 조건을 제시합니다.',
              },
              {
                step: 'Step 5',
                title: '문헌 추출 및 데이터 Export',
                description: '논문 텍스트에서 실험 조건을 AI로 자동 추출하고, 축적된 데이터를 CSV/JSON으로 내보냅니다.',
                details: [
                  'Staging Review 메뉴에서 논문 텍스트를 붙여넣고 "Extract" 버튼을 클릭합니다.',
                ],
                link: { href: '/staging', label: 'Staging Review' },
                example: {
                  title: 'LLM 추출 입력 예시 (논문 텍스트)',
                  text: '"KRAS G12D (residues 1-169) was expressed in E. coli BL21(DE3) at 18°C with 0.5 mM IPTG. The protein was purified using Ni-NTA followed by size exclusion chromatography. Crystals were obtained in 20% PEG 3350, 0.1 M Bis-Tris pH 6.5 at 18°C."',
                },
                exportExample: {
                  title: 'Export 예시',
                  items: [
                    'GET /api/export?table=kbsi_crystallization&format=csv → CSV 다운로드',
                    'GET /api/export?table=kbsi_protein&format=json → JSON 다운로드',
                    'construct_id 필터: /api/export?table=kbsi_expression&construct_id=1&format=csv',
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
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: '21+', label: '데이터 테이블' },
              { value: '6', label: '실험 단계' },
              { value: '3', label: '외부 DB 연동' },
              { value: 'AI', label: '결정화 예측' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-blue-600 md:text-4xl">{stat.value}</div>
                <div className="mt-1 text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-blue-600">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            데이터 기반 단백질 연구를 시작하세요
          </h2>
          <p className="mt-4 text-blue-100">
            KBSI 단백질 결정화은행 데이터 플랫폼으로 실험 효율을 높이고, AI 예측으로 최적의 결정화 조건을 찾아보세요.
          </p>
          <div className="mt-8">
            <Link href="/login">
              <Button size="lg" variant="secondary" className="px-8 text-base">
                무료로 시작하기
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white py-8">
        <div className="mx-auto max-w-5xl px-6 text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} KBSI 한국기초과학지원연구원. All rights reserved.</p>
          <p className="mt-1">단백질 결정화은행 기반 신약개발 AI 데이터 허브</p>
        </div>
      </footer>
    </div>
  );
}
