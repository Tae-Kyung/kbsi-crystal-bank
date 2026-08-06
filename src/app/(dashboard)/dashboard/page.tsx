import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dna, FlaskConical, Gem, TestTubes, Pill, ClipboardCheck } from 'lucide-react';
import { CrystallizationHeatmap } from '@/components/charts/crystallization-heatmap';
import { OutcomeDistribution } from '@/components/charts/outcome-distribution';
import { PipelineFunnel } from '@/components/charts/pipeline-funnel';

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

  // Fetch crystallization data for charts
  const { data: crystData } = await supabase
    .from('kbsi_crystallization')
    .select('ph, temperature, outcome, precipitant_type');

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

      <Card>
        <CardHeader><CardTitle className="text-base">Crystallization Conditions (pH vs Temperature)</CardTitle></CardHeader>
        <CardContent>
          <CrystallizationHeatmap data={crystData ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
