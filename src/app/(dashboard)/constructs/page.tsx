import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { DataTable } from '@/components/tables/data-table';
import { type ColumnDef } from '@tanstack/react-table';

interface ConstructRow {
  id: number;
  name: string | null;
  residues: string | null;
  construct_type: string | null;
  expression_system: string | null;
  vector: string | null;
  tag_name: string | null;
  updated_at: string;
  kbsi_protein: { full_name: string; abbreviation: string | null } | null;
}

const columns: ColumnDef<ConstructRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link href={`/constructs/${row.original.id}`} className="font-medium text-primary hover:underline">
        {row.original.name || `#${row.original.id}`}
      </Link>
    ),
  },
  {
    id: 'protein',
    header: 'Protein',
    cell: ({ row }) => row.original.kbsi_protein?.abbreviation || row.original.kbsi_protein?.full_name || '-',
  },
  { accessorKey: 'residues', header: 'Residues' },
  {
    accessorKey: 'construct_type',
    header: 'Type',
    cell: ({ row }) => row.original.construct_type ? <Badge variant="secondary">{row.original.construct_type}</Badge> : '-',
  },
  { accessorKey: 'expression_system', header: 'Expression System' },
  { accessorKey: 'vector', header: 'Vector' },
  {
    accessorKey: 'updated_at',
    header: 'Updated',
    cell: ({ row }) => new Date(row.original.updated_at).toLocaleDateString('ko-KR'),
  },
];

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
      <DataTable columns={columns} data={(constructs ?? []) as ConstructRow[]} searchKey="name" searchPlaceholder="Construct 이름 검색..." />
    </div>
  );
}
