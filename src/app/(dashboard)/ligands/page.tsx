import { createClient } from '@/lib/supabase/server';
import { LigandFormDialog } from '@/components/forms/ligand-form-dialog';
import { LigandTable } from '@/components/tables/ligand-table';

export default async function LigandsPage() {
  const supabase = await createClient();
  const [{ count: ligandCount }, { count: bindingCount }, { data: ligands }] = await Promise.all([
    supabase.from('kbsi_ligand').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_construct_ligand').select('id', { count: 'exact', head: true }),
    supabase.from('kbsi_ligand')
      .select('*, kbsi_construct_ligand(count)')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  // 소스 분포
  const sourceSet = new Set((ligands ?? []).map((l: any) => l.source_db).filter(Boolean));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Ligands</h2>
          <p className="text-muted-foreground">
            {(ligandCount ?? 0).toLocaleString()}개의 리간드가 등록되어 있습니다.
          </p>
        </div>
        <LigandFormDialog />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{(ligandCount ?? 0).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total Ligands</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{(bindingCount ?? 0).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Bindings</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{sourceSet.size || 1}</div>
          <div className="text-xs text-muted-foreground">Data Sources</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{[...sourceSet].join(', ') || 'ChEMBL'}</div>
          <div className="text-xs text-muted-foreground">Sources</div>
        </div>
      </div>
      <LigandTable data={(ligands ?? []) as any[]} />
    </div>
  );
}
