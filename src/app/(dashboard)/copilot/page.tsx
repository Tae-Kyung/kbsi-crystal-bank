'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, AlertTriangle, CheckCircle2, Beaker, Brain, Sparkles, Search, Radio, BarChart3 } from 'lucide-react';

interface CopilotResult {
  analysis: {
    similar_proteins: number;
    max_similarity: number;
    total_crystallization: number;
    success_count: number;
    failure_count: number;
    success_rate: number;
    expression_data: number;
    searched_constructs?: number;
    search_method: 'db' | 'esm2_db' | 'esm2' | 'kmer';
  };
  construct_recommendation: {
    expression_system: string;
    induction_temp: number | null;
    expected_yield: number | null;
    common_systems: Record<string, number>;
  };
  crystallization_recommendation: {
    best_ph: { range: string; rate: number; total: number }[];
    best_temperature: { label: string; rate: number; total: number }[];
    best_precipitant: { name: string; rate: number; total: number }[];
    top_conditions: { precipitant: string; conc: number; buffer: string; ph: number; temperature: number; protein_conc?: number; count?: number }[];
  };
  avoid: string[];
  similar_proteins_sample: { name: string; organism: string; similarity: number; mw: number | null }[];
  nmr_recommendation?: {
    total: number;
    top_fields: { label: string; count: number }[];
    top_ph: { label: string; count: number }[];
    top_temperature: { label: string; count: number }[];
    top_labelling: { label: string; count: number }[];
    top_ionic_strength: { label: string; count: number }[];
    avg_conformers: number | null;
  } | null;
  method_distribution?: { method: string; count: number; pct: number; avg_resolution: number | null }[] | null;
  ai_strategy?: string; // JSON string or plain text
  prediction?: {
    success_probability: number;
    confidence: string;
    model: string;
    condition_used?: { ph: number; temperature: number; precipitant: string; conc: number } | null;
  } | null;
}

const EXAMPLE_SEQUENCE = `MTEYKLVVVGAVGVGKSALTIQLIQNHFVDEYDPTIEDSY
RKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCV
FAINNTKSFEDIHHQRQETKRRASYTEKEVKDFLARILSSA`;

