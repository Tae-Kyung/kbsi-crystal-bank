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
  const limit = 50;
  const offset = (page - 1) * limit;

  // count와 데이터를 분리 조회 (대용량 테이블에서 JOIN+count 동시 시 타임아웃 방지)
  let countQuery = supabase
    .from('kbsi_protein')
    .select('id', { count: 'exact', head: true });

  let dataQuery = supabase
    .from('kbsi_protein')
    .select('*, kbsi_construct(count)');

  if (params.search) {
    const filter = `full_name.ilike.%${params.search}%,abbreviation.ilike.%${params.search}%,gene_name.ilike.%${params.search}%`;
    countQuery = countQuery.or(filter);
    dataQuery = dataQuery.or(filter);
  }

  const [{ count }, { data: proteins }] = await Promise.all([
    countQuery,
    dataQuery.order('updated_at', { ascending: false }).range(offset, offset + limit - 1),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Proteins</h2>
          <p className="text-muted-foreground">
            {(count ?? 0).toLocaleString()}개의 단백질이 등록되어 있습니다. (PDB, TargetTrack, KBSI)
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
