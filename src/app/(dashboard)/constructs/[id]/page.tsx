import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, FlaskConical } from 'lucide-react';

export default async function ConstructDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('kbsi_construct')
    .select('*, kbsi_protein(id, full_name, abbreviation), kbsi_mutation(*)')
    .eq('id', parseInt(id))
    .single();

  if (error || !data) return notFound();

  const construct = data as any;
  const protein = construct.kbsi_protein;
  const mutations = construct.kbsi_mutation ?? [];

  // Fetch experiment counts
  const [expr, puri, cryst, char, struct] = await Promise.all([
    supabase.from('kbsi_expression').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_purification').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_characterization').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_structure').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
  ]);

  const stats = [
    { label: 'Expression', count: expr.count ?? 0 },
    { label: 'Purification', count: puri.count ?? 0 },
    { label: 'Crystallization', count: cryst.count ?? 0 },
    { label: 'Characterization', count: char.count ?? 0 },
    { label: 'Structure', count: struct.count ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{construct.name || `Construct #${construct.id}`}</h2>
            {construct.construct_type && <Badge>{construct.construct_type}</Badge>}
          </div>
          {protein && (
            <Link href={`/proteins/${protein.id}`} className="text-muted-foreground hover:underline">
              {protein.abbreviation || protein.full_name}
            </Link>
          )}
        </div>
        <Link href={`/constructs/${id}/experiments`}>
          <Button>
            <FlaskConical className="h-4 w-4 mr-2" />
            Experiments
          </Button>
        </Link>
      </div>

      {/* Experiment Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{s.count}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Construct Info</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Residues" value={construct.residues} />
            <Row label="Expression System" value={construct.expression_system} />
            <Row label="Vector" value={construct.vector} />
            <Row label="Tag" value={construct.tag_name ? `${construct.tag_name} (${construct.tag_position})` : null} />
            <Row label="Cleavage Site" value={construct.cleavage_site} />
            <Row label="MW (theoretical)" value={construct.theoretical_mw ? `${construct.theoretical_mw} Da` : null} />
            <Row label="pI (theoretical)" value={construct.theoretical_pi?.toString()} />
            <Row label="Codon Optimized" value={construct.codon_optimized === null ? null : construct.codon_optimized ? 'Yes' : 'No'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Mutations ({mutations.length})</CardTitle></CardHeader>
          <CardContent>
            {mutations.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {mutations.map((m: any) => (
                  <Badge key={m.id} variant="outline" className="font-mono">{m.mutation}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No mutations (wild-type)</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sequences */}
      {(construct.seq_expression || construct.seq_final || construct.dna_sequence) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Sequences</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="expression">
              <TabsList>
                {construct.seq_expression && <TabsTrigger value="expression">Expression</TabsTrigger>}
                {construct.seq_final && <TabsTrigger value="final">Final</TabsTrigger>}
                {construct.dna_sequence && <TabsTrigger value="dna">DNA</TabsTrigger>}
              </TabsList>
              {construct.seq_expression && (
                <TabsContent value="expression">
                  <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                    {construct.seq_expression}
                  </pre>
                </TabsContent>
              )}
              {construct.seq_final && (
                <TabsContent value="final">
                  <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                    {construct.seq_final}
                  </pre>
                </TabsContent>
              )}
              {construct.dna_sequence && (
                <TabsContent value="dna">
                  <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                    {construct.dna_sequence}
                  </pre>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value || '-'}</span>
    </div>
  );
}
