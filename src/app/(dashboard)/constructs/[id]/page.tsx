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

  // Fetch experiment counts + ligand bindings
  const [expr, puri, cryst, char, diffr, struct, { data: ligandBindings }] = await Promise.all([
    supabase.from('kbsi_expression').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_purification').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_characterization').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_diffraction').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_structure').select('id', { count: 'exact', head: true }).eq('construct_id', parseInt(id)),
    supabase.from('kbsi_construct_ligand').select('id, binding_kd, binding_ic50, source_db, kbsi_ligand(id, name, mw, source_db, source_id)').eq('construct_id', parseInt(id)).limit(50),
  ]);

  const stats = [
    { label: 'Expression', slug: 'expression', count: expr.count ?? 0, color: 'text-green-600' },
    { label: 'Purification', slug: 'purification', count: puri.count ?? 0, color: 'text-blue-600' },
    { label: 'Characterization', slug: 'characterization', count: char.count ?? 0, color: 'text-orange-600' },
    { label: 'Crystallization', slug: 'crystallization', count: cryst.count ?? 0, color: 'text-purple-600' },
    { label: 'Diffraction', slug: 'diffraction', count: diffr.count ?? 0, color: 'text-red-600' },
    { label: 'Structure', slug: 'structure', count: struct.count ?? 0, color: 'text-cyan-600' },
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

      {/* Pipeline Status */}
      <Card>
        <CardHeader><CardTitle className="text-base">Experiment Pipeline</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            {stats.map((s, i) => (
              <div key={s.label} className="flex items-center">
                <Link href={s.count > 0 ? `/experiments/${s.slug}?construct_id=${id}` : '#'} className={s.count > 0 ? 'cursor-pointer' : 'cursor-default'}>
                  <div className={`flex flex-col items-center rounded-lg border p-3 transition-shadow ${s.count > 0 ? 'hover:shadow-md hover:border-blue-300' : 'opacity-40'}`}>
                    <div className={`h-4 w-4 rounded-full mb-1 ${s.count > 0 ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <div className={`text-xl font-bold ${s.count > 0 ? s.color : 'text-gray-400'}`}>{s.count.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                </Link>
                {i < stats.length - 1 && (
                  <div className={`mx-1 text-lg ${stats[i + 1].count > 0 ? 'text-green-400' : 'text-gray-300'}`}>→</div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            초록 ● = 데이터 있음 (클릭하면 상세 목록). 회색 ● = 미시도.
          </p>
        </CardContent>
      </Card>

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

      {/* Ligand Bindings */}
      {(ligandBindings ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ligand Bindings ({(ligandBindings ?? []).length})</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Ligand</th>
                    <th className="px-3 py-2 text-left font-medium">MW</th>
                    <th className="px-3 py-2 text-left font-medium">Kd</th>
                    <th className="px-3 py-2 text-left font-medium">IC50</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(ligandBindings ?? []).map((b: any) => {
                    const lig = b.kbsi_ligand;
                    const lUrl = lig?.source_db === 'ChEMBL' && lig?.source_id ? `https://www.ebi.ac.uk/chembl/compound_report_card/${lig.source_id}/` : lig?.source_db === 'PDB' && lig?.source_id ? `https://www.rcsb.org/ligand/${lig.source_id}` : null;
                    return (
                      <tr key={b.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-xs">
                          {lUrl ? <a href={lUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{lig?.name}</a> : (lig?.name || '-')}
                        </td>
                        <td className="px-3 py-2 text-xs">{lig?.mw ? `${lig.mw.toFixed(0)} Da` : '-'}</td>
                        <td className="px-3 py-2 text-xs font-mono">{b.binding_kd ? `${b.binding_kd.toLocaleString()} nM` : '-'}</td>
                        <td className="px-3 py-2 text-xs font-mono">{b.binding_ic50 ? `${b.binding_ic50.toLocaleString()} nM` : '-'}</td>
                        <td className="px-3 py-2 text-xs">{b.source_db && <Badge variant="outline" className="text-[10px]">{b.source_db}</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
