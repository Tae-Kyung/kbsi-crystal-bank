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

      {/* Stats Section */}
      <section className="py-16 bg-white">
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
