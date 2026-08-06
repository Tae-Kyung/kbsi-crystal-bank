import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProteinForm } from '@/components/forms/protein-form';

export default async function EditProteinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: protein, error } = await supabase
    .from('kbsi_protein')
    .select('*')
    .eq('id', parseInt(id))
    .single();

  if (error || !protein) return notFound();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Edit Protein</h2>
      <ProteinForm mode="edit" initialData={protein} />
    </div>
  );
}
