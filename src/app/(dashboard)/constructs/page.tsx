import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ConstructsPage({
  searchParams,
}: {
  searchParams: Promise<{ protein_id?: string; page?: string; search?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || '1');
  const limit = 50;
  const offset = (page - 1) * limit;
  const search = params.search || '';

  let countQuery = supabase
    .from('kbsi_construct')
    .select('id', { count: 'exact', head: true }) as any;

  let dataQuery = supabase
    .from('kbsi_construct')
    .select('id, name, construct_type, expression_system, tag_name, residues, theoretical_mw, protein_id, updated_at, kbsi_protein(full_name, abbreviation)') as any;

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
            {(count ?? 0).toLocaleString()}개의 Construct
          </p>
        </div>
        <Link href={params.protein_id ? `/constructs/new?protein_id=${params.protein_id}` : '/constructs/new'}>
          <Button><Plus className="h-4 w-4 mr-2" />New Construct</Button>
        </Link>
      </div>

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

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Protein</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Expression System</th>
              <th className="px-3 py-2 text-left font-medium">MW (kDa)</th>
              <th className="px-3 py-2 text-left font-medium">Tag</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(constructs || []).map((c: any) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/constructs/${c.id}`} className="text-primary hover:underline text-xs font-medium">
                    {c.name || `#${c.id}`}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.kbsi_protein ? (
                    <Link href={`/proteins/${c.protein_id}`} className="text-primary hover:underline">
                      {c.kbsi_protein.abbreviation || c.kbsi_protein.full_name?.slice(0, 20)}
                    </Link>
                  ) : '-'}
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.construct_type ? <Badge variant="outline" className="text-[10px]">{c.construct_type}</Badge> : '-'}
                </td>
                <td className="px-3 py-2 text-xs truncate max-w-[150px]">{c.expression_system || '-'}</td>
                <td className="px-3 py-2 text-xs">{c.theoretical_mw ? (c.theoretical_mw / 1000).toFixed(1) : '-'}</td>
                <td className="px-3 py-2 text-xs">{c.tag_name || '-'}</td>
              </tr>
            ))}
            {(!constructs || constructs.length === 0) && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
