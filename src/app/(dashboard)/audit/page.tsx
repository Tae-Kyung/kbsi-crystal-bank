import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/tables/data-table';
import { type ColumnDef } from '@tanstack/react-table';

interface AuditRow {
  id: number;
  table_name: string;
  record_id: number;
  action: string;
  changed_by: string | null;
  changed_at: string;
  old_data: any;
  new_data: any;
}

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
};

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: 'changed_at',
    header: 'Time',
    cell: ({ row }) => new Date(row.original.changed_at).toLocaleString('ko-KR'),
  },
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[row.original.action] ?? ''}`}>
        {row.original.action}
      </span>
    ),
  },
  {
    accessorKey: 'table_name',
    header: 'Table',
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.table_name.replace('kbsi_', '')}</Badge>
    ),
  },
  {
    accessorKey: 'record_id',
    header: 'Record ID',
  },
  {
    accessorKey: 'changed_by',
    header: 'Changed By',
    cell: ({ row }) => row.original.changed_by?.slice(0, 8) ?? '-',
  },
];

export default async function AuditPage() {
  const supabase = await createClient();

  const { data: logs, count } = await supabase
    .from('kbsi_audit_log')
    .select('*', { count: 'exact' })
    .order('changed_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Audit Log</h2>
        <p className="text-muted-foreground">{count ?? 0}건의 변경 이력</p>
      </div>

      <DataTable
        columns={columns}
        data={(logs ?? []) as AuditRow[]}
        searchKey="table_name"
        searchPlaceholder="테이블명 검색..."
      />
    </div>
  );
}
