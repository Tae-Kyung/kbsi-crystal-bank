'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dna, Database, Brain, FileText, MessageSquare, FlaskConical, Code, Plug,
  ChevronDown, ChevronRight, Copy, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Copy button ───
function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
      <pre className="text-xs font-mono bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
        {text}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ─── Collapsible section ───
function CollapsibleStep({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-l-2 border-blue-200 pl-4 py-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 w-full text-left">
        {open ? <ChevronDown className="h-4 w-4 text-blue-500" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        {title}
      </button>
      {open && <div className="mt-3 space-y-3 ml-6">{children}</div>}
    </div>
  );
}

// ─── Field table ───
function FieldTable({ fields }: { fields: { label: string; value: string; highlight?: boolean }[] }) {
  return (
    <div className="rounded-lg border bg-white dark:bg-gray-800 overflow-hidden">
      <table className="w-full text-xs">
        <tbody>
          {fields.map((f, i) => (
            <tr key={i} className={cn('border-b last:border-0', f.highlight && 'bg-blue-50 dark:bg-blue-900/20')}>
              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap font-medium w-40">{f.label}</td>
              <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200">{f.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Scenario Card ───
function ScenarioCard({
  icon: Icon, number, title, subtitle, badge, children, link,
}: {
  icon: React.ElementType; number: string; title: string; subtitle: string; badge?: string;
  children: React.ReactNode; link?: { href: string; label: string };
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border bg-white dark:bg-gray-800 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full p-6 text-left">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{number}</span>
              {badge && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 font-medium">{badge}</span>
              )}
            </div>
            <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
          </div>
          <div className="shrink-0 mt-2">
            {expanded ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
          </div>
        </div>
      </button>
      {/* Content */}
      {expanded && (
        <div className="px-6 pb-6 space-y-4 border-t pt-4">
          {children}
          {link && (
            <div className="pt-2">
              <Link href={link.href}>
                <Button variant="outline" size="sm">{link.label} &rarr;</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───
export function UseCaseScenarios() {
  return (
    <div className="space-y-6">

      {/* ────── Scenario 1: PDB Import ────── */}
      <ScenarioCard
        icon={Database}
        number="Scenario 1"
        title="PDB에서 단백질 구조 가져오기"
        subtitle="RCSB PDB 데이터베이스에서 결정 구조를 검색하고, 단백질·Construct·결정화 조건·구조 데이터를 한 번에 등록합니다."
        badge="추천 시작점"
        link={{ href: '/pdb-import', label: 'PDB Import 페이지' }}
      >
        <CollapsibleStep title="1-1. PDB ID로 단백질 검색" defaultOpen>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            PDB Import 페이지에서 PDB ID를 입력하면 RCSB API에서 구조 정보를 가져옵니다.
          </p>
          <FieldTable fields={[
            { label: 'PDB ID 예시', value: '1LYZ — Lysozyme (2.0 A, Gallus gallus)', highlight: true },
            { label: '', value: '6LU7 — SARS-CoV-2 Main Protease (2.16 A)' },
            { label: '', value: '4HHB — Hemoglobin (1.74 A)' },
            { label: '', value: '1UBQ — Ubiquitin (1.8 A)' },
            { label: '', value: '7BV2 — ACE2-Spike complex (2.68 A)' },
            { label: '가져오는 정보', value: '단백질명, 서열, 발현 시스템, 결정화 조건(pH/온도/침전제), 해상도, 공간군' },
          ]} />
        </CollapsibleStep>

        <CollapsibleStep title="1-2. 추천 카테고리에서 탐색">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            20개 카테고리(Kinases, Proteases, Polymerases, Cytochromes 등)에서 대표 구조를 추천받습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {['Kinases', 'Proteases', 'Polymerases', 'Transferases', 'Oxidoreductases',
              'Cytochromes', 'Antibodies', 'GPCRs', 'Ion Channels', 'Ribosomes'].map(cat => (
              <span key={cat} className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300">{cat}</span>
            ))}
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="1-3. 일괄 등록 (Batch Import)">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            체크박스로 여러 PDB를 선택해 한 번에 등록합니다. &quot;미등록&quot; 탭과 &quot;등록됨&quot; 탭으로 진행 상태를 확인합니다.
          </p>
          <CopyBlock
            label="API 호출 예시"
            text={`POST /api/pdb-import
{
  "pdbIds": ["1LYZ", "6LU7", "4HHB", "1UBQ", "7BV2"]
}`}
          />
        </CollapsibleStep>
      </ScenarioCard>

      {/* ────── Scenario 2: 실험 기록 ────── */}
      <ScenarioCard
        icon={FlaskConical}
        number="Scenario 2"
        title="단백질 실험 파이프라인 기록"
        subtitle="KRAS G12D 변이체를 예시로 발현 → 정제 → 결정화의 전 과정을 기록합니다. 실패 데이터 포함이 핵심입니다."
        link={{ href: '/constructs', label: 'Construct 목록' }}
      >
        <CollapsibleStep title="2-1. 단백질 & Construct 등록" defaultOpen>
          <div className="grid gap-3 md:grid-cols-2">
            <FieldTable fields={[
              { label: 'Full Name', value: 'Kirsten Rat Sarcoma Viral Proto-Oncogene', highlight: true },
              { label: 'Abbreviation', value: 'KRAS' },
              { label: 'Gene', value: 'KRAS' },
              { label: 'Organism', value: 'Homo sapiens' },
            ]} />
            <FieldTable fields={[
              { label: 'Construct Name', value: 'KRAS-G12D-1-169', highlight: true },
              { label: 'Type', value: 'truncation' },
              { label: 'Vector', value: 'pET-28a' },
              { label: 'Tag', value: 'His6 (N-terminal)' },
              { label: 'Expression System', value: 'E. coli BL21(DE3)' },
            ]} />
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="2-2. 발현 실험 기록 (Expression)">
          <FieldTable fields={[
            { label: 'Host', value: 'E. coli' },
            { label: 'Strain', value: 'BL21(DE3)' },
            { label: 'Induction Temp', value: '18°C' },
            { label: 'Yield', value: '15.5 mg/L' },
            { label: 'Result Level', value: 'high', highlight: true },
            { label: 'Conditions', value: 'IPTG 0.5mM, 18°C, 16h induction' },
          ]} />
          <div className="text-xs text-gray-500 italic">
            * Result Level: no_expression → insoluble → low → moderate → high (ML 학습용 서수형 인코딩)
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="2-3. 결정화 — 성공 + 실패 모두 기록">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border-2 border-green-200 dark:border-green-800 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-300">성공 조건</span>
              </div>
              <FieldTable fields={[
                { label: 'Precipitant', value: 'PEG 3350, 20%' },
                { label: 'Buffer / pH', value: 'Bis-Tris / 6.5' },
                { label: 'Temperature', value: '18°C' },
                { label: 'Protein Conc.', value: '10 mg/mL' },
                { label: 'Outcome', value: 'single_crystal', highlight: true },
              ]} />
            </div>
            <div className="rounded-lg border-2 border-red-200 dark:border-red-800 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm font-semibold text-red-700 dark:text-red-300">실패 조건</span>
              </div>
              <FieldTable fields={[
                { label: 'Precipitant', value: 'Ammonium Sulfate, 2M' },
                { label: 'Buffer / pH', value: 'HEPES / 7.5' },
                { label: 'Temperature', value: '18°C' },
                { label: 'Protein Conc.', value: '10 mg/mL' },
                { label: 'Outcome', value: 'precipitate', highlight: true },
              ]} />
            </div>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>왜 실패 데이터가 중요한가?</strong> — ML 모델은 &quot;이 조건에서 성공&quot;과 &quot;이 조건에서 실패&quot; 모두를 학습해야 정확히 예측합니다.
              NULL은 &quot;시도하지 않음&quot;, 값이 있으면 &quot;시도함(실패 포함)&quot;을 의미합니다.
            </p>
          </div>
        </CollapsibleStep>
      </ScenarioCard>

      {/* ────── Scenario 3: AI 예측 ────── */}
      <ScenarioCard
        icon={Brain}
        number="Scenario 3"
        title="AI 결정화 조건 추천 & 성공 확률 예측"
        subtitle="축적된 결정화 데이터를 k-NN 알고리즘으로 분석하여 유사 조건 추천과 성공 확률을 예측합니다."
        link={{ href: '/dashboard', label: '대시보드' }}
      >
        <CollapsibleStep title="3-1. 유사 조건 추천 — GET /api/recommend" defaultOpen>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            새 실험을 계획할 때, 과거 성공 사례 중 가장 유사한 조건을 검색합니다.
          </p>
          <CopyBlock
            label="요청"
            text="GET /api/recommend?ph=7.0&temperature=18&precipitant_type=PEG%203350&k=5"
          />
          <CopyBlock
            label="응답 예시"
            text={`{
  "success_rate": 60,
  "total_data_points": 154,
  "recommendations": [
    {
      "precipitant_type": "PEG 3350",
      "precipitant_conc": 20,
      "ph": 6.5,
      "temperature": 18,
      "outcome": "single_crystal",
      "distance": 0.42
    },
    {
      "precipitant_type": "PEG 4000",
      "precipitant_conc": 25,
      "ph": 7.0,
      "temperature": 20,
      "outcome": "diffraction_quality",
      "distance": 0.68
    }
  ]
}`}
          />
        </CollapsibleStep>

        <CollapsibleStep title="3-2. 성공 확률 예측 — POST /api/predict">
          <CopyBlock
            label="요청"
            text={`POST /api/predict
{
  "ph": 7.0,
  "temperature": 20,
  "precipitant_type": "PEG 4000",
  "precipitant_conc": 25,
  "protein_concentration": 10
}`}
          />
          <CopyBlock
            label="응답 예시"
            text={`{
  "prediction": {
    "success_probability": 45,
    "confidence": "medium",
    "k_used": 8,
    "data_points_total": 154
  },
  "outcome_distribution": {
    "single_crystal": 3,
    "precipitate": 2,
    "clear": 2,
    "microcrystal": 1
  }
}`}
          />
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Confidence: <strong>high</strong>(50건+) / <strong>medium</strong>(20~49건) / <strong>low</strong>(5~19건).
              데이터가 쌓일수록 예측 정확도가 향상됩니다.
            </p>
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="3-3. 대시보드 시각화 3종">
          <FieldTable fields={[
            { label: 'Pipeline Funnel', value: 'Expression → Purification → Crystallization → Structure 단계별 데이터 건수 & 전환율' },
            { label: 'Outcome 분포', value: 'clear / precipitate / phase_separation / microcrystal / single_crystal / diffraction_quality 파이차트' },
            { label: 'pH x Temperature', value: '결정화 조건 Scatter Plot — 성공(●) vs 실패(▲), source_type별 색상 구분' },
          ]} />
        </CollapsibleStep>
      </ScenarioCard>

      {/* ────── Scenario 4: LLM 문헌 추출 ────── */}
      <ScenarioCard
        icon={FileText}
        number="Scenario 4"
        title="논문에서 실험 데이터 AI 자동 추출"
        subtitle="논문 Methods 섹션을 붙여넣으면 GPT-4o가 발현·정제·결정화 조건을 구조화된 데이터로 추출합니다."
        link={{ href: '/staging', label: 'Staging Review' }}
      >
        <CollapsibleStep title="4-1. 추출할 논문 텍스트 예시" defaultOpen>
          <CopyBlock
            label="복사해서 사용할 수 있는 예시 텍스트"
            text={`KRAS G12D (residues 1-169) was cloned into pET-28a with an N-terminal His6 tag and expressed in E. coli BL21(DE3). Cells were grown at 37°C in LB medium and induced with 0.5 mM IPTG at 18°C for 16 hours. The protein was purified by Ni-NTA affinity chromatography followed by TEV protease cleavage and size exclusion chromatography (Superdex 75), yielding 15 mg of >95% pure protein per liter of culture.

Crystallization was performed by hanging-drop vapor diffusion at 18°C. Diffraction-quality crystals appeared in 7 days from 20% PEG 3350, 0.1 M Bis-Tris pH 6.5 with a protein concentration of 10 mg/mL. A second screen with 2 M ammonium sulfate, 0.1 M HEPES pH 7.5 resulted in immediate precipitation.`}
          />
        </CollapsibleStep>

        <CollapsibleStep title="4-2. 추출 워크플로우">
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">1</span>
              <span>Staging Review &rarr; &quot;Extract from Paper&quot; 클릭</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">2</span>
              <span>Target Table 선택 (kbsi_expression / kbsi_crystallization / kbsi_purification)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">3</span>
              <span>논문 텍스트 붙여넣기 &rarr; Extract 클릭</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">4</span>
              <span>GPT-4o가 JSON 배열로 추출 &rarr; Staging 테이블에 pending 상태로 저장</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-600">5</span>
              <span>원문 스니펫과 비교 후 Approve(승인) &rarr; 본 테이블에 자동 이관</span>
            </div>
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="4-3. 추출 결과 예시">
          <CopyBlock
            label="kbsi_expression 추출 결과"
            text={`{
  "host": "E. coli",
  "strain": "BL21(DE3)",
  "vector": "pET-28a",
  "tag": "His6",
  "induction_temp": 18,
  "yield_mg_l": 15,
  "result_level": "high",
  "conditions": "0.5 mM IPTG, 18°C, 16h",
  "source_snippet": "expressed in E. coli BL21(DE3)...induced with 0.5 mM IPTG at 18°C for 16 hours"
}`}
          />
        </CollapsibleStep>
      </ScenarioCard>

      {/* ────── Scenario 5: AI 챗봇 ────── */}
      <ScenarioCard
        icon={MessageSquare}
        number="Scenario 5"
        title="AI 챗봇으로 데이터 탐색"
        subtitle="우측 하단 챗 버튼을 클릭하면 자연어로 데이터를 검색하고, 조건을 추천받고, 통계를 확인할 수 있습니다."
        badge="NEW"
        link={{ href: '/dashboard', label: '대시보드에서 시작' }}
      >
        <CollapsibleStep title="5-1. 질문 예시" defaultOpen>
          <div className="grid gap-2 md:grid-cols-2">
            {[
              { q: '"DB에 등록된 단백질 수는?"', a: 'get_statistics 도구로 전체 통계 조회' },
              { q: '"KRAS 검색해줘"', a: 'search_proteins → KRAS 관련 단백질 목록 반환' },
              { q: '"pH 7.0, 18도에서 결정화 추천해줘"', a: 'recommend_crystallization → 유사 성공 조건 추천' },
              { q: '"PEG 4000 25%로 결정화하면 성공 확률은?"', a: 'predict_success → 성공 확률 % + confidence' },
              { q: '"single_crystal 결과만 보여줘"', a: 'search_crystallization_conditions → outcome 필터' },
              { q: '"Construct ID 5의 발현 실험 보여줘"', a: 'get_experiments → 해당 construct 실험 데이터' },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-900">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{q}</p>
                <p className="text-xs text-gray-500 mt-1">&rarr; {a}</p>
              </div>
            ))}
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="5-2. 사용 가능한 도구 (Function Calling)">
          <FieldTable fields={[
            { label: 'search_proteins', value: '이름/약어/유전자명으로 단백질 검색' },
            { label: 'search_constructs', value: 'Construct 검색 (protein_id 또는 이름)' },
            { label: 'get_experiments', value: '특정 Construct의 실험 데이터 조회 (6종)' },
            { label: 'get_statistics', value: 'DB 전체 통계 (테이블별 건수)' },
            { label: 'recommend_crystallization', value: 'k-NN 기반 결정화 조건 추천' },
            { label: 'predict_success', value: '결정화 성공 확률 예측' },
            { label: 'search_crystallization_conditions', value: '조건별 결정화 데이터 검색', highlight: true },
          ]} />
        </CollapsibleStep>
      </ScenarioCard>

      {/* ────── Scenario 6: Negative Control + ML ────── */}
      <ScenarioCard
        icon={FlaskConical}
        number="Scenario 6"
        title="데이터 증강 & ML 학습 데이터셋 Export"
        subtitle="성공 결정화 데이터에서 합성 실패 조건을 자동 생성하고, ML 학습용 데이터셋을 CSV/JSON으로 내보냅니다."
      >
        <CollapsibleStep title="6-1. Negative Control 합성 (7가지 전략)" defaultOpen>
          <FieldTable fields={[
            { label: 'Extreme pH Low', value: 'pH 3.0~4.0 → 단백질 변성/침전' },
            { label: 'Extreme pH High', value: 'pH 10.0~11.0 → 단백질 변성' },
            { label: 'No Precipitant', value: '농도 0 → clear drop (결정 미형성)' },
            { label: 'Excess Precipitant', value: '원래의 2.5배 → 즉시 침전' },
            { label: 'Low Precipitant', value: '원래의 0.2배 → clear drop' },
            { label: 'High Temperature', value: '37°C → 단백질 불안정' },
            { label: 'High Salt', value: '원래의 5배 → salting out' },
          ]} />
          <div className="text-xs text-gray-500">
            * 모든 합성 데이터는 source_type: &apos;synthetic&apos;으로 표시되어 실제 실험 데이터와 구분됩니다.
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="6-2. ML 데이터셋 Export">
          <CopyBlock
            label="이진분류 CSV Export"
            text="GET /api/export/ml-dataset?format=csv&binary=true"
          />
          <CopyBlock
            label="전체 outcome JSON Export"
            text="GET /api/export/ml-dataset?format=json"
          />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            이진분류 모드: single_crystal 이상 = <strong>success(1)</strong>, 미만 = <strong>fail(0)</strong>
          </p>
        </CollapsibleStep>
      </ScenarioCard>

      {/* ────── Scenario 7: API & MCP ────── */}
      <ScenarioCard
        icon={Plug}
        number="Scenario 7"
        title="OpenAPI / Swagger & MCP 연동"
        subtitle="REST API를 Swagger UI에서 테스트하고, MCP 서버로 Claude/다른 AI에 연결하여 데이터를 활용합니다."
        badge="NEW"
        link={{ href: '/api-docs', label: 'Swagger API 문서' }}
      >
        <CollapsibleStep title="7-1. Swagger UI — 인터랙티브 API 문서" defaultOpen>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            사이드바 &quot;API Docs&quot; 메뉴에서 전체 API를 탐색하고, 실제 요청을 보내 테스트할 수 있습니다.
          </p>
          <FieldTable fields={[
            { label: 'OpenAPI JSON', value: 'GET /api/openapi — OpenAPI 3.0 스펙 (JSON)' },
            { label: 'Swagger UI', value: '/api-docs — 인터랙티브 API 문서' },
            { label: 'API 수', value: '28개 엔드포인트 (Proteins, Constructs, 실험 9종, AI/ML, LLM, Export 등)' },
          ]} />
        </CollapsibleStep>

        <CollapsibleStep title="7-2. MCP 서버 설정 — Claude Desktop/Code 연동">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            KBSI API를 MCP(Model Context Protocol) 서버로 노출하면 Claude Desktop, Claude Code, 또는 다른 MCP 클라이언트에서 직접 데이터를 조회할 수 있습니다.
          </p>
          <CopyBlock
            label="claude_desktop_config.json (Claude Desktop)"
            text={`{
  "mcpServers": {
    "kbsi-protein": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-openapi", "--spec",
        "https://kbsi-crystal-bank.vercel.app/api/openapi"]
    }
  }
}`}
          />
          <CopyBlock
            label="Claude Code (.mcp.json)"
            text={`{
  "mcpServers": {
    "kbsi-protein": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-openapi",
        "--spec", "https://kbsi-crystal-bank.vercel.app/api/openapi",
        "--server-name", "kbsi-protein"]
    }
  }
}`}
          />
          <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-3">
            <p className="text-sm text-purple-800 dark:text-purple-200">
              <strong>MCP 연동 후 사용 예시:</strong>
            </p>
            <ul className="mt-2 space-y-1 text-sm text-purple-700 dark:text-purple-300">
              <li>&bull; &quot;KBSI DB에서 EGFR 단백질 검색해줘&quot; → <code className="text-xs bg-purple-100 dark:bg-purple-800 px-1 rounded">GET /api/proteins?search=EGFR</code></li>
              <li>&bull; &quot;결정화 성공률 높은 조건 추천해줘&quot; → <code className="text-xs bg-purple-100 dark:bg-purple-800 px-1 rounded">GET /api/recommend</code></li>
              <li>&bull; &quot;전체 결정화 데이터 CSV로 내보내줘&quot; → <code className="text-xs bg-purple-100 dark:bg-purple-800 px-1 rounded">GET /api/export?table=kbsi_crystallization&format=csv</code></li>
            </ul>
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="7-3. 프로그래밍 방식 API 호출">
          <CopyBlock
            label="JavaScript (fetch)"
            text={`// 단백질 검색
const res = await fetch('/api/proteins?search=KRAS');
const { data, pagination } = await res.json();

// 결정화 성공 확률 예측
const pred = await fetch('/api/predict', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ph: 7.0,
    temperature: 18,
    precipitant_type: 'PEG 3350',
    precipitant_conc: 20,
  }),
});
const { prediction } = await pred.json();
console.log(prediction.success_probability + '% 성공 확률');`}
          />
          <CopyBlock
            label="Python (requests)"
            text={`import requests

BASE = "https://kbsi-crystal-bank.vercel.app"

# 단백질 목록
proteins = requests.get(f"{BASE}/api/proteins?limit=100").json()

# ML 데이터셋 다운로드
csv_data = requests.get(f"{BASE}/api/export/ml-dataset?format=csv&binary=true")
with open("crystallization_dataset.csv", "w") as f:
    f.write(csv_data.text)

# AI 추천
rec = requests.get(f"{BASE}/api/recommend", params={
    "ph": 7.0, "temperature": 18, "precipitant_type": "PEG 3350", "k": 10
}).json()
print(f"Success rate: {rec['success_rate']}%")`}
          />
        </CollapsibleStep>
      </ScenarioCard>

      {/* ────── Scenario 8: Data Import/Export ────── */}
      <ScenarioCard
        icon={Code}
        number="Scenario 8"
        title="데이터 Import / Export & 외부 DB 연동"
        subtitle="CSV/JSON 일괄 가져오기, 내보내기, UniProt·PDB·AlphaFold DB 자동 조회를 활용합니다."
      >
        <CollapsibleStep title="8-1. CSV Export 예시" defaultOpen>
          <div className="space-y-2">
            {[
              { label: '전체 결정화 데이터', url: '/api/export?table=kbsi_crystallization&format=csv' },
              { label: '특정 Construct 발현', url: '/api/export?table=kbsi_expression&construct_id=1&format=csv' },
              { label: '단백질 JSON', url: '/api/export?table=kbsi_protein&format=json' },
            ].map(item => (
              <div key={item.url} className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-40 shrink-0">{item.label}:</span>
                <code className="text-xs bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded font-mono break-all">{item.url}</code>
              </div>
            ))}
          </div>
        </CollapsibleStep>

        <CollapsibleStep title="8-2. CSV Bulk Import">
          <CopyBlock
            label="FormData로 CSV 업로드"
            text={`const formData = new FormData();
formData.append('table', 'kbsi_protein');
formData.append('file', csvFile);

const res = await fetch('/api/import', {
  method: 'POST',
  body: formData,
});`}
          />
          <p className="text-xs text-gray-500">
            지원 테이블: kbsi_protein, kbsi_construct, kbsi_expression, kbsi_purification, kbsi_crystallization, kbsi_characterization
          </p>
        </CollapsibleStep>

        <CollapsibleStep title="8-3. 외부 DB 자동 연동">
          <FieldTable fields={[
            { label: 'UniProt', value: '유전자명/서열/기능 주석 자동 조회, PDB 교차 참조' },
            { label: 'RCSB PDB', value: '3D 구조 + 결정화 조건 + 발현 시스템 자동 import' },
            { label: 'AlphaFold DB', value: 'UniProt ID로 예측 구조 조회 (PAE 품질 지표 포함)' },
            { label: 'CrossRef', value: 'DOI로 논문 메타데이터 (제목/저자/저널) 자동 fetch' },
            { label: 'TargetTrack', value: '결정화 프로토콜 77건 import 완료', highlight: true },
          ]} />
        </CollapsibleStep>
      </ScenarioCard>

    </div>
  );
}
