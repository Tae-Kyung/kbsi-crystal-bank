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
            5단계로 시작하는 단백질 결정화 데이터 관리
          </p>

          <div className="mt-12 space-y-0">
            {[
              {
                step: 'Step 1',
                title: '회원가입 및 로그인',
                description: '이메일로 간편하게 가입하고 로그인합니다. 가입 즉시 researcher 권한이 부여되어 데이터 입력이 가능합니다.',
                details: [
                  '상단 "시작하기" 버튼을 클릭합니다.',
                  '이메일과 비밀번호를 입력하여 계정을 생성합니다.',
                  '로그인 후 대시보드로 이동합니다.',
                ],
                link: { href: '/login', label: '로그인 페이지로' },
              },
              {
                step: 'Step 2',
                title: '단백질 및 Construct 등록',
                description: '연구 대상 단백질의 기본 정보를 등록하고, 실험에 사용할 Construct를 설계합니다. 서열 입력 시 분자량(MW)과 등전점(pI)이 자동 계산됩니다.',
                details: [
                  'Proteins 메뉴에서 "New Protein"을 클릭합니다.',
                  '단백질명, 유전자명, 생물종 등 기본 정보를 입력합니다.',
                  '단백질 상세 페이지에서 Construct를 추가합니다 — 잔기 범위, 벡터, 태그 등을 지정합니다.',
                  'UniProt ID를 입력하면 외부 DB에서 서열·기능 정보를 자동으로 가져옵니다.',
                ],
                link: { href: '/proteins/new', label: '단백질 등록하기' },
              },
              {
                step: 'Step 3',
                title: '실험 데이터 기록',
                description: 'Construct별로 발현, 정제, 특성분석, 결정화, 회절, 구조결정 데이터를 단계별로 기록합니다. 실패 데이터도 함께 기록하여 향후 분석에 활용합니다.',
                details: [
                  'Construct 상세 페이지의 "Experiments" 탭으로 이동합니다.',
                  'Expression, Purification, Crystallization 등 각 탭에서 실험 결과를 입력합니다.',
                  '결정화 실험: 침전제 종류·농도, pH, 온도, 결과 등급(clear → diffraction_quality)을 기록합니다.',
                  '각 실험에 attempt_number가 자동 부여되어 반복 실험을 추적할 수 있습니다.',
                ],
                link: { href: '/constructs', label: 'Construct 목록 보기' },
              },
              {
                step: 'Step 4',
                title: 'AI 분석 및 예측 활용',
                description: '축적된 데이터를 기반으로 AI가 결정화 조건을 추천하고 성공 확률을 예측합니다. 논문에서 실험 조건을 자동 추출하여 데이터를 빠르게 확장할 수도 있습니다.',
                details: [
                  '대시보드에서 파이프라인 진행 현황과 성공률 차트를 확인합니다.',
                  'AI 예측: pH, 온도, 침전제 조건을 입력하면 유사 실험 기반 성공 확률을 예측합니다.',
                  'LLM 추출: 논문 텍스트를 붙여넣으면 발현·결정화 조건이 자동 추출됩니다.',
                  '추출된 데이터는 Staging에서 검토 후 승인하면 본 데이터에 통합됩니다.',
                ],
                link: { href: '/dashboard', label: '대시보드 보기' },
              },
              {
                step: 'Step 5',
                title: '데이터 공유 및 Export',
                description: '프로젝트별로 데이터를 관리하고, CSV/JSON 형식으로 내보내어 논문 작성이나 ML 학습에 활용합니다.',
                details: [
                  'Export: 테이블별로 CSV 또는 JSON 형식으로 데이터를 다운로드합니다.',
                  'Import: 기존 실험 데이터를 CSV 파일로 일괄 업로드합니다.',
                  '프로젝트를 생성하여 팀원과 데이터를 공유하고, 역할(owner/member/viewer)별 접근 권한을 관리합니다.',
                  'Audit Log에서 데이터 변경 이력을 추적할 수 있습니다.',
                ],
                link: { href: '/login', label: '시작하기' },
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
