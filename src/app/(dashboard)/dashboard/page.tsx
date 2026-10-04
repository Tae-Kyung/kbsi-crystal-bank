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

  // Fetch crystallization data for charts (source_type 포함)
  // Supabase 기본 limit=1000이므로 전체 데이터를 가져오려면 pagination 필요
  const crystTotal = crystallizations.count ?? 0;
  let crystData: any[] = [];
  const PAGE_SIZE = 1000;
  for (let offset = 0; offset < crystTotal; offset += PAGE_SIZE) {
    const { data: page } = await supabase
      .from('kbsi_crystallization')
      .select('ph, temperature, outcome, precipitant_type, source_type')
      .range(offset, offset + PAGE_SIZE - 1);
    if (page) crystData = crystData.concat(page);
  }

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
            <OutcomeDistribution data={crystData ?? []} />
          </CardContent>
        </Card>
      </div>

      {/* Data Source Distribution */}
      {(() => {
        const all = crystData ?? [];
        const experimental = all.filter((d: any) => d.source_type === 'experimental' || d.source_type === 'database');
        const synthetic = all.filter((d: any) => d.source_type === 'synthetic');
        const success = all.filter((d: any) => d.outcome === 'diffraction_quality' || d.outcome === 'single_crystal');
        const failure = all.filter((d: any) => d.outcome === 'clear' || d.outcome === 'precipitate');
        return (
          <Card>
            <CardHeader><CardTitle className="text-base">Crystallization Data Overview</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <div className="text-2xl font-bold">{all.length}</div>
                  <div className="text-xs text-muted-foreground">전체 데이터</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">{success.length}</div>
                  <div className="text-xs text-muted-foreground">성공 (결정)</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-300">{failure.length}</div>
                  <div className="text-xs text-muted-foreground">실패 (투명/침전)</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
                  <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{synthetic.length}</div>
                  <div className="text-xs text-muted-foreground">합성 데이터</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader><CardTitle className="text-base">Crystallization Conditions (pH vs Temperature)</CardTitle></CardHeader>
        <CardContent>
          <CrystallizationHeatmap data={crystData ?? []} />
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
