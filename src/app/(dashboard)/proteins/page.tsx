import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { ProteinTable } from '@/components/tables/protein-table';

export default async function ProteinsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const page = parseInt(params.page || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('kbsi_protein')
    .select('*, kbsi_construct(count)', { count: 'exact' });

  if (params.search) {
    query = query.or(
      `full_name.ilike.%${params.search}%,abbreviation.ilike.%${params.search}%,gene_name.ilike.%${params.search}%`
    );
  }

  const { data: proteins, count } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Proteins</h2>
          <p className="text-muted-foreground">
            {count ?? 0}개의 단백질이 등록되어 있습니다.
          </p>
        </div>
        <Link href="/proteins/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Protein
          </Button>
        </Link>
      </div>

      <ProteinTable
        proteins={proteins ?? []}
        total={count ?? 0}
        page={page}
        limit={limit}
        search={params.search}
      />
    </div>
  );
}
