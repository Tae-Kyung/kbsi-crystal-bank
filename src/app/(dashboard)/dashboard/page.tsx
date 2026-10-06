import { createServiceClient } from '@/lib/supabase/service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dna, FlaskConical, Gem, Pill, Beaker, Link2, Microscope, Radiation } from 'lucide-react';
import { CrystallizationHeatmap } from '@/components/charts/crystallization-heatmap';
import { OutcomeDistribution } from '@/components/charts/outcome-distribution';
import { SourceDistribution } from '@/components/charts/source-distribution';
import { DataInsights } from '@/components/charts/data-insights';
import { PipelineSankey } from '@/components/charts/pipeline-sankey';
import Link from 'next/link';

// ISR: 10초 캐시 (RPC 2.4초 + 클라이언트 네비게이션 대응)
export const revalidate = 10;

export default async function DashboardPage() {
  const supabase = createServiceClient();

  const OUTCOMES = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'] as const;
  const SAMPLE_PER_OUTCOME = 400;

  // ─── 1개 RPC + scatter/recent만 병렬 ───
  const [rpcResult, heatmapPages, recentProteinsRes] = await Promise.all([
    supabase.rpc('dashboard_stats').then(r => r).catch(() => ({ data: null })),
    // Scatter 샘플
    Promise.all(OUTCOMES.map(async (outcome) => {
      const { data } = await supabase
        .from('kbsi_crystallization')
        .select('ph, temperature, outcome, precipitant_type, source_type')
        .eq('outcome', outcome).not('ph', 'is', null).not('temperature', 'is', null)
        .limit(SAMPLE_PER_OUTCOME);
      return data || [];
    })),
    // Recent proteins
    supabase.from('kbsi_protein').select('id, full_name, abbreviation, organism, updated_at, kbsi_construct(count)').order('updated_at', { ascending: false }).limit(5),
  ]);

  const d = (rpcResult?.data || {}) as any;

  const stats = [
    { label: 'Proteins', value: d.proteins ?? 0, icon: Dna },
    { label: 'Constructs', value: d.constructs ?? 0, icon: FlaskConical },
    { label: 'Crystallizations', value: d.crystallizations ?? 0, icon: Gem },
    { label: 'Diffractions', value: d.diffractions ?? 0, icon: Radiation },
    { label: 'Structures', value: d.structures ?? 0, icon: Pill },
    { label: 'Characterizations', value: d.characterizations ?? 0, icon: Microscope },
    { label: 'Ligands', value: d.ligands ?? 0, icon: Beaker },
    { label: 'Bindings', value: d.bindings ?? 0, icon: Link2 },
  ];

  // Outcome 분포
  const outcomeDistData = OUTCOMES.map((outcome) => {
    const total = d[`outcome_${outcome}`] ?? 0;
    const synthetic = d[`synthetic_${outcome}`] ?? 0;
    return { outcome, real: total - synthetic, synthetic };
  }).filter(dd => dd.real + dd.synthetic > 0);

  const heatmapData = heatmapPages.flat();
  const recentProteins = recentProteinsRes.data;

  const successTotal = (d.outcome_single_crystal ?? 0) + (d.outcome_diffraction_quality ?? 0);
  const failureTotal = (d.outcome_clear ?? 0) + (d.outcome_precipitate ?? 0);
  const syntheticTotal = OUTCOMES.reduce((sum, o) => sum + (d[`synthetic_${o}`] ?? 0), 0);

  const sourceDbCryst = [
    { source_db: 'PDB', count: d.source_cryst_pdb ?? 0 },
    { source_db: 'TargetTrack', count: d.source_cryst_targettrack ?? 0 },
    { source_db: 'ChEMBL', count: d.source_cryst_chembl ?? 0 },
    { source_db: 'KBSI', count: d.source_cryst_kbsi ?? 0 },
    { source_db: 'synthetic', count: d.source_cryst_synthetic ?? 0 },
    ...((d.source_cryst_unknown ?? 0) > 0 ? [{ source_db: 'unknown', count: d.source_cryst_unknown }] : []),
  ];
  const sourceDbStruct = [
    { source_db: 'PDB', count: d.source_struct_pdb ?? 0 },
    { source_db: 'TargetTrack', count: d.source_struct_targettrack ?? 0 },
    { source_db: 'ChEMBL', count: d.source_struct_chembl ?? 0 },
    { source_db: 'KBSI', count: d.source_struct_kbsi ?? 0 },
  ];
  const sourceDbLigand = [
    { source_db: 'ChEMBL', count: d.source_ligand_chembl ?? 0 },
  ];

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
              expression: d.expressions ?? 0,
              purification: d.purifications ?? 0,
              characterization: d.characterizations ?? 0,
              crystallization: d.crystallizations ?? 0,
              diffraction: d.diffractions ?? 0,
              structure: d.structures ?? 0,
              ligands: d.ligands ?? 0,
              bindings: d.bindings ?? 0,
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

      {/* Crystallization Data Overview */}
      <Card>
        <CardHeader><CardTitle className="text-base">Crystallization Data Overview</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="text-2xl font-bold">{(d.crystallizations ?? 0).toLocaleString()}</div>
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
