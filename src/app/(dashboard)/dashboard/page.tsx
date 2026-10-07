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

  // ─── Stats: 개별 경량 쿼리 (RPC 타임아웃 대비) ───
  const countTable = async (table: string, filter?: { col: string; val: string }) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true }) as any;
    if (filter) q = q.eq(filter.col, filter.val);
    const { count } = await q;
    return count ?? 0;
  };

  // 배치 1: 기본 stats (가벼운 테이블 우선)
  const [proteinCount, constructCount, exprCount, purifCount, charCount, crystCount, diffrCount, structCount, ligandCount, bindingCount] = await Promise.all([
    countTable('kbsi_protein'),
    countTable('kbsi_construct'),
    countTable('kbsi_expression'),
    countTable('kbsi_purification'),
    countTable('kbsi_characterization'),
    countTable('kbsi_crystallization'),
    countTable('kbsi_diffraction'),
    countTable('kbsi_structure'),
    countTable('kbsi_ligand'),
    countTable('kbsi_construct_ligand'),
  ]);

  // 배치 2: outcome + source + scatter + recent
  const [
    oClear, oPrecip, oPhase, oMicro, oSingle, oDiffr,
    sClear, sPrecip, sPhase, sMicro, sSingle, sDiffr,
    heatmapPages, recentProteinsRes,
  ] = await Promise.all([
    countTable('kbsi_crystallization', { col: 'outcome', val: 'clear' }),
    countTable('kbsi_crystallization', { col: 'outcome', val: 'precipitate' }),
    countTable('kbsi_crystallization', { col: 'outcome', val: 'phase_separation' }),
    countTable('kbsi_crystallization', { col: 'outcome', val: 'microcrystal' }),
    countTable('kbsi_crystallization', { col: 'outcome', val: 'single_crystal' }),
    countTable('kbsi_crystallization', { col: 'outcome', val: 'diffraction_quality' }),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('outcome', 'clear').eq('source_type', 'synthetic').then(r => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('outcome', 'precipitate').eq('source_type', 'synthetic').then(r => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('outcome', 'phase_separation').eq('source_type', 'synthetic').then(r => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('outcome', 'microcrystal').eq('source_type', 'synthetic').then(r => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('outcome', 'single_crystal').eq('source_type', 'synthetic').then(r => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('outcome', 'diffraction_quality').eq('source_type', 'synthetic').then(r => r.count ?? 0),
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

  const stats = [
    { label: 'Proteins', value: proteinCount, icon: Dna },
    { label: 'Constructs', value: constructCount, icon: FlaskConical },
    { label: 'Crystallizations', value: crystCount, icon: Gem },
    { label: 'Diffractions', value: diffrCount, icon: Radiation },
    { label: 'Structures', value: structCount, icon: Pill },
    { label: 'Characterizations', value: charCount, icon: Microscope },
    { label: 'Ligands', value: ligandCount, icon: Beaker },
    { label: 'Bindings', value: bindingCount, icon: Link2 },
  ];

  // Outcome 분포
  const outcomeMap = { clear: oClear, precipitate: oPrecip, phase_separation: oPhase, microcrystal: oMicro, single_crystal: oSingle, diffraction_quality: oDiffr };
  const syntheticMap = { clear: sClear, precipitate: sPrecip, phase_separation: sPhase, microcrystal: sMicro, single_crystal: sSingle, diffraction_quality: sDiffr };
  const outcomeDistData = OUTCOMES.map((outcome) => {
    const total = outcomeMap[outcome] ?? 0;
    const synthetic = syntheticMap[outcome] ?? 0;
    return { outcome, real: total - synthetic, synthetic };
  }).filter(dd => dd.real + dd.synthetic > 0);

  const heatmapData = heatmapPages.flat();
  const recentProteins = recentProteinsRes.data;

  const successTotal = oSingle + oDiffr;
  const failureTotal = oClear + oPrecip;
  const syntheticTotal = sClear + sPrecip + sPhase + sMicro + sSingle + sDiffr;

  // Source 분포는 간소화 (총 건수로 대체, 개별 source 쿼리 제거)
  const experimentalCryst = crystCount - syntheticTotal;
  const sourceDbCryst = [
    { source_db: 'Experimental', count: experimentalCryst },
    { source_db: 'Synthetic', count: syntheticTotal },
  ];
  const sourceDbStruct = [
    { source_db: 'PDB', count: structCount },
  ];
  const sourceDbLigand = [
    { source_db: 'PDB + ChEMBL', count: ligandCount },
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
              expression: exprCount,
              purification: purifCount,
              characterization: charCount,
              crystallization: crystCount,
              diffraction: diffrCount,
              structure: structCount,
              ligands: ligandCount,
              bindings: bindingCount,
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
              <div className="text-2xl font-bold">{crystCount.toLocaleString()}</div>
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
