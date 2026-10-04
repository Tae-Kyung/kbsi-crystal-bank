import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dna, FlaskConical, Gem, TestTubes, Pill, ClipboardCheck, Beaker, Link2 } from 'lucide-react';
import { CrystallizationHeatmap } from '@/components/charts/crystallization-heatmap';
import { OutcomeDistribution } from '@/components/charts/outcome-distribution';
import { PipelineFunnel } from '@/components/charts/pipeline-funnel';
import { SourceDistribution } from '@/components/charts/source-distribution';

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch counts in parallel
  const [proteins, constructs, expressions, purifications, crystallizations, structures, ligands, bindings, staging] = await Promise.all([
    supabase.from('kbsi_protein').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_construct').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_expression').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_purification').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_structure').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_ligand').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_construct_ligand').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_extraction_staging').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
  ]);

  const stats = [
    { label: 'Proteins', value: proteins.count ?? 0, icon: Dna },
    { label: 'Constructs', value: constructs.count ?? 0, icon: FlaskConical },
    { label: 'Crystallizations', value: crystallizations.count ?? 0, icon: Gem },
    { label: 'Structures', value: structures.count ?? 0, icon: Pill },
    { label: 'Ligands', value: ligands.count ?? 0, icon: Beaker },
    { label: 'Bindings', value: bindings.count ?? 0, icon: Link2 },
  ];

  // ─── 차트용 집계 쿼리 (전체 행 fetch 대신 DB count 쿼리) ───

  const OUTCOMES = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'] as const;

  // Outcome 분포 — outcome별 정확한 count (100% 정확, 행 데이터 없음)
  const [outcomeResults, syntheticResults] = await Promise.all([
    // 전체 outcome별 count
    Promise.all(OUTCOMES.map(async (outcome) => {
      const { count } = await supabase.from('kbsi_crystallization')
        .select('id', { count: 'exact', head: true }).eq('outcome', outcome);
      return { outcome, total: count ?? 0 };
    })),
    // synthetic outcome별 count
    Promise.all(OUTCOMES.map(async (outcome) => {
      const { count } = await supabase.from('kbsi_crystallization')
        .select('id', { count: 'exact', head: true }).eq('outcome', outcome).eq('source_type', 'synthetic');
      return { outcome, synthetic: count ?? 0 };
    })),
  ]);

  const outcomeDistData = OUTCOMES.map((outcome) => {
    const total = outcomeResults.find(r => r.outcome === outcome)?.total ?? 0;
    const synthetic = syntheticResults.find(r => r.outcome === outcome)?.synthetic ?? 0;
    return { outcome, real: total - synthetic, synthetic };
  }).filter(d => d.real + d.synthetic > 0);

  // Scatter chart — outcome별 균등 샘플링 (각 outcome에서 최대 400건씩, 대표성 확보)
  const SAMPLE_PER_OUTCOME = 400;
  const heatmapPages = await Promise.all(
    OUTCOMES.map(async (outcome) => {
      const { data } = await supabase
        .from('kbsi_crystallization')
        .select('ph, temperature, outcome, precipitant_type, source_type')
        .eq('outcome', outcome)
        .not('ph', 'is', null)
        .not('temperature', 'is', null)
        .limit(SAMPLE_PER_OUTCOME);
      return data || [];
    })
  );
  const heatmapData = heatmapPages.flat();

  // Data Overview — count 쿼리 (전체 행 fetch 불필요)
  const successTotal = outcomeResults
    .filter(r => r.outcome === 'single_crystal' || r.outcome === 'diffraction_quality')
    .reduce((sum, r) => sum + r.total, 0);
  const failureTotal = outcomeResults
    .filter(r => r.outcome === 'clear' || r.outcome === 'precipitate')
    .reduce((sum, r) => sum + r.total, 0);
  const syntheticTotal = syntheticResults.reduce((sum, r) => sum + r.synthetic, 0);

  // source_db별 데이터 현황 (결정화 + 구조 + 리간드)
  const SOURCE_DBS = ['PDB', 'TargetTrack', 'ChEMBL', 'KBSI', 'synthetic'] as const;
  const [sourceDbCryst, sourceDbStruct, sourceDbLigand] = await Promise.all([
    Promise.all(SOURCE_DBS.map(async (db) => {
      const { count } = await supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('source_db', db);
      return { source_db: db, count: count ?? 0 };
    })),
    Promise.all(SOURCE_DBS.filter(db => db !== 'synthetic').map(async (db) => {
      const { count } = await supabase.from('kbsi_structure').select('id', { count: 'exact', head: true }).eq('source_db', db);
      return { source_db: db, count: count ?? 0 };
    })),
    Promise.all(['ChEMBL'].map(async (db) => {
      const { count } = await supabase.from('kbsi_ligand').select('id', { count: 'exact', head: true }).eq('source_db', db);
      return { source_db: db, count: count ?? 0 };
    })),
  ]);
  // 미분류
  const { count: unclassifiedCount } = await supabase.from('kbsi_crystallization')
    .select('id', { count: 'exact', head: true }).is('source_db', null);
  if ((unclassifiedCount ?? 0) > 0) {
    sourceDbCryst.push({ source_db: 'unknown' as any, count: unclassifiedCount ?? 0 });
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
                  <div className="text-2xl font-bold">{value.toLocaleString()}</div>
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
              <div className="text-2xl font-bold">{(crystallizations.count ?? 0).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">전체 데이터</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{successTotal.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">성공 (결정)</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950">
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">{failureTotal.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">실패 (투명/침전)</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{syntheticTotal.toLocaleString()}</div>
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
              (outcome별 균등 샘플 {heatmapData.length.toLocaleString()}건)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CrystallizationHeatmap data={heatmapData ?? []} />
        </CardContent>
      </Card>

      {/* Data Source Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Crystallization by Source</CardTitle></CardHeader>
          <CardContent>
            <SourceDistribution data={sourceDbCryst} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Structures by Source</CardTitle></CardHeader>
          <CardContent>
            <SourceDistribution data={sourceDbStruct} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Ligands by Source</CardTitle></CardHeader>
          <CardContent>
            <SourceDistribution data={sourceDbLigand} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
