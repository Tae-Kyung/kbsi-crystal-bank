'use client';

import { Badge } from '@/components/ui/badge';
import { DataTable } from './data-table';
import { type ColumnDef } from '@tanstack/react-table';

interface LigandRow {
  id: number;
  name: string;
  smiles: string | null;
  mw: number | null;
  source: string | null;
  created_at: string;
}

const columns: ColumnDef<LigandRow>[] = [
  { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
  { accessorKey: 'smiles', header: 'SMILES', cell: ({ row }) => <span className="font-mono text-xs max-w-[300px] truncate block">{row.original.smiles || '-'}</span> },
  { accessorKey: 'mw', header: 'MW (Da)', cell: ({ row }) => row.original.mw?.toFixed(1) ?? '-' },
  { accessorKey: 'source', header: 'Source', cell: ({ row }) => row.original.source ? <Badge variant="outline">{row.original.source}</Badge> : '-' },
  { accessorKey: 'created_at', header: 'Added', cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString('ko-KR') },
];

export function LigandTable({ data }: { data: LigandRow[] }) {
  return <DataTable columns={columns} data={data} searchKey="name" searchPlaceholder="리간드 이름 검색..." />;
}
