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
                {dbIds.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <Badge variant="outline">{d.db_name}</Badge>
                    <span className="text-sm font-mono">{d.db_value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No external IDs registered.</p>
            )}
          </CardContent>
        </Card>
      </div>

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

function Row({ label, value, italic }: { label: string; value?: string | null; italic?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={italic ? 'italic' : ''}>{value || '-'}</span>
    </div>
  );
}
