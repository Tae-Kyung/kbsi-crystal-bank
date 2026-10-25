'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  FileJson,
  ChevronDown,
  ChevronUp,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HypothesisResult {
  id: string;
  name: string;
  h0: string;
  h1: string;
  status: 'confirmed' | 'rejected' | 'inconclusive' | 'error';
  p_value: number | null;
  statistic: number | null;
  effect_size: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  sample_size: number;
  test_type: string;
  summary: string;
  data: {
    query_rows?: number;
    raw_sample?: Record<string, unknown>[];
    stats?: Record<string, unknown>;
    sql?: string;
  };
  timestamp: string;
  source: 'built-in' | 'discovered';
}

interface ApiResponse {
  total: number;
  confirmed: number;
  rejected: number;
  inconclusive: number;
  errors: number;
  results: HypothesisResult[];
  message?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  confirmed: {
    bg: 'bg-green-100 dark:bg-green-900',
    text: 'text-green-800 dark:text-green-200',
  },
  rejected: {
    bg: 'bg-red-100 dark:bg-red-900',
    text: 'text-red-800 dark:text-red-200',
  },
  inconclusive: {
    bg: 'bg-yellow-100 dark:bg-yellow-900',
    text: 'text-yellow-800 dark:text-yellow-200',
  },
  error: {
    bg: 'bg-gray-100 dark:bg-gray-900',
    text: 'text-gray-800 dark:text-gray-200',
  },
};

const EXPERIMENT_SUGGESTIONS: Record<string, string> = {
  PH001: 'Test crystallization of small (<20kDa) vs large (>100kDa) proteins under identical conditions (PEG 3350, pH 7.0, 18C) to verify MW effect on crystal quality.',
  PH002: 'Compare crystallization success across 5 organisms using standardized JCSG+ screen to verify organism-specific optimization.',
  PH003: 'Express the same protein in E. coli BL21(DE3) vs BL21-Gold vs insect cells, then crystallize under identical conditions.',
  PH004: 'Screen PEG 1000/3350/8000/20000 against proteins of varying MW (10/30/50/100 kDa) to map the PEG-protein MW correlation.',
  PH005: 'Crystallize 10 proteins with and without their known ligands to verify ligand stabilization effect.',
  PH006: 'Set up duplicate crystallization plates at 4C and 18C for 20 proteins to quantify temperature effect.',
  PH007: 'Screen PEG 3350 pH 5-9 and Ammonium Sulfate pH 5-9 in parallel to map optimal pH per precipitant.',
  PH008: 'Add glycerol, DTT, or MgCl2 to existing crystallization conditions that failed, to test if additives rescue crystallization.',
  D001: 'Compare crystallization of S. stipitis vs S. habrochaites proteins to understand organism-specific factors.',
  D002: 'Use 3-methyl-1,5-pentanediol as precipitant for proteins targeting sub-1A resolution.',
  D003: 'Screen C. parasitica proteins at pH 4-5 (vs standard pH 7) to verify acidic pH preference.',
  D004: 'Crystallize B. diminuta proteins exclusively at 4C to leverage its cold-preference.',
  D005: 'Optimize precipitant concentration in 15-35% range with fine grid (2% steps) for maximum success rate.',
};

