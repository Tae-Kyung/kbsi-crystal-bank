import { ProteinForm } from '@/components/forms/protein-form';

export default function NewProteinPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">New Protein</h2>
      <ProteinForm mode="create" />
    </div>
  );
}
