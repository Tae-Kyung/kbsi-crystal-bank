import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ConstructTable } from '@/components/tables/construct-table';

export default async function ConstructsPage({
  searchParams,
}: {
  searchParams: Promise<{ protein_id?: string; page?: string; search?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const page = parseInt(params.page || '1');
  const limit = 50;
  const offset = (page - 1) * limit;
  const search = params.search || '';

  // Count query
  let countQuery = supabase
    .from('kbsi_construct')
    .select('id', { count: 'exact', head: true }) as any;

  // Data query
  let dataQuery = supabase
    .from('kbsi_construct')
    .select('*, kbsi_protein(full_name, abbreviation)') as any;

  if (params.protein_id) {
    countQuery = countQuery.eq('protein_id', parseInt(params.protein_id));
    dataQuery = dataQuery.eq('protein_id', parseInt(params.protein_id));
  }

  if (search) {
    countQuery = countQuery.or(`name.ilike.%${search}%,expression_system.ilike.%${search}%`);
    dataQuery = dataQuery.or(`name.ilike.%${search}%,expression_system.ilike.%${search}%`);
  }

  const [{ count }, { data: constructs }] = await Promise.all([
    countQuery,
    dataQuery.order('updated_at', { ascending: false }).range(offset, offset + limit - 1),
  ]);

  const totalPages = Math.ceil((count ?? 0) / limit);

  // Build filter params for pagination links
  const filterStr = [
    params.protein_id ? `protein_id=${params.protein_id}` : '',
    search ? `search=${encodeURIComponent(search)}` : '',
  ].filter(Boolean).join('&');
  const filterParam = filterStr ? `&${filterStr}` : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Constructs</h2>
          <p className="text-muted-foreground">
            {(count ?? 0).toLocaleString()}개의 Construct가 등록되어 있습니다.
          </p>
        </div>
        <Link href={params.protein_id ? `/constructs/new?protein_id=${params.protein_id}` : '/constructs/new'}>
          <Button><Plus className="h-4 w-4 mr-2" />New Construct</Button>
        </Link>
      </div>

      {/* Search */}
      <form className="flex gap-2" action="/constructs">
        <input
          name="search"
          defaultValue={search}
          placeholder="Construct 이름, 발현 시스템으로 검색..."
          className="flex-1 max-w-sm rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {params.protein_id && <input type="hidden" name="protein_id" value={params.protein_id} />}
        <Button type="submit" variant="outline" size="sm">검색</Button>
        {search && (
          <Link href={`/constructs${params.protein_id ? `?protein_id=${params.protein_id}` : ''}`}>
            <Button variant="ghost" size="sm">초기화</Button>
          </Link>
        )}
      </form>

      <ConstructTable data={(constructs ?? []) as any[]} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            총 {(count ?? 0).toLocaleString()}건 (페이지 {page} / {totalPages.toLocaleString()})
          </p>
          <div className="flex items-center gap-2">
            <Link href={`/constructs?page=1${filterParam}`}>
              <Button variant="outline" size="sm" disabled={page <= 1}>처음</Button>
            </Link>
            <Link href={`/constructs?page=${page - 1}${filterParam}`}>
              <Button variant="outline" size="sm" disabled={page <= 1}>이전</Button>
            </Link>
            <span className="text-sm px-2">{page} / {totalPages.toLocaleString()}</span>
            <Link href={`/constructs?page=${page + 1}${filterParam}`}>
              <Button variant="outline" size="sm" disabled={page >= totalPages}>다음</Button>
            </Link>
            <Link href={`/constructs?page=${totalPages}${filterParam}`}>
              <Button variant="outline" size="sm" disabled={page >= totalPages}>마지막</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
