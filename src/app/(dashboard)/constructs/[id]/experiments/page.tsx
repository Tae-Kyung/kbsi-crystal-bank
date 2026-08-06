import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpressionTab } from '@/components/experiments/expression-tab';
import { CrystallizationTab } from '@/components/experiments/crystallization-tab';
import { PurificationTab } from '@/components/experiments/purification-tab';
import { StructureTab } from '@/components/experiments/structure-tab';
import { CharacterizationTab } from '@/components/experiments/characterization-tab';

export default async function ExperimentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const constructId = parseInt(id);
  const supabase = await createClient();

  // Verify construct exists
  const { data: constructData, error } = await supabase
    .from('kbsi_construct')
    .select('id, name, kbsi_protein(abbreviation, full_name)')
    .eq('id', constructId)
    .single();

  if (error || !constructData) return notFound();

  const construct = constructData as any;

  // Fetch all experiment data in parallel
  const [expressions, purifications, crystallizations, characterizations, structures] = await Promise.all([
    supabase.from('kbsi_expression').select('*').eq('construct_id', constructId).order('attempt_number'),
    supabase.from('kbsi_purification').select('*').eq('construct_id', constructId).order('attempt_number'),
    supabase.from('kbsi_crystallization').select('*').eq('construct_id', constructId).order('attempt_number'),
    supabase.from('kbsi_characterization').select('*').eq('construct_id', constructId).order('method'),
    supabase.from('kbsi_structure').select('*').eq('construct_id', constructId).order('created_at'),
  ]);

  const protein = (construct as any).kbsi_protein;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">
          Experiments: {construct.name || `#${construct.id}`}
        </h2>
        <p className="text-muted-foreground">
          {protein?.abbreviation || protein?.full_name}
        </p>
      </div>

      <Tabs defaultValue="expression">
        <TabsList className="flex-wrap">
          <TabsTrigger value="expression">
            Expression ({expressions.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="purification">
            Purification ({purifications.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="crystallization">
            Crystallization ({crystallizations.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="characterization">
            Characterization ({characterizations.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="structure">
            Structure ({structures.data?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expression">
          <ExpressionTab data={expressions.data ?? []} constructId={constructId} />
        </TabsContent>
        <TabsContent value="purification">
          <PurificationTab data={purifications.data ?? []} constructId={constructId} />
        </TabsContent>
        <TabsContent value="crystallization">
          <CrystallizationTab data={crystallizations.data ?? []} constructId={constructId} />
        </TabsContent>
        <TabsContent value="characterization">
          <CharacterizationTab data={characterizations.data ?? []} constructId={constructId} />
        </TabsContent>
        <TabsContent value="structure">
          <StructureTab data={structures.data ?? []} constructId={constructId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
