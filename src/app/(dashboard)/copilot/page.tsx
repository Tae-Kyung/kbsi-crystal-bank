'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, AlertTriangle, CheckCircle2, Beaker } from 'lucide-react';

interface CopilotResult {
  analysis: {
    similar_proteins: number;
    total_crystallization: number;
    success_count: number;
    failure_count: number;
    success_rate: number;
    expression_data: number;
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
    top_conditions: { precipitant: string; conc: number; buffer: string; ph: number; temperature: number }[];
  };
  avoid: string[];
  similar_proteins_sample: { name: string; organism: string; similarity: number; mw: number | null }[];
  error?: string;
}

const EXAMPLE_SEQUENCE = `MTEYKLVVVGAVGVGKSALTIQLIQNHFVDEYDPTIEDSY
RKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCV
FAINNTKSFEDIHHQRQETKRRASYTEKEVKDFLARILSSA`;

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

  // DB 검색 자동완성
  useEffect(() => {
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
    setSearchOpen(false);
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
      if (data.error && !data.analysis) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError('분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1. 단백질 선택</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-2 border-b pb-2">
            <Button variant={mode === 'db' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('db')}>
              DB에서 검색 (정확)
            </Button>
            <Button variant={mode === 'sequence' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('sequence')}>
              서열 입력 (참고용)
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
                  <div className="absolute top-full mt-1 w-full rounded-lg border bg-popover shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
                    {searchResults.map((s: any) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleDbSelect(s.id, s.label)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <span className="font-medium">{s.label}</span>
                        {s.sub && <span className="text-xs text-muted-foreground ml-2">{s.sub}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />분석 중...
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-2">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  ⚠ k-mer 기반 유사도는 참고용입니다. 정확한 분석은 &quot;DB에서 검색&quot;을 사용하세요.
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
                  ) : 'k-mer 분석 (참고용)'}
                </Button>
                <Button disabled variant="outline" size="sm" className="opacity-50">
                  NCBI BLAST (추후개발)
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
            <CardHeader><CardTitle className="text-base">분석 요약</CardTitle></CardHeader>
            <CardContent>
              {(result.analysis as any).max_similarity < 20 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 mb-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    ⚠ 최고 유사도 {(result.analysis as any).max_similarity}% — DB에 높은 유사도의 단백질이 없습니다. 추천 결과는 일반적인 패턴 기반이며, 유사 단백질이 추가되면 정확도가 높아집니다.
                    ({(result.analysis as any).searched_constructs?.toLocaleString()}개 서열 검색됨)
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
                        <span className="text-red-500 mt-0.5">✕</span>
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
                      <span className="text-xs font-mono w-12 text-right">{p.rate}%</span>
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
                      <span className="text-xs font-mono w-12 text-right">{t.rate}%</span>
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
                      <span className="text-xs font-mono w-12 text-right">{p.rate}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Conditions */}
              {result.crystallization_recommendation.top_conditions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">추천 조건 (성공 사례 기반)</p>
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
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {result.crystallization_recommendation.top_conditions.slice(0, 12).map((c, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-xs font-bold text-blue-600">{i + 1}</td>
                            <td className="px-3 py-1.5 text-xs">{c.precipitant || '-'}</td>
                            <td className="px-3 py-1.5 text-xs">{c.conc ?? '-'}</td>
                            <td className="px-3 py-1.5 text-xs">{c.buffer || '-'}</td>
                            <td className="px-3 py-1.5 text-xs font-mono">{c.ph}</td>
                            <td className="px-3 py-1.5 text-xs">{c.temperature}°C</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

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