export default function AiScientistPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/ai-scientist')
      .then(res => res.json())
      .then((json: ApiResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const results = data?.results ?? [];
  const selectedHypothesis = results.find(r => r.id === selectedId);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6" />
          AI Scientist
        </h2>
        <p className="text-muted-foreground">
          자율 가설 생성 + 검증 + 데이터 분석
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading hypothesis results...
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p>No results yet.</p>
            <p className="mt-2">
              Run: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">npx tsx scripts/ai-scientist-v2.ts</code>
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold">{data?.total ?? 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Hypotheses</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {data?.confirmed ?? 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  Confirmed
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {data?.rejected ?? 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                  Rejected
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                  {(data?.inconclusive ?? 0) + (data?.errors ?? 0)}
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
                  Inconclusive / Error
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Download Buttons */}
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/ai-scientist/export?format=sakana"
              download
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              <FileJson className="h-4 w-4 mr-2" />
              Sakana AI Input (JSON)
            </a>
            <a
              href="/api/ai-scientist/export?format=sakana"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              <Download className="h-4 w-4 mr-2" />
              Full Report
            </a>
          </div>

          {/* Hypothesis Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Hypothesis Results ({results.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium w-8"></th>
                      <th className="px-3 py-2 text-left font-medium">ID</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">p-value</th>
                      <th className="px-3 py-2 text-right font-medium">Effect Size</th>
                      <th className="px-3 py-2 text-right font-medium">Sample Size</th>
                      <th className="px-3 py-2 text-left font-medium">Source</th>
                      <th className="px-3 py-2 text-left font-medium">Test Type</th>
                      <th className="px-3 py-2 text-left font-medium">Last Run</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {results.map(r => (
                      <>
                        <tr
                          key={r.id}
                          className={`hover:bg-muted/30 cursor-pointer ${
                            selectedId === r.id ? 'bg-muted/40' : ''
                          }`}
                          onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                        >
                          <td className="px-3 py-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleRow(r.id); }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {expandedRows.has(r.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-xs font-mono font-medium">{r.id}</td>
                          <td className="px-3 py-2 text-xs">{r.name}</td>
                          <td className="px-3 py-2">
                            <Badge className={`text-[10px] ${STATUS_STYLES[r.status]?.bg ?? ''} ${STATUS_STYLES[r.status]?.text ?? ''}`}>
                              {r.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-right">
                            {r.p_value != null ? r.p_value.toExponential(2) : '-'}
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-right">
                            {r.effect_size != null ? r.effect_size.toFixed(4) : '-'}
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-right">
                            {r.sample_size.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-xs">{r.source}</td>
                          <td className="px-3 py-2 text-xs font-mono">{r.test_type}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {r.timestamp ? new Date(r.timestamp).toLocaleDateString('ko-KR') : '-'}
                          </td>
                        </tr>
                        {expandedRows.has(r.id) && (
                          <tr key={`${r.id}-summary`}>
                            <td colSpan={10} className="px-6 py-3 bg-muted/20 text-xs text-muted-foreground">
                              {r.summary}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Hypothesis Detail */}
          {selectedHypothesis && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge className={`${STATUS_STYLES[selectedHypothesis.status]?.bg ?? ''} ${STATUS_STYLES[selectedHypothesis.status]?.text ?? ''}`}>
                    {selectedHypothesis.status}
                  </Badge>
                  {selectedHypothesis.id} — {selectedHypothesis.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* H0 / H1 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs font-medium text-muted-foreground mb-1">H0 (Null Hypothesis)</div>
                    <div className="text-sm">{selectedHypothesis.h0}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs font-medium text-muted-foreground mb-1">H1 (Alternative Hypothesis)</div>
                    <div className="text-sm">{selectedHypothesis.h1}</div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">Test Type</div>
                    <div className="text-sm font-mono font-medium mt-1">{selectedHypothesis.test_type}</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">p-value</div>
                    <div className="text-sm font-mono font-medium mt-1">
                      {selectedHypothesis.p_value != null ? selectedHypothesis.p_value.toExponential(3) : '-'}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">Effect Size</div>
                    <div className="text-sm font-mono font-medium mt-1">
                      {selectedHypothesis.effect_size != null ? selectedHypothesis.effect_size.toFixed(4) : '-'}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">Sample Size</div>
                    <div className="text-sm font-mono font-medium mt-1">
                      {selectedHypothesis.sample_size.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">CI</div>
                    <div className="text-sm font-mono font-medium mt-1">
                      {selectedHypothesis.ci_lower != null && selectedHypothesis.ci_upper != null
                        ? `[${selectedHypothesis.ci_lower.toFixed(3)}, ${selectedHypothesis.ci_upper.toFixed(3)}]`
                        : '-'}
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-lg border p-4">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Summary</div>
                  <div className="text-sm">{selectedHypothesis.summary}</div>
                </div>

                {/* Raw Data Sample */}
                {selectedHypothesis.data?.raw_sample && selectedHypothesis.data.raw_sample.length > 0 && (
                  <div className="rounded-lg border p-4">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Raw Data Sample</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            {Object.keys(selectedHypothesis.data.raw_sample[0]).map(key => (
                              <th key={key} className="px-2 py-1.5 text-left font-medium">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedHypothesis.data.raw_sample.map((row, idx) => (
                            <tr key={idx} className="hover:bg-muted/30">
                              {Object.values(row).map((val, ci) => (
                                <td key={ci} className="px-2 py-1.5 font-mono">
                                  {val != null ? String(val) : '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Suggested Experiment */}
                {EXPERIMENT_SUGGESTIONS[selectedHypothesis.id] && (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4">
                    <div className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                      Suggested Experiment
                    </div>
                    <div className="text-sm text-blue-900 dark:text-blue-100">
                      {EXPERIMENT_SUGGESTIONS[selectedHypothesis.id]}
                    </div>
                  </div>
                )}

                {/* Download Dataset */}
                <div className="flex gap-3">
                  <a
                    href={`/api/ai-scientist/export?format=dataset&id=${selectedHypothesis.id}`}
                    download
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Dataset (CSV)
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Commands Reference */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Commands Reference
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-muted/50 p-4 font-mono text-xs space-y-1.5">
                <div><span className="text-muted-foreground"># Run all hypotheses</span></div>
                <div>npx tsx scripts/ai-scientist-v2.ts</div>
                <div className="mt-2"><span className="text-muted-foreground"># Auto-discover new hypotheses</span></div>
                <div>npx tsx scripts/ai-scientist-v2.ts --discover</div>
                <div className="mt-2"><span className="text-muted-foreground"># Generate report</span></div>
                <div>npx tsx scripts/ai-scientist-v2.ts --report</div>
                <div className="mt-2"><span className="text-muted-foreground"># Run specific hypothesis</span></div>
                <div>npx tsx scripts/ai-scientist-v2.ts --hypothesis PH001</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
