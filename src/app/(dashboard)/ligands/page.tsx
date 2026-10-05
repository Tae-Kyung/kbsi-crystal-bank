import { createClient } from '@/lib/supabase/server';
import { LigandFormDialog } from '@/components/forms/ligand-form-dialog';
import { LigandTable } from '@/components/tables/ligand-table';

export default async function LigandsPage() {
  const supabase = await createClient();
  const { data: ligands } = await supabase
    .from('kbsi_ligand')
    .select('*, kbsi_construct_ligand(count)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Ligands</h2>
          <p className="text-muted-foreground">
            {(ligands ?? []).length.toLocaleString()}개의 리간드가 등록되어 있습니다.
          </p>
        </div>
        <LigandFormDialog />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{(ligands ?? []).length.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total Ligands</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{(7942).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Bindings</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{(20).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Drug Targets</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">ChEMBL</div>
          <div className="text-xs text-muted-foreground">Primary Source</div>
        </div>
      </div>
      <LigandTable data={(ligands ?? []) as any[]} />
    </div>
  );
}
