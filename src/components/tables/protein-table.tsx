'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

interface ProteinRow {
  id: number;
  full_name: string;
  abbreviation: string | null;
  gene_name: string | null;
  organism: string | null;
  owner: string | null;
  updated_at: string;
  kbsi_construct: { count: number }[];
}

const columns: ColumnDef<ProteinRow>[] = [
  {
    accessorKey: 'abbreviation',
    header: 'Abbreviation',
    cell: ({ row }) => (
      <Link
        href={`/proteins/${row.original.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.original.abbreviation || row.original.full_name.slice(0, 20)}
      </Link>
    ),
  },
  {
    accessorKey: 'full_name',
    header: 'Full Name',
    cell: ({ row }) => (
      <span className="max-w-[300px] truncate block">{row.original.full_name}</span>
    ),
  },
  {
    accessorKey: 'gene_name',
    header: 'Gene',
  },
  {
    accessorKey: 'organism',
    header: 'Organism',
    cell: ({ row }) => (
      <span className="italic text-sm">{row.original.organism}</span>
    ),
  },
  {
    id: 'constructs',
    header: 'Constructs',
    cell: ({ row }) => {
      const count = row.original.kbsi_construct?.[0]?.count ?? 0;
      return <Badge variant="secondary">{count}</Badge>;
    },
  },
  {
    accessorKey: 'updated_at',
    header: 'Updated',
    cell: ({ row }) => new Date(row.original.updated_at).toLocaleDateString('ko-KR'),
  },
];

interface ProteinTableProps {
  proteins: ProteinRow[];
  total: number;
  page: number;
  limit: number;
  search?: string;
}

export function ProteinTable({ proteins, total, page, limit, search }: ProteinTableProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(search || '');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchValue) params.set('search', searchValue);
    router.push(`/proteins?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="단백질명, 유전자명으로 검색..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="max-w-sm"
        />
      </form>
      <DataTable columns={columns} data={proteins} pageSize={limit} />
    </div>
  );
}
