import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil } from 'lucide-react';

export default async function ProteinDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('kbsi_protein')
    .select('*, kbsi_database_id(*), kbsi_construct(*)')
    .eq('id', parseInt(id))
    .single();

  if (error || !data) return notFound();

  const protein = data as any;
  const dbIds = protein.kbsi_database_id ?? [];
  const constructs = protein.kbsi_construct ?? [];

  // Crystallization overview query
  const constructIds = constructs.map((c: any) => c.id);
  let crystSummary = { total: 0, success: 0, failure: 0 };
  if (constructIds.length > 0) {
    const [{ count: totalCryst }, { count: successCryst }] = await Promise.all([
      supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).in('construct_id', constructIds),
      supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).in('construct_id', constructIds).or('outcome.eq.diffraction_quality,outcome.eq.single_crystal'),
    ]);
    crystSummary = { total: totalCryst ?? 0, success: successCryst ?? 0, failure: (totalCryst ?? 0) - (successCryst ?? 0) };
  }
  const successRate = crystSummary.total > 0 ? Math.round((crystSummary.success / crystSummary.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {protein.abbreviation || protein.full_name}
          </h2>
          <p className="text-muted-foreground">{protein.full_name}</p>
        </div>
        <Link href={`/proteins/${id}/edit`}>
          <Button variant="outline">
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Gene" value={protein.gene_name} />
            <Row label="Organism" value={protein.organism} italic />
            <Row label="Owner" value={protein.owner} />
            <Row label="Custom ID" value={protein.custom_id} />
            <Row label="Updated" value={new Date(protein.updated_at).toLocaleString('ko-KR')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">External Database IDs</CardTitle>
          </CardHeader>
          <CardContent>
            {dbIds.length > 0 ? (
              <div className="space-y-2">
                {dbIds.map((d: any) => {
                  const url = getExternalDbUrl(d.db_name, d.db_value);
                  return (
                    <div key={d.id} className="flex items-center gap-2">
                      <Badge variant="outline">{d.db_name}</Badge>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-primary hover:underline">
                          {d.db_value}
                          <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      ) : (
                        <span className="text-sm font-mono">{d.db_value}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No external IDs registered.</p>
            )}

            {/* 추가 외부 링크 */}
            <div className="mt-4 pt-3 border-t space-y-2">
              <p className="text-xs font-medium text-muted-foreground">External Resources</p>
              <div className="flex flex-wrap gap-2">
                {protein.gene_name && (
                  <a href={`https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(protein.gene_name + ' AND ' + (protein.organism || 'human') + '[Organism]')}`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950">NCBI Gene</Badge>
                  </a>
                )}
                {protein.gene_name && (
                  <a href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(protein.gene_name)}+AND+crystallization`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-green-50 dark:hover:bg-green-950">PubMed</Badge>
                  </a>
                )}
                {getUniProtId(dbIds) && (
                  <a href={`https://alphafold.ebi.ac.uk/entry/${getUniProtId(dbIds)}`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-950">AlphaFold</Badge>
                  </a>
                )}
                {getUniProtId(dbIds) && (
                  <a href={`https://www.ebi.ac.uk/interpro/protein/UniProt/${getUniProtId(dbIds)}/`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950">InterPro</Badge>
                  </a>
                )}
                {protein.gene_name && (
                  <a href={`https://string-db.org/cgi/network?identifier=${encodeURIComponent(protein.gene_name)}&species=9606`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-red-50 dark:hover:bg-red-950">STRING</Badge>
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Crystallization Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crystallization Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-lg font-semibold">
            {crystSummary.total} trials across {constructs.length} constructs
            {crystSummary.total > 0 && (
              <span className="text-muted-foreground font-normal">
                {' '}&mdash; {crystSummary.success} successful ({successRate}%)
              </span>
            )}
          </p>

          {crystSummary.total > 0 && (
            <div className="w-full h-4 rounded-full overflow-hidden bg-red-200 dark:bg-red-900 flex">
              <div
                className="h-full bg-green-500 dark:bg-green-600 transition-all"
                style={{ width: `${successRate}%` }}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Link href="/experiments/crystallization">
              <Button variant="outline" size="sm">View All Conditions</Button>
            </Link>
            <Link href="/benchmark">
              <Button variant="outline" size="sm">Predict New Condition</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Constructs ({constructs.length})
          </CardTitle>
          <Link href={`/constructs/new?protein_id=${id}`}>
            <Button size="sm">Add Construct</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {constructs.length > 0 ? (
            <div className="divide-y">
              {constructs.map((c: any) => (
                <Link
                  key={c.id}
                  href={`/constructs/${c.id}`}
                  className="flex items-center justify-between py-3 hover:bg-accent/50 px-2 rounded-md transition-colors"
                >
                  <div>
                    <span className="font-medium">{c.name || `Construct #${c.id}`}</span>
                    {c.residues && (
                      <span className="text-sm text-muted-foreground ml-2">({c.residues})</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {c.construct_type && (
                      <Badge variant="secondary">{c.construct_type}</Badge>
                    )}
                    {c.expression_system && (
                      <Badge variant="outline">{c.expression_system}</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No constructs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getExternalDbUrl(dbName: string, dbValue: string): string | null {
  switch (dbName) {
    case 'UniProt': return `https://www.uniprot.org/uniprot/${dbValue}`;
    case 'AlphaFold': return `https://alphafold.ebi.ac.uk/entry/${dbValue}`;
    case 'NCBI Gene': return `https://www.ncbi.nlm.nih.gov/gene/${dbValue}`;
    case 'PDB': return `https://www.rcsb.org/structure/${dbValue}`;
    default: return null;
  }
}

function getUniProtId(dbIds: any[]): string | null {
  const up = dbIds.find((d: any) => d.db_name === 'UniProt');
  return up?.db_value || null;
}

function Row({ label, value, italic }: { label: string; value?: string | null; italic?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={italic ? 'italic' : ''}>{value || '-'}</span>
    </div>
  );
}