const SEARCH_METHOD_LABELS: Record<string, { label: string; color: string }> = {
  esm2_db: { label: 'ESM-2 Embedding (DB)', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  esm2: { label: 'ESM-2 Embedding (GPU)', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  db: { label: 'DB Direct', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  kmer: { label: 'k-mer (fallback)', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
};

export default function CopilotPage() {
  const [sequence, setSequence] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'db' | 'sequence'>('db');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout>(undefined);
  const skipSearchRef = useRef(false);

  // DB 검색 자동완성
  useEffect(() => {
    if (skipSearchRef.current) { skipSearchRef.current = false; return; }
    if (searchQuery.length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data);
        setSearchOpen(data.length > 0);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchQuery]);

  async function handleDbSelect(proteinId: number, name: string) {
    skipSearchRef.current = true;
    setSearchOpen(false);
    setSearchResults([]);
    setSearchQuery(name);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protein_id: proteinId }),
      });
      const data = await res.json();
      if (data.error && !data.analysis) setError(data.error);
      else setResult(data);
    } catch {
      setError('분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!sequence.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: sequence.replace(/[^A-Za-z]/g, '') }),
      });
      const data = await res.json();
      if (data.error && !data.analysis) setError(data.error);
      else setResult(data);
    } catch {
      setError('분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const methodInfo = result ? SEARCH_METHOD_LABELS[result.analysis.search_method] : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6" />
          Crystallization Copilot
        </h2>
        <p className="text-muted-foreground">
          단백질을 선택하거나 서열을 입력하면 결정화 조건을 분석하고 최적의 실험 전략을 추천합니다.
        </p>
      </div>

      {/* Input */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">Step 1. 단백질 선택</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 border-b pb-2">
            <Button variant={mode === 'db' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('db')}>
              <Search className="h-3.5 w-3.5 mr-1" />
              DB에서 검색 + ESM-2 확장
            </Button>
            <Button variant={mode === 'sequence' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('sequence')}>
              <Brain className="h-3.5 w-3.5 mr-1" />
              서열 입력
            </Button>
          </div>

          {mode === 'db' ? (
            <div className="space-y-3">
              <div className="relative">
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                  placeholder="단백질 이름, 유전자명 검색 (예: KRAS, EGFR, lysozyme)..."
                  className="w-full rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {searchOpen && searchResults.length > 0 && (
                  <div className="absolute top-full mt-1 w-full rounded-lg border bg-popover shadow-lg z-50 overflow-hidden max-h-96 overflow-y-auto">
                    {searchResults.map((s: any) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleDbSelect(s.id, s.label)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 border-b border-border/30 last:border-b-0"
                      >
                        <span className="font-medium">{s.label}</span>
                        {s.sub && <span className="text-xs text-muted-foreground ml-2">({s.sub})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                선택한 단백질의 ESM-2 임베딩으로 284K construct에서 유사 서열을 검색합니다.
              </p>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />분석 중... (ESM-2 유사도 검색 + 결정화 데이터 분석 + AI 전략 생성)
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-2">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  입력 서열을 ESM-2로 임베딩한 뒤 284K construct와 벡터 유사도 검색합니다.
                </p>
              </div>
              <textarea
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                placeholder="아미노산 서열을 입력하세요 (FASTA 형식 또는 단순 서열)..."
                className="w-full h-28 rounded-lg border bg-muted/50 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleSubmit} disabled={loading || !sequence.trim()} size="sm">
                  {loading ? (
                    <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />분석 중...</span>
                  ) : '서열 분석'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSequence(EXAMPLE_SEQUENCE)}>
                  예시 (KRAS)
                </Button>
                <span className="text-xs text-muted-foreground">
                  {sequence.replace(/[^A-Za-z]/g, '').length} residues
                </span>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Analysis Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                분석 요약
                {methodInfo && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-normal ${methodInfo.color}`}>
                    {methodInfo.label}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.analysis.search_method === 'kmer' && result.analysis.max_similarity < 20 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 mb-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    k-mer 유사도 {result.analysis.max_similarity}% — GPU 서버 연결 시 ESM-2로 더 정확한 검색이 가능합니다.
                    ({result.analysis.searched_constructs?.toLocaleString()}개 서열 검색됨)
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <div className="text-xl font-bold">{result.analysis.similar_proteins}</div>
                  <div className="text-[10px] text-muted-foreground">유사 단백질</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
                  <div className="text-xl font-bold">{result.analysis.total_crystallization.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">결정화 데이터</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
                  <div className="text-xl font-bold text-green-700">{result.analysis.success_rate}%</div>
                  <div className="text-[10px] text-muted-foreground">성공률</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950">
                  <div className="text-xl font-bold text-red-700">{result.analysis.failure_count.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">실패 건수</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
                  <div className="text-xl font-bold">{result.analysis.expression_data}</div>
                  <div className="text-[10px] text-muted-foreground">발현 데이터</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Success Prediction */}
          {result.prediction && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" /> XGBoost + ESM-2 성공 예측
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className={`text-4xl font-bold ${
                      result.prediction.success_probability >= 70 ? 'text-green-600' :
                      result.prediction.success_probability >= 40 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {result.prediction.success_probability}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">성공 확률</div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          result.prediction.success_probability >= 70 ? 'bg-green-500' :
                          result.prediction.success_probability >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${result.prediction.success_probability}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>신뢰도: {result.prediction.confidence}</span>
                      <span>모델: {result.prediction.model}</span>
                    </div>
                    {result.prediction.condition_used && (
                      <p className="text-[10px] text-muted-foreground">
                        조건: {result.prediction.condition_used.precipitant || '-'} / pH {result.prediction.condition_used.ph} / {result.prediction.condition_used.temperature}°C
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Strategy */}
          {result.ai_strategy && <AiStrategyCard strategy={result.ai_strategy} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 2: Expression */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Beaker className="h-4 w-4" /> Step 2. 발현 조건 추천
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>발현 시스템</span>
                    <span className="font-bold">{result.construct_recommendation.expression_system}</span>
                  </div>
                  {result.construct_recommendation.induction_temp && (
                    <div className="flex justify-between text-sm">
                      <span>유도 온도</span>
                      <span className="font-bold">{result.construct_recommendation.induction_temp}°C</span>
                    </div>
                  )}
                  {result.construct_recommendation.expected_yield && (
                    <div className="flex justify-between text-sm">
                      <span>예상 수율</span>
                      <span className="font-bold">{result.construct_recommendation.expected_yield} mg/L</span>
                    </div>
                  )}
                </div>
                {Object.keys(result.construct_recommendation.common_systems).length > 1 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">발현 시스템 분포:</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(result.construct_recommendation.common_systems)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([sys, count]) => (
                          <Badge key={sys} variant="outline" className="text-[10px]">{sys} ({count})</Badge>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Avoid */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-4 w-4" /> 피해야 할 조건
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.avoid.length > 0 ? (
                  <div className="space-y-2">
                    {result.avoid.map((pattern, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-red-500 mt-0.5">&#x2715;</span>
                        <span>{pattern}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">특별한 실패 패턴이 감지되지 않았습니다.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Step 3: Crystallization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Step 3. 결정화 조건 추천
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Best pH */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">pH 범위별 성공률</p>
                  {result.crystallization_recommendation.best_ph.map((p) => (
                    <div key={p.range} className="flex items-center gap-2 mb-1">
                      <span className="text-xs w-12">pH {p.range}</span>
                      <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded" style={{ width: `${p.rate}%` }} />
                      </div>
                      <span className="text-xs font-mono w-16 text-right">{p.rate}% <span className="text-muted-foreground">({p.total})</span></span>
                    </div>
                  ))}
                </div>

                {/* Best Temperature */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">온도별 성공률</p>
                  {result.crystallization_recommendation.best_temperature.map((t) => (
                    <div key={t.label} className="flex items-center gap-2 mb-1">
                      <span className="text-xs w-12">{t.label}</span>
                      <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-sky-500 rounded" style={{ width: `${t.rate}%` }} />
                      </div>
                      <span className="text-xs font-mono w-16 text-right">{t.rate}% <span className="text-muted-foreground">({t.total})</span></span>
                    </div>
                  ))}
                </div>

                {/* Best Precipitant */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">침전제별 성공률</p>
                  {result.crystallization_recommendation.best_precipitant.map((p) => (
                    <div key={p.name} className="flex items-center gap-2 mb-1">
                      <span className="text-xs w-20 truncate" title={p.name}>{p.name}</span>
                      <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-violet-500 rounded" style={{ width: `${p.rate}%` }} />
                      </div>
                      <span className="text-xs font-mono w-16 text-right">{p.rate}% <span className="text-muted-foreground">({p.total})</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Conditions */}
              {result.crystallization_recommendation.top_conditions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">추천 조건 (성공 사례 기반, 빈도순)</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-1.5 text-left text-xs font-medium">#</th>
                          <th className="px-3 py-1.5 text-left text-xs font-medium">Precipitant</th>
                          <th className="px-3 py-1.5 text-left text-xs font-medium">Conc</th>
                          <th className="px-3 py-1.5 text-left text-xs font-medium">Buffer</th>
                          <th className="px-3 py-1.5 text-left text-xs font-medium">pH</th>
                          <th className="px-3 py-1.5 text-left text-xs font-medium">Temp</th>
                          <th className="px-3 py-1.5 text-right text-xs font-medium">건수</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {result.crystallization_recommendation.top_conditions.slice(0, 12).map((c, i) => (
                          <tr key={i} className={`hover:bg-muted/30 ${i < 3 ? 'bg-green-50/50 dark:bg-green-950/30' : ''}`}>
                            <td className="px-3 py-1.5 text-xs font-bold text-blue-600">{i + 1}</td>
                            <td className="px-3 py-1.5 text-xs">{c.precipitant || '-'}</td>
                            <td className="px-3 py-1.5 text-xs">{c.conc ?? '-'}</td>
                            <td className="px-3 py-1.5 text-xs">{c.buffer || '-'}</td>
                            <td className="px-3 py-1.5 text-xs font-mono">{c.ph}</td>
                            <td className="px-3 py-1.5 text-xs">{c.temperature}°C</td>
                            <td className="px-3 py-1.5 text-xs text-right font-mono">{c.count || 1}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Method Distribution + NMR */}
          {(result.method_distribution || result.nmr_recommendation) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Method Distribution */}
              {result.method_distribution && result.method_distribution.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> 구조결정 방법론 분포
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {result.method_distribution.map((m) => (
                        <div key={m.method} className="flex items-center gap-2">
                          <span className="text-xs w-24 truncate" title={m.method}>{m.method}</span>
                          <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded" style={{ width: `${m.pct}%` }} />
                          </div>
                          <span className="text-xs font-mono w-20 text-right">
                            {m.pct}% ({m.count})
                          </span>
                          {m.avg_resolution && (
                            <span className="text-[10px] text-muted-foreground w-12 text-right">{m.avg_resolution}A</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* NMR Recommendation */}
              {result.nmr_recommendation && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Radio className="h-4 w-4" /> NMR 실험 조건 추천
                      <Badge variant="outline" className="text-[10px] font-normal">{result.nmr_recommendation.total}건</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Field */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Field Strength</p>
                        <div className="space-y-0.5">
                          {result.nmr_recommendation.top_fields.map((f) => (
                            <div key={f.label} className="flex justify-between text-xs">
                              <span className="font-medium">{f.label}</span>
                              <span className="text-muted-foreground">{f.count}건</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* pH */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Sample pH</p>
                        <div className="space-y-0.5">
                          {result.nmr_recommendation.top_ph.map((p) => (
                            <div key={p.label} className="flex justify-between text-xs">
                              <span className="font-medium">pH {p.label}</span>
                              <span className="text-muted-foreground">{p.count}건</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Temperature */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Temperature</p>
                        <div className="space-y-0.5">
                          {result.nmr_recommendation.top_temperature.map((t) => (
                            <div key={t.label} className="flex justify-between text-xs">
                              <span className="font-medium">{t.label}</span>
                              <span className="text-muted-foreground">{t.count}건</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Labelling */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Labelling</p>
                        <div className="space-y-0.5">
                          {result.nmr_recommendation.top_labelling.map((l) => (
                            <div key={l.label} className="flex justify-between text-xs">
                              <span className="font-mono text-[10px]">{l.label}</span>
                              <span className="text-muted-foreground">{l.count}건</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Ionic Strength */}
                    {result.nmr_recommendation.top_ionic_strength.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Buffer / Ionic Strength</p>
                        <div className="flex flex-wrap gap-1">
                          {result.nmr_recommendation.top_ionic_strength.map((is) => (
                            <Badge key={is.label} variant="secondary" className="text-[10px]">{is.label} ({is.count})</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Conformers */}
                    {result.nmr_recommendation.avg_conformers != null && (
                      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                        평균 앙상블: <span className="font-medium">{result.nmr_recommendation.avg_conformers} conformers</span>
                        {result.nmr_recommendation.avg_conformers > 30 && (
                          <span className="text-amber-600 ml-2">— 유연한 단백질, 결정화 시 리간드 결합 상태 권장</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Similar Proteins */}
          <Card>
            <CardHeader><CardTitle className="text-base">유사 단백질 ({result.similar_proteins_sample.length}건)</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {result.similar_proteins_sample.map((p, i) => (
                  <div key={i} className="rounded-lg border p-2 text-xs">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground ml-1">({p.organism?.slice(0, 15)})</span>
                    <Badge variant="outline" className="ml-1 text-[10px]">{p.similarity}%</Badge>
                    {p.mw && <span className="text-muted-foreground ml-1">{p.mw}kDa</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface AiStrategyStructured {
  construct?: string;
  expression?: string;
  crystallization?: string;
  nmr?: string | null;
  avoid?: string;
  summary?: string;
}

const STRATEGY_SECTIONS: { key: keyof AiStrategyStructured; label: string; icon: string; color: string }[] = [
  { key: 'summary', label: '핵심 요약', icon: '💡', color: 'bg-primary/5 border-primary/20' },
  { key: 'construct', label: 'Construct 설계', icon: '🧬', color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  { key: 'expression', label: '발현 조건', icon: '🧪', color: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  { key: 'crystallization', label: '결정화 전략', icon: '💎', color: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  { key: 'nmr', label: 'NMR 대안', icon: '📡', color: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800' },
  { key: 'avoid', label: '피해야 할 조건', icon: '⚠️', color: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
];

function parseStrategy(raw: string): AiStrategyStructured | null {
  // 1차: 직접 파싱
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && (parsed.construct || parsed.crystallization)) return parsed;
  } catch { /* continue */ }

  // 2차: 문자열 내 JSON 추출 (GPT가 앞뒤에 텍스트를 붙인 경우)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object' && (parsed.construct || parsed.crystallization)) return parsed;
    } catch { /* continue */ }
  }

  return null;
}

function AiStrategyCard({ strategy }: { strategy: string }) {
  const structured = parseStrategy(strategy);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI 실험 전략
        </CardTitle>
      </CardHeader>
      <CardContent>
        {structured ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {STRATEGY_SECTIONS.map(({ key, label, icon, color }) => {
              const value = structured[key];
              if (!value) return null;
              const isWide = key === 'summary' || key === 'crystallization';
              return (
                <div key={key} className={`rounded-lg border p-3 ${color} ${isWide ? 'md:col-span-2' : ''}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{icon}</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{value}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{strategy}</p>
        )}
      </CardContent>
    </Card>
  );
}
