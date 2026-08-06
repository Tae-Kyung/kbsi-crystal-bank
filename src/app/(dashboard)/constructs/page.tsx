import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ConstructTable } from '@/components/tables/construct-table';

export default async function ConstructsPage({
  searchParams,
}: {
  searchParams: Promise<{ protein_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('kbsi_construct')
    .select('*, kbsi_protein(full_name, abbreviation)');

  if (params.protein_id) {
    query = query.eq('protein_id', parseInt(params.protein_id));
  }

  const { data: constructs } = await query.order('updated_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Constructs</h2>
        <Link href={params.protein_id ? `/constructs/new?protein_id=${params.protein_id}` : '/constructs/new'}>
          <Button><Plus className="h-4 w-4 mr-2" />New Construct</Button>
        </Link>
      </div>
      <ConstructTable data={(constructs ?? []) as any[]} />
    </div>
  );
}
