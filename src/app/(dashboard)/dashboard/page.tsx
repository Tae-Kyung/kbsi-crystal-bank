import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dna, FlaskConical, Gem, TestTubes, Pill, ClipboardCheck } from 'lucide-react';
import { CrystallizationHeatmap } from '@/components/charts/crystallization-heatmap';
import { OutcomeDistribution } from '@/components/charts/outcome-distribution';
import { PipelineFunnel } from '@/components/charts/pipeline-funnel';
import { BenchmarkResults } from '@/components/charts/benchmark-results';

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch counts in parallel
  const [proteins, constructs, expressions, purifications, crystallizations, structures, staging] = await Promise.all([
    supabase.from('kbsi_protein').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_construct').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_expression').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_purification').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_structure').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_extraction_staging').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
  ]);

  const stats = [
    { label: 'Proteins', value: proteins.count ?? 0, icon: Dna },
    { label: 'Constructs', value: constructs.count ?? 0, icon: FlaskConical },
    { label: 'Expressions', value: expressions.count ?? 0, icon: TestTubes },
    { label: 'Crystallizations', value: crystallizations.count ?? 0, icon: Gem },
    { label: 'Structures', value: structures.count ?? 0, icon: Pill },
    { label: 'Pending Review', value: staging.count ?? 0, icon: ClipboardCheck },
  ];

  // ─── 차트용 집계 쿼리 (전체 행 fetch 대신 DB에서 집계) ───

  // Outcome 분포 — 소량 쿼리로 집계 (outcome + source_type만 가져와서 서버에서 집계)
  const { data: rawOutcome } = await supabase
    .from('kbsi_crystallization')
    .select('outcome, source_type')
    .not('outcome', 'is', null)
    .limit(5000);
  const outcomeMap = new Map<string, { real: number; synthetic: number }>();
  for (const r of (rawOutcome || []) as any[]) {
    const key = r.outcome;
    if (!outcomeMap.has(key)) outcomeMap.set(key, { real: 0, synthetic: 0 });
    const entry = outcomeMap.get(key)!;
    if (r.source_type === 'synthetic') entry.synthetic++;
    else entry.real++;
  }
  const outcomeDistData = Array.from(outcomeMap.entries()).map(([outcome, counts]) => ({
    outcome, real: counts.real, synthetic: counts.synthetic,
  }));

  // Scatter chart — 샘플링 (최대 2000포인트)
  const { data: heatmapData } = await supabase
    .from('kbsi_crystallization')
    .select('ph, temperature, outcome, precipitant_type, source_type')
    .not('ph', 'is', null)
    .not('temperature', 'is', null)
    .not('outcome', 'is', null)
    .limit(2000);

  // Data Overview — count 쿼리 (전체 행 fetch 불필요)
  const [successCount, failureCount, syntheticCount] = await Promise.all([
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
      .or('outcome.eq.diffraction_quality,outcome.eq.single_crystal'),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
      .or('outcome.eq.clear,outcome.eq.precipitate'),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true })
      .eq('source_type', 'synthetic'),
  ]);

  // Fetch pipeline data
  const pipelineData = {
    expressions: expressions.count ?? 0,
    purifications: purifications.count ?? 0,
    crystallizations: crystallizations.count ?? 0,
    structures: structures.count ?? 0,
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Pipeline Funnel</CardTitle></CardHeader>
          <CardContent>
            <PipelineFunnel data={pipelineData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Crystallization Outcome Distribution</CardTitle></CardHeader>
          <CardContent>
            <OutcomeDistribution data={outcomeDistData} />
          </CardContent>
        </Card>
      </div>

      {/* Data Source Distribution */}
      <Card>
        <CardHeader><CardTitle className="text-base">Crystallization Data Overview</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="text-2xl font-bold">{crystallizations.count ?? 0}</div>
              <div className="text-xs text-muted-foreground">전체 데이터</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{successCount.count ?? 0}</div>
              <div className="text-xs text-muted-foreground">성공 (결정)</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950">
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">{failureCount.count ?? 0}</div>
              <div className="text-xs text-muted-foreground">실패 (투명/침전)</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{syntheticCount.count ?? 0}</div>
              <div className="text-xs text-muted-foreground">합성 데이터</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Crystallization Conditions (pH vs Temperature)
            <span className="text-xs font-normal text-muted-foreground ml-2">
              (최근 2,000건 샘플)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CrystallizationHeatmap data={heatmapData ?? []} />
        </CardContent>
      </Card>

      {/* ML Benchmark Results */}
      <Card>
        <CardHeader><CardTitle className="text-base">ML Prediction Benchmark (k-NN)</CardTitle></CardHeader>
        <CardContent>
          <BenchmarkResults />
        </CardContent>
      </Card>
    </div>
  );
}
