import { notFound } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { ProteinForm } from '@/components/forms/protein-form';

export default async function EditProteinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const protein = await queryOne(
    'SELECT * FROM kbsi_protein WHERE id = $1',
    [parseInt(id)]
  );

  if (!protein) return notFound();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Edit Protein</h2>
      <ProteinForm mode="edit" initialData={protein} />
    </div>
  );
}
