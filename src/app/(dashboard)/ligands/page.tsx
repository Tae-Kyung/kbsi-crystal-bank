import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/tables/data-table';
import { type ColumnDef } from '@tanstack/react-table';
import { LigandFormDialog } from '@/components/forms/ligand-form-dialog';

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

export default async function LigandsPage() {
  const supabase = await createClient();
  const { data: ligands } = await supabase.from('kbsi_ligand').select('*').order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Ligands</h2>
        <LigandFormDialog />
      </div>
      <DataTable columns={columns} data={(ligands ?? []) as LigandRow[]} searchKey="name" searchPlaceholder="리간드 이름 검색..." />
    </div>
  );
}
