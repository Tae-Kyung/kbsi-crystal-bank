'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from './form-field';

interface ProteinFormProps {
  initialData?: {
    id?: number;
    custom_id?: string | null;
    full_name?: string;
    abbreviation?: string | null;
    gene_name?: string | null;
    organism?: string | null;
    owner?: string | null;
  };
  mode: 'create' | 'edit';
}

export function ProteinForm({ initialData, mode }: ProteinFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    custom_id: initialData?.custom_id ?? '',
    full_name: initialData?.full_name ?? '',
    abbreviation: initialData?.abbreviation ?? '',
    gene_name: initialData?.gene_name ?? '',
    organism: initialData?.organism ?? '',
    owner: initialData?.owner ?? '',
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const body = {
      ...form,
      custom_id: form.custom_id || null,
      abbreviation: form.abbreviation || null,
      gene_name: form.gene_name || null,
      organism: form.organism || null,
      owner: form.owner || null,
    };

    const url = mode === 'create' ? '/api/proteins' : `/api/proteins/${initialData?.id}`;
    const method = mode === 'create' ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.details?.fieldErrors) {
          const fieldErrors: Record<string, string> = {};
          for (const [k, v] of Object.entries(json.details.fieldErrors)) {
            fieldErrors[k] = (v as string[])[0];
          }
          setErrors(fieldErrors);
        }
        return;
      }

      router.push(`/proteins/${json.data.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Full Name" name="full_name" required error={errors.full_name}>
          <Input id="full_name" value={form.full_name} onChange={set('full_name')} />
        </FormField>

        <FormField label="Abbreviation" name="abbreviation" error={errors.abbreviation}>
          <Input id="abbreviation" value={form.abbreviation} onChange={set('abbreviation')} placeholder="e.g. KRAS" />
        </FormField>

        <FormField label="Gene Name" name="gene_name" error={errors.gene_name}>
          <Input id="gene_name" value={form.gene_name} onChange={set('gene_name')} />
        </FormField>

        <FormField label="Organism" name="organism" error={errors.organism}>
          <Input id="organism" value={form.organism} onChange={set('organism')} placeholder="e.g. Homo sapiens" />
        </FormField>

        <FormField label="Custom ID" name="custom_id" error={errors.custom_id}>
          <Input id="custom_id" value={form.custom_id} onChange={set('custom_id')} />
        </FormField>

        <FormField label="Owner" name="owner" error={errors.owner}>
          <Input id="owner" value={form.owner} onChange={set('owner')} />
        </FormField>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : mode === 'create' ? 'Create Protein' : 'Update Protein'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
