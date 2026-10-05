import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dna, FlaskConical, Gem, TestTubes, Pill, ClipboardCheck, Beaker, Link2, Microscope, Radiation } from 'lucide-react';
import { CrystallizationHeatmap } from '@/components/charts/crystallization-heatmap';
import { OutcomeDistribution } from '@/components/charts/outcome-distribution';
import { PipelineFunnel } from '@/components/charts/pipeline-funnel';
import { SourceDistribution } from '@/components/charts/source-distribution';
import { DataInsights } from '@/components/charts/data-insights';
import { PipelineSankey } from '@/components/charts/pipeline-sankey';
import Link from 'next/link';

// ISR: 60초마다 재생성 (매 요청마다 39개 쿼리 방지)
export const revalidate = 60;

export default async function DashboardPage() {
  const supabase = await createClient();

  const OUTCOMES = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'] as const;
  const SOURCE_DBS = ['PDB', 'TargetTrack', 'ChEMBL', 'KBSI', 'synthetic'] as const;
  const SAMPLE_PER_OUTCOME = 400;

  // ─── 모든 쿼리를 하나의 Promise.all로 통합 (4 왕복 → 1 왕복) ───
  const [
    // Stats (11개)
    proteins, constructs, expressions, purifications, characterizations_count, crystallizations, diffractions, structures, ligands, bindings, staging,
    // Outcome 분포 (12개)
    ...outcomeAndSynthetic
  ] = await Promise.all([
    supabase.from('kbsi_protein').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_construct').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_expression').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_purification').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_characterization').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_diffraction').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_structure').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_ligand').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_construct_ligand').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_extraction_staging').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
    // Outcome total (6개)
    ...OUTCOMES.map(outcome => supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('outcome', outcome)),
    // Outcome synthetic (6개)
    ...OUTCOMES.map(outcome => supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('outcome', outcome).eq('source_type', 'synthetic')),
  ]);

  const stats = [
    { label: 'Proteins', value: proteins.count ?? 0, icon: Dna },
    { label: 'Constructs', value: constructs.count ?? 0, icon: FlaskConical },
    { label: 'Crystallizations', value: crystallizations.count ?? 0, icon: Gem },
    { label: 'Diffractions', value: diffractions.count ?? 0, icon: Radiation },
    { label: 'Structures', value: structures.count ?? 0, icon: Pill },
    { label: 'Characterizations', value: characterizations_count.count ?? 0, icon: Microscope },
    { label: 'Ligands', value: ligands.count ?? 0, icon: Beaker },
    { label: 'Bindings', value: bindings.count ?? 0, icon: Link2 },
  ];

  // Outcome 분포 파싱
  const outcomeResults = OUTCOMES.map((outcome, i) => ({ outcome, total: outcomeAndSynthetic[i]?.count ?? 0 }));
  const syntheticResults = OUTCOMES.map((outcome, i) => ({ outcome, synthetic: outcomeAndSynthetic[i + 6]?.count ?? 0 }));

  const outcomeDistData = OUTCOMES.map((outcome) => {
    const total = outcomeResults.find(r => r.outcome === outcome)?.total ?? 0;
    const synthetic = syntheticResults.find(r => r.outcome === outcome)?.synthetic ?? 0;
    return { outcome, real: total - synthetic, synthetic };
  }).filter(d => d.real + d.synthetic > 0);

  // 나머지 쿼리 (scatter + source + recent) — 2번째 병렬 배치
  const [heatmapPages, sourceDbCryst, sourceDbStruct, sourceDbLigand, unclassified, recentProteinsRes] = await Promise.all([
    // Scatter 샘플 (6개)
    Promise.all(OUTCOMES.map(async (outcome) => {
      const { data } = await supabase
        .from('kbsi_crystallization')
        .select('ph, temperature, outcome, precipitant_type, source_type')
        .eq('outcome', outcome).not('ph', 'is', null).not('temperature', 'is', null)
        .limit(SAMPLE_PER_OUTCOME);
      return data || [];
    })),
    // Source 분포 crystallization (5개)
    Promise.all(SOURCE_DBS.map(async (db) => {
      const { count } = await supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('source_db', db);
      return { source_db: db, count: count ?? 0 };
    })),
    // Source 분포 structure (4개)
    Promise.all(SOURCE_DBS.filter(db => db !== 'synthetic').map(async (db) => {
      const { count } = await supabase.from('kbsi_structure').select('id', { count: 'exact', head: true }).eq('source_db', db);
      return { source_db: db, count: count ?? 0 };
    })),
    // Source 분포 ligand (1개)
    Promise.all(['ChEMBL'].map(async (db) => {
      const { count } = await supabase.from('kbsi_ligand').select('id', { count: 'exact', head: true }).eq('source_db', db);
      return { source_db: db, count: count ?? 0 };
    })),
    // 미분류 (1개)
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).is('source_db', null),
    // Recent proteins (1개)
    supabase.from('kbsi_protein').select('id, full_name, abbreviation, organism, updated_at, kbsi_construct(count)').order('updated_at', { ascending: false }).limit(5),
  ]);

  const heatmapData = heatmapPages.flat();
  if ((unclassified.count ?? 0) > 0) {
    sourceDbCryst.push({ source_db: 'unknown' as any, count: unclassified.count ?? 0 });
  }
  const recentProteins = recentProteinsRes.data;

  const successTotal = outcomeResults.filter(r => r.outcome === 'single_crystal' || r.outcome === 'diffraction_quality').reduce((sum, r) => sum + r.total, 0);
  const failureTotal = outcomeResults.filter(r => r.outcome === 'clear' || r.outcome === 'precipitate').reduce((sum, r) => sum + r.total, 0);
  const syntheticTotal = syntheticResults.reduce((sum, r) => sum + r.synthetic, 0);

  const pipelineData = {
    expressions: expressions.count ?? 0,
    purifications: purifications.count ?? 0,
    characterizations: characterizations_count.count ?? 0,
    crystallizations: crystallizations.count ?? 0,
    diffractions: diffractions.count ?? 0,
    structures: structures.count ?? 0,
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
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

      {/* Recent Proteins */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Proteins</CardTitle>
          <Link href="/proteins"><Button variant="outline" size="sm">View All</Button></Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {(recentProteins || []).map((p: any) => (
              <Link key={p.id} href={`/proteins/${p.id}`}>
                <div className="rounded-lg border p-3 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="font-medium text-sm truncate">{p.abbreviation || p.full_name?.slice(0, 15)}</div>
                  <div className="text-xs text-muted-foreground italic truncate">{p.organism || '-'}</div>
                  <div className="text-xs text-muted-foreground mt-1">{p.kbsi_construct?.[0]?.count ?? 0} constructs</div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Data Pipeline Flow</CardTitle></CardHeader>
          <CardContent>
            <PipelineSankey data={{
              expression: pipelineData.expressions,
              purification: pipelineData.purifications,
              characterization: pipelineData.characterizations,
              crystallization: pipelineData.crystallizations,
              diffraction: pipelineData.diffractions,
              structure: pipelineData.structures,
              ligands: ligands.count ?? 0,
              bindings: bindings.count ?? 0,
            }} />
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

      {/* Cross-Analysis Insights */}
      <DataInsights />

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
