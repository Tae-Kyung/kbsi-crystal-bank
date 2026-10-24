import { query, queryOne, scalar } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dna, FlaskConical, Gem, Pill, Beaker, Link2, Microscope, Radiation, GitBranch, Radio } from 'lucide-react';
import { CrystallizationHeatmap } from '@/components/charts/crystallization-heatmap';
import { OutcomeDistribution } from '@/components/charts/outcome-distribution';
import { DataInsights } from '@/components/charts/data-insights';
import { PipelineSankey } from '@/components/charts/pipeline-sankey';
import Link from 'next/link';

// ISR: 30초 캐시 (Lab PG는 빠르므로 여유 있게)
export const revalidate = 30;

export default async function DashboardPage() {
  // ─── 기본 통계: Materialized View에서 즉시 조회 ───
  const dashRow = await query('SELECT * FROM mv_dashboard_stats').then(r => r[0] as any);

  const proteinCount = Number(dashRow?.proteins ?? 0);
  const constructCount = Number(dashRow?.constructs ?? 0);
  const crystCount = Number(dashRow?.crystallizations ?? 0);
  const structCount = Number(dashRow?.structures ?? 0);
  const exprCount = Number(dashRow?.expressions ?? 0);
  const diffrCount = Number(dashRow?.diffractions ?? 0);
  const ligandCount = Number(dashRow?.ligands ?? 0);

  // MV에 없는 나머지 카운트
  const [purifCount, charCount, bindingCount, mutationCount, nmrCount] = await Promise.all([
    scalar<number>('SELECT COUNT(*) FROM kbsi_purification'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_characterization'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_construct_ligand'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_mutation'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_nmr_experiment'),
  ]);

  // ─── Outcome 분포: 단일 쿼리로 ───
  const outcomeRows = await query<{ outcome: string; total: number; synthetic: number }>(
    `SELECT outcome,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE source_type = 'synthetic') AS synthetic
     FROM kbsi_crystallization
     WHERE outcome IS NOT NULL
     GROUP BY outcome
     ORDER BY total DESC`
  );

  const outcomeMap: Record<string, number> = {};
  const syntheticMap: Record<string, number> = {};
  for (const r of outcomeRows) {
    outcomeMap[r.outcome] = Number(r.total);
    syntheticMap[r.outcome] = Number(r.synthetic);
  }

  const OUTCOMES = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'] as const;
  const outcomeDistData = OUTCOMES.map(outcome => ({
    outcome,
    real: (outcomeMap[outcome] ?? 0) - (syntheticMap[outcome] ?? 0),
    synthetic: syntheticMap[outcome] ?? 0,
  })).filter(d => d.real + d.synthetic > 0);

  const oClear = outcomeMap['clear'] ?? 0;
  const oPrecip = outcomeMap['precipitate'] ?? 0;
  const oSingle = outcomeMap['single_crystal'] ?? 0;
  const oDiffr = outcomeMap['diffraction_quality'] ?? 0;
  const successTotal = oSingle + oDiffr;
  const failureTotal = oClear + oPrecip;
  const syntheticTotal = Object.values(syntheticMap).reduce((a, b) => a + b, 0);
  const experimentalCryst = crystCount - syntheticTotal;

  // ─── IQR Stats + Top Proteins + Precipitant pH Profile ───
  const [iqrPh, iqrTemp, iqrConc, topProteins, phProfile] = await Promise.all([
    queryOne<{ median: number; q1: number; q3: number; iqr: number }>(
      `SELECT * FROM iqr_stats(ARRAY(SELECT ph::float8 FROM kbsi_crystallization WHERE ph IS NOT NULL))`
    ),
    queryOne<{ median: number; q1: number; q3: number; iqr: number }>(
      `SELECT * FROM iqr_stats(ARRAY(SELECT temperature::float8 FROM kbsi_crystallization WHERE temperature IS NOT NULL))`
    ),
    queryOne<{ median: number; q1: number; q3: number; iqr: number }>(
      `SELECT * FROM iqr_stats(ARRAY(SELECT precipitant_conc::float8 FROM kbsi_crystallization WHERE precipitant_conc IS NOT NULL))`
    ),
    query<{ protein_name: string; organism: string; success_rate: number; total_trials: number }>(
      `SELECT * FROM mv_protein_success_ranking LIMIT 10`
    ),
    query<{ ph_bucket: number; avg_success_rate: number; trial_count: number }>(
      `SELECT * FROM mv_precipitant_ph_profile WHERE precipitant_type = 'PEG 3350' ORDER BY ph_bucket`
    ),
  ]);

  // ─── Scatter 샘플 + Recent proteins + 커버리지 ───
  const [heatmapData, recentProteins, precipCount, sourceIdCount] = await Promise.all([
    query<{ ph: number; temperature: number; outcome: string; precipitant_type: string; source_type: string }>(
      `SELECT ph, temperature, outcome, precipitant_type, source_type
       FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY outcome ORDER BY random()) AS rn
         FROM kbsi_crystallization
         WHERE ph IS NOT NULL AND temperature IS NOT NULL AND outcome IS NOT NULL
       ) sub
       WHERE rn <= 400`
    ),
    query<{ id: number; full_name: string; abbreviation: string; organism: string; updated_at: string; construct_count: number }>(
      `SELECT p.id, p.full_name, p.abbreviation, p.organism, p.updated_at,
         (SELECT COUNT(*) FROM kbsi_construct WHERE protein_id = p.id) AS construct_count
       FROM kbsi_protein p
       ORDER BY p.updated_at DESC
       LIMIT 5`
    ),
    scalar<number>("SELECT COUNT(*) FROM kbsi_crystallization WHERE precipitant_type IS NOT NULL"),
    scalar<number>("SELECT COUNT(*) FROM kbsi_crystallization WHERE source_id IS NOT NULL"),
  ]);

  const precipPct = crystCount > 0 ? (Number(precipCount) / crystCount * 100).toFixed(1) : '0';
  const sourceIdPct = crystCount > 0 ? (Number(sourceIdCount) / crystCount * 100).toFixed(1) : '0';

  const stats = [
    { label: 'Proteins', value: proteinCount, icon: Dna },
    { label: 'Constructs', value: constructCount, icon: FlaskConical },
    { label: 'Crystallizations', value: crystCount, icon: Gem },
    { label: 'Diffractions', value: Number(diffrCount), icon: Radiation },
    { label: 'Structures', value: structCount, icon: Pill },
    { label: 'Characterizations', value: Number(charCount), icon: Microscope },
    { label: 'Ligands', value: ligandCount, icon: Beaker },
    { label: 'Bindings', value: Number(bindingCount), icon: Link2 },
    { label: 'NMR', value: Number(nmrCount), icon: Radio },
    { label: 'Mutations', value: Number(mutationCount), icon: GitBranch },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-xl font-bold">{value.toLocaleString()}</div>
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
            {recentProteins.map((p) => (
              <Link key={p.id} href={`/proteins/${p.id}`}>
                <div className="rounded-lg border p-3 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="font-medium text-sm truncate">{p.abbreviation || p.full_name?.slice(0, 15)}</div>
                  <div className="text-xs text-muted-foreground italic truncate">{p.organism || '-'}</div>
                  <div className="text-xs text-muted-foreground mt-1">{p.construct_count ?? 0} constructs</div>
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
              purification: Number(purifCount),
              characterization: Number(charCount),
              crystallization: crystCount,
              diffraction: Number(diffrCount),
              structure: structCount,
              ligands: ligandCount,
              bindings: Number(bindingCount),
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground">Precipitant</div>
              <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-amber-500 rounded" style={{ width: `${precipPct}%` }} />
              </div>
              <div className="text-xs font-mono font-medium">{precipPct}%</div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground">Source ID</div>
              <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-emerald-500 rounded" style={{ width: `${sourceIdPct}%` }} />
              </div>
              <div className="text-xs font-mono font-medium">{sourceIdPct}%</div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground">Experimental</div>
              <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-blue-500 rounded" style={{ width: `${(experimentalCryst / crystCount * 100).toFixed(0)}%` }} />
              </div>
              <div className="text-xs font-mono font-medium">{(experimentalCryst / crystCount * 100).toFixed(1)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crystallization Statistics (IQR) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Crystallization Statistics (Median / IQR)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'pH', median: iqrPh?.median ?? 0, q1: iqrPh?.q1 ?? 0, q3: iqrPh?.q3 ?? 0, min: 0, max: 14, color: 'bg-blue-500' },
              { label: 'Temperature (°C)', median: iqrTemp?.median ?? 0, q1: iqrTemp?.q1 ?? 0, q3: iqrTemp?.q3 ?? 0, min: 0, max: 40, color: 'bg-orange-500' },
              { label: 'Precipitant Conc (%)', median: iqrConc?.median ?? 0, q1: iqrConc?.q1 ?? 0, q3: iqrConc?.q3 ?? 0, min: 0, max: 100, color: 'bg-emerald-500' },
            ].map(({ label, median, q1, q3, min, max, color }) => {
              const range = max - min;
              const leftPct = ((q1 - min) / range * 100).toFixed(1);
              const widthPct = (((q3 - q1) / range) * 100).toFixed(1);
              const medianPct = ((median - min) / range * 100).toFixed(1);
              return (
                <div key={label} className="p-4 rounded-lg border">
                  <div className="text-sm font-medium mb-1">{label}</div>
                  <div className="text-lg font-bold">
                    {median.toFixed(1)}
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      IQR: {q1.toFixed(1)} – {q3.toFixed(1)}
                    </span>
                  </div>
                  <div className="relative h-3 bg-muted rounded mt-2">
                    {/* IQR range bar */}
                    <div
                      className={`absolute h-full ${color} rounded opacity-30`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                    {/* Median marker */}
                    <div
                      className={`absolute top-0 h-full w-1 ${color} rounded`}
                      style={{ left: `${medianPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{min}</span>
                    <span>{max}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Proteins by Success Rate + Precipitant pH Profile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Top Proteins by Success Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-xs">#</th>
                    <th className="px-3 py-2 text-left font-medium text-xs">Protein</th>
                    <th className="px-3 py-2 text-left font-medium text-xs">Organism</th>
                    <th className="px-3 py-2 text-right font-medium text-xs">Trials</th>
                    <th className="px-3 py-2 text-right font-medium text-xs">Success</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topProteins.map((p, i) => {
                    const rate = Number(p.success_rate);
                    const badgeColor = rate >= 80
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : rate >= 50
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
                    return (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 text-xs font-medium truncate max-w-[160px]">{p.protein_name}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground italic truncate max-w-[120px]">{p.organism || '-'}</td>
                        <td className="px-3 py-1.5 text-xs text-right font-mono">{Number(p.total_trials).toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeColor}`}>
                            {rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              PEG 3350 — pH vs Success Rate
              <span className="text-xs font-normal text-muted-foreground ml-2">
                (precipitant pH profile)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {phProfile.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">No data available</div>
            ) : (
              <div className="space-y-2">
                {phProfile.map((row) => {
                  const rate = Number(row.avg_success_rate);
                  const barColor = rate >= 60
                    ? 'bg-green-500'
                    : rate >= 30
                      ? 'bg-yellow-500'
                      : 'bg-red-400';
                  return (
                    <div key={row.ph_bucket} className="flex items-center gap-3">
                      <div className="w-16 text-xs text-right font-mono text-muted-foreground">
                        pH {Number(row.ph_bucket).toFixed(1)}
                      </div>
                      <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
                        <div
                          className={`h-full ${barColor} rounded transition-all`}
                          style={{ width: `${Math.min(rate, 100)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold mix-blend-difference text-white">
                          {rate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-16 text-[10px] text-muted-foreground text-right">
                        {Number(row.trial_count).toLocaleString()} trials
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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

      {/* Data Source Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Data Source Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Data Type</th>
                  <th className="px-4 py-2 text-right font-medium">Count</th>
                  <th className="px-4 py-2 text-left font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { type: 'Proteins', count: stats[0].value, source: 'PDB, TargetTrack' },
                  { type: 'Constructs', count: stats[1].value, source: 'PDB, TargetTrack' },
                  { type: 'Expression', count: exprCount, source: 'PubMed (LLM extraction)' },
                  { type: 'Purification', count: Number(purifCount), source: 'PubMed (LLM extraction)' },
                  { type: 'Characterization', count: Number(charCount), source: 'PubMed (LLM extraction)' },
                  { type: 'Crystallization', count: crystCount, source: `Experimental ${experimentalCryst.toLocaleString()} + Synthetic ${syntheticTotal.toLocaleString()}` },
                  { type: 'Diffraction', count: Number(diffrCount), source: 'PDB API + PubMed' },
                  { type: 'Structures', count: structCount, source: 'PDB (X-ray + Cryo-EM + NMR)' },
                  { type: 'NMR Experiments', count: Number(nmrCount), source: 'PDB NMR metadata (spectrometer, spectra)' },
                  { type: 'Ligands', count: ligandCount, source: 'PDB HET + ChEMBL' },
                  { type: 'Bindings', count: Number(bindingCount), source: 'PDB co-crystal + ChEMBL IC50/Kd' },
                  { type: 'Mutations', count: Number(mutationCount), source: 'PDB pdbx_mutation (point mutations)' },
                ].map(row => (
                  <tr key={row.type} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium text-xs">{row.type}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{row.count.toLocaleString()}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
