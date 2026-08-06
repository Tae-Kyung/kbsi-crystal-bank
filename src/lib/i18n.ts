export type Locale = 'ko' | 'en' | 'zh';

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
};

const translations = {
  // Landing page
  'hero.badge': { ko: 'KBSI 한국기초과학지원연구원', en: 'KBSI Korea Basic Science Institute', zh: 'KBSI 韩国基础科学支援研究院' },
  'hero.title1': { ko: '단백질 결정화은행', en: 'Protein Crystallization Bank', zh: '蛋白质结晶银行' },
  'hero.title2': { ko: 'AI 데이터 허브', en: 'AI Data Hub', zh: 'AI 数据中心' },
  'hero.desc': {
    ko: '단백질의 발현부터 구조결정까지, 전 과정의 실험 데이터를 체계적으로 관리하고 AI 기반 결정화 조건 예측으로 신약개발 연구를 가속화합니다.',
    en: 'Systematically manage experimental data from expression to structure determination, and accelerate drug discovery with AI-based crystallization condition prediction.',
    zh: '系统管理从表达到结构测定的全过程实验数据，通过AI预测结晶条件加速新药研发。',
  },
  'hero.start': { ko: '시작하기', en: 'Get Started', zh: '开始使用' },
  'hero.dashboard': { ko: '대시보드 보기', en: 'View Dashboard', zh: '查看仪表板' },

  // Pipeline
  'pipeline.title': { ko: '실험 파이프라인 전 과정을 한 플랫폼에서', en: 'Full experimental pipeline in one platform', zh: '一个平台管理全部实验流程' },
  'pipeline.desc': {
    ko: '실패 데이터를 포함한 모든 실험 기록을 체계적으로 축적하여 데이터 기반 연구를 지원합니다.',
    en: 'Systematically accumulate all experimental records including failure data to support data-driven research.',
    zh: '系统积累包括失败数据在内的所有实验记录，支持数据驱动的研究。',
  },
  'pipeline.expression': { ko: '발현', en: 'Expression', zh: '表达' },
  'pipeline.purification': { ko: '정제', en: 'Purification', zh: '纯化' },
  'pipeline.characterization': { ko: '특성분석', en: 'Characterization', zh: '表征' },
  'pipeline.crystallization': { ko: '결정화', en: 'Crystallization', zh: '结晶' },
  'pipeline.diffraction': { ko: '회절', en: 'Diffraction', zh: '衍射' },
  'pipeline.structure': { ko: '구조결정', en: 'Structure', zh: '结构测定' },

  // Features
  'features.title': { ko: '주요 기능', en: 'Key Features', zh: '主要功能' },
  'feature.protein.title': { ko: '단백질·Construct 관리', en: 'Protein & Construct Management', zh: '蛋白质·构建体管理' },
  'feature.protein.desc': {
    ko: '단백질 기본 정보부터 Construct 설계, 서열 분석, MW/pI 자동 계산까지 체계적으로 관리합니다.',
    en: 'Manage protein info, construct design, sequence analysis, and auto-calculated MW/pI.',
    zh: '系统管理蛋白质信息、构建体设计、序列分析及自动计算MW/pI。',
  },
  'feature.pipeline.title': { ko: '실험 파이프라인 추적', en: 'Experiment Pipeline Tracking', zh: '实验流程追踪' },
  'feature.pipeline.desc': {
    ko: '발현 → 정제 → 특성분석 → 결정화 → 회절 → 구조결정의 전 과정을 한곳에서 기록하고 추적합니다.',
    en: 'Track the full pipeline from expression to structure determination in one place.',
    zh: '在一处记录和追踪从表达到结构测定的全过程。',
  },
  'feature.ai.title': { ko: 'AI 결정화 예측', en: 'AI Crystallization Prediction', zh: 'AI结晶预测' },
  'feature.ai.desc': {
    ko: 'k-NN 기반 유사 조건 추천과 성공 확률 예측으로 결정화 실험 설계를 지원합니다.',
    en: 'Support experiment design with k-NN based condition recommendations and success probability prediction.',
    zh: '通过k-NN相似条件推荐和成功概率预测支持结晶实验设计。',
  },
  'feature.llm.title': { ko: 'LLM 문헌 추출', en: 'LLM Literature Extraction', zh: 'LLM文献提取' },
  'feature.llm.desc': {
    ko: '논문 텍스트에서 실험 조건을 AI로 자동 추출하고, 검토 후 데이터베이스에 통합합니다.',
    en: 'Auto-extract experimental conditions from papers with AI, review and integrate into database.',
    zh: '通过AI从论文中自动提取实验条件，审核后整合到数据库。',
  },
  'feature.db.title': { ko: '외부 DB 연동', en: 'External DB Integration', zh: '外部数据库对接' },
  'feature.db.desc': {
    ko: 'UniProt, PDB, AlphaFold DB와 자동 연동하여 단백질 정보를 즉시 조회합니다.',
    en: 'Auto-integrate with UniProt, PDB, AlphaFold DB for instant protein info lookup.',
    zh: '自动对接UniProt、PDB、AlphaFold DB，即时查询蛋白质信息。',
  },
  'feature.export.title': { ko: '데이터 시각화·Export', en: 'Data Visualization & Export', zh: '数据可视化·导出' },
  'feature.export.desc': {
    ko: '파이프라인 현황, 결정화 성공률 차트, CSV/JSON Export로 데이터를 분석·활용합니다.',
    en: 'Analyze data with pipeline charts, crystallization success rates, and CSV/JSON export.',
    zh: '通过流程图表、结晶成功率图表及CSV/JSON导出分析利用数据。',
  },

  // Stats
  'stats.tables': { ko: '데이터 테이블', en: 'Data Tables', zh: '数据表' },
  'stats.stages': { ko: '실험 단계', en: 'Experiment Stages', zh: '实验阶段' },
  'stats.db': { ko: '외부 DB 연동', en: 'External DB Integration', zh: '外部数据库' },
  'stats.ai': { ko: '결정화 예측', en: 'Crystallization AI', zh: '结晶预测' },

  // Tutorial
  'tutorial.title': { ko: '사용 가이드', en: 'User Guide', zh: '使用指南' },
  'tutorial.subtitle': { ko: 'KRAS 단백질을 예시로 따라하는 결정화 데이터 관리', en: 'Follow along with KRAS protein as an example', zh: '以KRAS蛋白质为例的结晶数据管理' },

  // CTA
  'cta.title': { ko: '데이터 기반 단백질 연구를 시작하세요', en: 'Start data-driven protein research', zh: '开始数据驱动的蛋白质研究' },
  'cta.desc': {
    ko: 'KBSI 단백질 결정화은행 데이터 플랫폼으로 실험 효율을 높이고, AI 예측으로 최적의 결정화 조건을 찾아보세요.',
    en: 'Boost experiment efficiency and find optimal crystallization conditions with AI prediction.',
    zh: '通过KBSI蛋白质结晶银行数据平台提高实验效率，利用AI预测寻找最优结晶条件。',
  },
  'cta.button': { ko: '무료로 시작하기', en: 'Get Started Free', zh: '免费开始' },

  // Footer
  'footer.org': { ko: 'KBSI 한국기초과학지원연구원', en: 'KBSI Korea Basic Science Institute', zh: 'KBSI 韩国基础科学支援研究院' },
  'footer.desc': { ko: '단백질 결정화은행 기반 신약개발 AI 데이터 허브', en: 'Protein Crystallization Bank AI Data Hub for Drug Discovery', zh: '基于蛋白质结晶银行的新药研发AI数据中心' },

  // Dashboard / common
  'nav.dashboard': { ko: '대시보드', en: 'Dashboard', zh: '仪表板' },
  'nav.proteins': { ko: '단백질', en: 'Proteins', zh: '蛋白质' },
  'nav.constructs': { ko: 'Constructs', en: 'Constructs', zh: '构建体' },
  'nav.experiments': { ko: '실험', en: 'Experiments', zh: '实验' },
  'nav.ligands': { ko: '리간드', en: 'Ligands', zh: '配体' },
  'nav.staging': { ko: 'Staging 검토', en: 'Staging Review', zh: '暂存审核' },
  'common.logout': { ko: '로그아웃', en: 'Logout', zh: '退出' },
  'common.nodata': { ko: '데이터가 없습니다.', en: 'No data available.', zh: '暂无数据。' },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale): string {
  return translations[key]?.[locale] ?? translations[key]?.['en'] ?? key;
}

export function getLocaleFromStorage(): Locale {
  if (typeof window === 'undefined') return 'ko';
  return (localStorage.getItem('locale') as Locale) || 'ko';
}
