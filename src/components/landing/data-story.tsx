'use client';

import { cn } from '@/lib/utils';

const STORY_STEPS = [
  {
    icon: '🧬',
    title: '단백질',
    count: '54,000+',
    color: 'bg-blue-500',
    borderColor: 'border-blue-200 dark:border-blue-800',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    role: '주인공',
    desc: '암을 일으키는 KRAS, 바이러스의 Mpro 같은 단백질. 이 단백질의 3D 구조를 알아내서 딱 맞는 약을 설계하고 싶습니다.',
    detail: '모든 이야기의 시작점입니다.',
    arrow: true,
  },
  {
    icon: '🧪',
    title: 'Construct',
    count: '184,000+',
    color: 'bg-violet-500',
    borderColor: 'border-violet-200 dark:border-violet-800',
    bgColor: 'bg-violet-50 dark:bg-violet-950',
    role: '실험용 버전',
    desc: '같은 KRAS라도 태그, 벡터, 잔기 범위, 변이가 다르면 결과가 완전히 달라집니다. 그래서 모든 실험은 Construct에 귀속됩니다.',
    detail: 'KRAS-G12D-1-169, KRAS-FL, KRAS-G12C... 하나의 단백질에서 여러 버전을 만듭니다.',
    arrow: true,
  },
  {
    icon: '💎',
    title: '결정화',
    count: '144,000+',
    color: 'bg-emerald-500',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    role: '수많은 시도',
    desc: 'pH, 온도, 침전제를 바꿔가며 결정을 키웁니다. 성공보다 실패가 훨씬 많습니다.',
    detail: '실패 데이터도 기록하는 것이 핵심 — AI가 "이 조건은 실패할 거야"라고 예측하려면 실패 사례가 필요합니다.',
    examples: [
      { condition: 'PEG 3350 20%, pH 6.5, 18°C', result: 'single_crystal', success: true },
      { condition: 'AmSO₄ 2M, pH 7.5, 18°C', result: 'precipitate', success: false },
    ],
    arrow: true,
  },
  {
    icon: '🔬',
    title: '구조',
    count: '184,000+',
    color: 'bg-amber-500',
    borderColor: 'border-amber-200 dark:border-amber-800',
    bgColor: 'bg-amber-50 dark:bg-amber-950',
    role: '3D 설계도',
    desc: '결정에 X-ray를 쏘거나, 전자현미경(Cryo-EM)으로 보거나, NMR로 분석하여 원자 수준의 3D 구조를 얻습니다.',
    detail: '이 구조가 있어야 약물이 단백질 어디에 달라붙는지 알 수 있습니다.',
    arrow: true,
  },
  {
    icon: '💊',
    title: '리간드',
    count: '6,300+',
    color: 'bg-pink-500',
    borderColor: 'border-pink-200 dark:border-pink-800',
    bgColor: 'bg-pink-50 dark:bg-pink-950',
    role: '약물 후보',
    desc: '3D 구조를 바탕으로 이 단백질에 결합하는 약물 후보 물질을 탐색합니다.',
    detail: 'Sotorasib(KRAS G12C 최초 승인 약물), Gefitinib(EGFR 억제제) 등',
    arrow: true,
  },
  {
    icon: '🔗',
    title: '바인딩',
    count: '7,900+',
    color: 'bg-rose-500',
    borderColor: 'border-rose-200 dark:border-rose-800',
    bgColor: 'bg-rose-50 dark:bg-rose-950',
    role: '약효 측정',
    desc: '약물이 단백질에 얼마나 강하게 결합하는지 측정합니다 (IC50, Kd, Ki).',
    detail: '같은 약이라도 Construct(변이체)에 따라 결합력이 완전히 다릅니다 — Construct 중심 설계의 이유입니다.',
    examples: [
      { condition: 'KRAS-G12C + Sotorasib', result: 'IC50: 7.2 nM', success: true },
      { condition: 'KRAS-G12D + Sotorasib', result: 'IC50: 15,000 nM', success: false },
    ],
    arrow: false,
  },
];

export function DataStory() {
  return (
    <div className="space-y-6">
      {/* Relationship diagram */}
      <div className="rounded-2xl border bg-white dark:bg-gray-800 dark:border-gray-700 p-6 overflow-x-auto">
        <div className="flex items-center justify-center gap-1 md:gap-2 min-w-[600px]">
          {STORY_STEPS.map((step, i) => (
            <div key={step.title} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl text-xl', step.bgColor)}>
                  {step.icon}
                </div>
                <div className="mt-1.5 text-xs font-bold text-gray-900 dark:text-white">{step.title}</div>
                <div className="text-[10px] text-gray-500">{step.count}</div>
              </div>
              {step.arrow && (
                <div className="mx-1 flex flex-col items-center">
                  <div className="text-gray-300 dark:text-gray-600 text-lg">→</div>
                  <div className="text-[9px] text-gray-400">1:N</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Story cards */}
      <div className="space-y-4">
        {STORY_STEPS.map((step, i) => (
          <div key={step.title} className={cn('rounded-xl border p-5', step.borderColor, step.bgColor)}>
            <div className="flex items-start gap-4">
              <div className="text-3xl">{step.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{step.title}</h3>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium text-white', step.color)}>{step.role}</span>
                  <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{step.count}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{step.desc}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">{step.detail}</p>

                {step.examples && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {step.examples.map((ex, j) => (
                      <div
                        key={j}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-xs border',
                          ex.success
                            ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                            : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                        )}
                      >
                        <span className="font-medium">{ex.condition}</span>
                        <span className="mx-1.5">→</span>
                        <span>{ex.result} {ex.success ? '✓' : '✗'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 p-5 text-center">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 leading-relaxed">
          <strong>단백질의 Construct를 만들고</strong> → <strong>결정을 키우고 (실패도 기록)</strong> → <strong>3D 구조를 풀고</strong> → <strong>거기에 붙는 약을 찾는다</strong>
        </p>
        <p className="mt-2 text-xs text-blue-600 dark:text-blue-300">
          이 전체 과정을 하나의 DB에서 추적하고, AI로 예측하는 것이 KBSI 결정화은행입니다.
        </p>
      </div>
    </div>
  );
}
