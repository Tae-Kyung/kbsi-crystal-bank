import { notFound } from 'next/navigation';
import { query, queryOne } from '@/lib/db';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpressionTab } from '@/components/experiments/expression-tab';
import { CrystallizationTab } from '@/components/experiments/crystallization-tab';
import { PurificationTab } from '@/components/experiments/purification-tab';
import { StructureTab } from '@/components/experiments/structure-tab';
import { CharacterizationTab } from '@/components/experiments/characterization-tab';
import { NmrTab } from '@/components/experiments/nmr-tab';

export default async function ExperimentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const constructId = parseInt(id);

  // Verify construct exists
  const constructData = await queryOne<any>(
    `SELECT c.id, c.name, p.abbreviation AS protein_abbreviation, p.full_name AS protein_full_name
     FROM kbsi_construct c
     LEFT JOIN kbsi_protein p ON p.id = c.protein_id
     WHERE c.id = $1`,
    [constructId]
  );

  if (!constructData) return notFound();

  const construct = constructData;

  // Fetch all experiment data in parallel
  const [expressions, purifications, crystallizations, characterizations, structures, nmrExperiments] = await Promise.all([
    query<any>('SELECT * FROM kbsi_expression WHERE construct_id = $1 ORDER BY attempt_number', [constructId]),
    query<any>('SELECT * FROM kbsi_purification WHERE construct_id = $1 ORDER BY attempt_number', [constructId]),
    query<any>('SELECT * FROM kbsi_crystallization WHERE construct_id = $1 ORDER BY attempt_number', [constructId]),
    query<any>('SELECT * FROM kbsi_characterization WHERE construct_id = $1 ORDER BY method', [constructId]),
    query<any>('SELECT * FROM kbsi_structure WHERE construct_id = $1 ORDER BY created_at', [constructId]),
    query<any>(
      `SELECT n.*, json_agg(json_build_object('id', s.id, 'spectrum_type', s.spectrum_type)) FILTER (WHERE s.id IS NOT NULL) AS spectra
       FROM kbsi_nmr_experiment n
       LEFT JOIN kbsi_nmr_spectrum s ON s.nmr_experiment_id = n.id
       WHERE n.construct_id = $1
       GROUP BY n.id
       ORDER BY n.created_at`,
      [constructId]
    ),
  ]);

  // Reshape NMR data to match old structure (kbsi_nmr_spectrum nested)
  const nmrList = nmrExperiments.map((n: any) => ({
    ...n,
    kbsi_nmr_spectrum: n.spectra || [],
  }));

  // Chemical shift summaries for NMR experiments
  const bmrbIds = nmrList.map((n: any) => n.bmrb_id).filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let csSummaries: Record<string, any> = {};
  if (bmrbIds.length > 0) {
    const placeholders = bmrbIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    const csData = await query<any>(
      `SELECT * FROM kbsi_nmr_cs_summary WHERE bmrb_id IN (${placeholders})`,
      bmrbIds
    );
    for (const cs of csData) {
      csSummaries[cs.bmrb_id] = cs;
    }
  }

  const protein = { abbreviation: construct.protein_abbreviation, full_name: construct.protein_full_name };

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
            Expression ({expressions.length})
          </TabsTrigger>
          <TabsTrigger value="purification">
            Purification ({purifications.length})
          </TabsTrigger>
          <TabsTrigger value="crystallization">
            Crystallization ({crystallizations.length})
          </TabsTrigger>
          <TabsTrigger value="characterization">
            Characterization ({characterizations.length})
          </TabsTrigger>
          <TabsTrigger value="structure">
            Structure ({structures.length})
          </TabsTrigger>
          <TabsTrigger value="nmr">
            NMR ({nmrList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expression">
          <ExpressionTab data={expressions} constructId={constructId} />
        </TabsContent>
        <TabsContent value="purification">
          <PurificationTab data={purifications} constructId={constructId} />
        </TabsContent>
        <TabsContent value="crystallization">
          <CrystallizationTab data={crystallizations} constructId={constructId} />
        </TabsContent>
        <TabsContent value="characterization">
          <CharacterizationTab data={characterizations} constructId={constructId} />
        </TabsContent>
        <TabsContent value="structure">
          <StructureTab data={structures} constructId={constructId} />
        </TabsContent>
        <TabsContent value="nmr">
          <NmrTab data={nmrList} csSummaries={csSummaries} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
