import { createClient } from '@/lib/supabase/server';
import { LigandFormDialog } from '@/components/forms/ligand-form-dialog';
import { LigandTable } from '@/components/tables/ligand-table';

export default async function LigandsPage() {
  const supabase = await createClient();
  const { data: ligands } = await supabase.from('kbsi_ligand').select('*').order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Ligands</h2>
        <LigandFormDialog />
      </div>
      <LigandTable data={(ligands ?? []) as any[]} />
    </div>
  );
}
