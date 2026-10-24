import { query, scalar } from '@/lib/db';
import { AuditTable } from '@/components/tables/audit-table';

export default async function AuditPage() {
  const [logs, count] = await Promise.all([
    query<any>('SELECT * FROM kbsi_audit_log ORDER BY changed_at DESC LIMIT 100'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_audit_log'),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Audit Log</h2>
        <p className="text-muted-foreground">{Number(count) ?? 0}건의 변경 이력</p>
      </div>
      <AuditTable data={(logs ?? []) as any[]} />
    </div>
  );
}
