import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ProteinSearchForm } from '@/components/forms/protein-search-form';

export const dynamic = 'force-dynamic';

export default async function ProteinsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; organism?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || '1');
  const limit = 50;
  const offset = (page - 1) * limit;
  const search = params.search || '';
  const organism = params.organism || '';

  let countQuery = supabase
    .from('kbsi_protein')
    .select('id', { count: 'exact', head: true }) as any;

  let dataQuery = supabase
    .from('kbsi_protein')
    .select('id, full_name, abbreviation, gene_name, organism, updated_at') as any;

  if (search) {
    const filter = `full_name.ilike.%${search}%,abbreviation.ilike.%${search}%,gene_name.ilike.%${search}%`;
    countQuery = countQuery.or(filter);
    dataQuery = dataQuery.or(filter);
  }

  if (organism) {
    countQuery = countQuery.ilike('organism', `%${organism}%`);
    dataQuery = dataQuery.ilike('organism', `%${organism}%`);
  }

  const [{ count }, { data: proteins }] = await Promise.all([
    countQuery,
    dataQuery.order('updated_at', { ascending: false }).range(offset, offset + limit - 1),
  ]);

  const totalPages = Math.ceil((count ?? 0) / limit);
  const filterStr = [
    search ? `search=${encodeURIComponent(search)}` : '',
    organism ? `organism=${encodeURIComponent(organism)}` : '',
  ].filter(Boolean).join('&');
  const filterParam = filterStr ? `&${filterStr}` : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Proteins</h2>
          <p className="text-muted-foreground">
            {(count ?? 0).toLocaleString()}개의 단백질
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/export/proteins?${filterStr}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">CSV Export</Button>
          </a>
          <Link href="/proteins/new">
            <Button><Plus className="h-4 w-4 mr-2" />New Protein</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <ProteinSearchForm defaultSearch={search} defaultOrganism={organism} />

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Gene</th>
              <th className="px-3 py-2 text-left font-medium">Organism</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(proteins || []).map((p: any) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/proteins/${p.id}`} className="text-primary hover:underline text-xs font-medium">
                    {p.abbreviation || p.full_name?.slice(0, 40) || `#${p.id}`}
                  </Link>
                  {p.abbreviation && p.full_name && (
                    <span className="text-[10px] text-muted-foreground ml-1" title={p.full_name}>
                      ({p.full_name.slice(0, 25)}{p.full_name.length > 25 ? '...' : ''})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs font-mono">{p.gene_name || '-'}</td>
                <td className="px-3 py-2 text-xs italic">{p.organism?.slice(0, 25) || '-'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(p.updated_at).toLocaleDateString('ko-KR')}</td>
              </tr>
            ))}
            {(!proteins || proteins.length === 0) && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            총 {(count ?? 0).toLocaleString()}건 (페이지 {page} / {totalPages.toLocaleString()})
          </p>
          <div className="flex items-center gap-2">
            <Link href={`/proteins?page=1${filterParam}`}><Button variant="outline" size="sm" disabled={page <= 1}>처음</Button></Link>
            <Link href={`/proteins?page=${page - 1}${filterParam}`}><Button variant="outline" size="sm" disabled={page <= 1}>이전</Button></Link>
            <span className="text-sm px-2">{page} / {totalPages.toLocaleString()}</span>
            <Link href={`/proteins?page=${page + 1}${filterParam}`}><Button variant="outline" size="sm" disabled={page >= totalPages}>다음</Button></Link>
            <Link href={`/proteins?page=${totalPages}${filterParam}`}><Button variant="outline" size="sm" disabled={page >= totalPages}>마지막</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
