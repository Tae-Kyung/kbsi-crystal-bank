'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DataTable } from './data-table';
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

export function ConstructTable({ data }: { data: ConstructRow[] }) {
  return <DataTable columns={columns} data={data} searchKey="name" searchPlaceholder="Construct 이름 검색..." />;
}
