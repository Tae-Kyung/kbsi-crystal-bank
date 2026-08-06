import { createClient } from '@/lib/supabase/server';
import { AuditTable } from '@/components/tables/audit-table';

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
      <AuditTable data={(logs ?? []) as any[]} />
    </div>
  );
}
