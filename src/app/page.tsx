'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LandingNav } from '@/components/layout/landing-nav';
import { type Locale, t, getLocaleFromStorage } from '@/lib/i18n';
import { UseCaseScenarios } from '@/components/landing/use-case-scenarios';
import { DataStory } from '@/components/landing/data-story';

const FEATURE_KEYS = [
  { titleKey: 'feature.protein.title' as const, descKey: 'feature.protein.desc' as const, icon: '🧬' },
  { titleKey: 'feature.pipeline.title' as const, descKey: 'feature.pipeline.desc' as const, icon: '🔬' },
  { titleKey: 'feature.ai.title' as const, descKey: 'feature.ai.desc' as const, icon: '🤖' },
  { titleKey: 'feature.llm.title' as const, descKey: 'feature.llm.desc' as const, icon: '📄' },
  { titleKey: 'feature.db.title' as const, descKey: 'feature.db.desc' as const, icon: '🔗' },
  { titleKey: 'feature.export.title' as const, descKey: 'feature.export.desc' as const, icon: '📊' },
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

      {/* Data Story Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            데이터의 여정 — 단백질에서 신약까지
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-500 dark:text-gray-400">
            단백질 구조 연구의 전 과정이 하나의 데이터베이스에서 어떻게 연결되는지 알아보세요
          </p>
          <div className="mt-10">
            <DataStory />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 bg-white dark:bg-gray-950">
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

      {/* Why This Database — PDB vs KBSI */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            기존 DB와의 차별점
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-500 dark:text-gray-400">
            PDB는 성공한 구조만 저장합니다. KBSI 결정화은행은 다릅니다.
          </p>
          <div className="mt-10 overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">항목</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">PDB</th>
                  <th className="px-6 py-3 text-left font-medium text-blue-600">KBSI 결정화은행</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="px-6 py-3 text-gray-700 dark:text-gray-300">실패 데이터</td><td className="px-6 py-3 text-gray-400">없음</td><td className="px-6 py-3 font-medium text-blue-700 dark:text-blue-300">927K건 체계적 축적</td></tr>
                <tr><td className="px-6 py-3 text-gray-700 dark:text-gray-300">AI 예측</td><td className="px-6 py-3 text-gray-400">불가</td><td className="px-6 py-3 font-medium text-blue-700 dark:text-blue-300">91.9% 정확도 (k-NN)</td></tr>
                <tr><td className="px-6 py-3 text-gray-700 dark:text-gray-300">자연어 검색</td><td className="px-6 py-3 text-gray-400">없음</td><td className="px-6 py-3 font-medium text-blue-700 dark:text-blue-300">MCP + AI 챗봇</td></tr>
                <tr><td className="px-6 py-3 text-gray-700 dark:text-gray-300">약물 바인딩</td><td className="px-6 py-3 text-gray-400">별도 DB</td><td className="px-6 py-3 font-medium text-blue-700 dark:text-blue-300">7,942건 통합 조회</td></tr>
                <tr><td className="px-6 py-3 text-gray-700 dark:text-gray-300">외부 DB 연동</td><td className="px-6 py-3 text-gray-400">PDB만</td><td className="px-6 py-3 font-medium text-blue-700 dark:text-blue-300">12개 DB 원클릭 연결</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* External DB Integration */}
      <section className="py-12 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">12개 외부 데이터베이스 연동</h3>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            {['RCSB PDB', 'UniProt', 'AlphaFold', 'NCBI Gene', 'PubMed', 'ChEMBL', 'PubChem', 'InterPro', 'STRING', 'EMDB', 'BMRB', 'TargetTrack'].map(db => (
              <span key={db} className="rounded-full border bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">{db}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Use Case Scenarios */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            {t('tutorial.title', locale)}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-500 dark:text-gray-400">
            실제 데이터 기반 8가지 활용 시나리오 — PDB Import, 실험 기록, AI 예측, 논문 추출, 챗봇, MCP 연동까지
          </p>
          <div className="mt-12">
            <UseCaseScenarios />
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
