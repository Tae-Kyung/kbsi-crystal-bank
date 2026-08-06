'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/forms/form-field';
import { EnumSelect } from '@/components/forms/enum-select';

const CONSTRUCT_TYPES = ['full-length', 'domain', 'truncation', 'fusion', 'mutant'] as const;
const TAG_POSITIONS = ['N-terminal', 'C-terminal'] as const;

function NewConstructForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proteinId = searchParams.get('protein_id') || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    protein_id: proteinId,
    name: '',
    residues: '',
    construct_type: '',
    expression_system: '',
    vector: '',
    tag_name: '',
    tag_position: '',
    seq_expression: '',
  });

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.protein_id) {
      setError('Protein ID is required');
      return;
    }
    setLoading(true);
    setError('');

    const body = {
      protein_id: parseInt(form.protein_id),
      name: form.name || null,
      residues: form.residues || null,
      construct_type: form.construct_type || null,
      expression_system: form.expression_system || null,
      vector: form.vector || null,
      tag_name: form.tag_name || null,
      tag_position: form.tag_position || null,
      seq_expression: form.seq_expression || null,
    };

    const res = await fetch('/api/constructs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to create construct');
      setLoading(false);
      return;
    }

    const { data } = await res.json();
    router.push(`/constructs/${data.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>New Construct</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Protein ID" name="protein_id" required>
              <Input
                type="number"
                value={form.protein_id}
                onChange={(e) => set('protein_id', e.target.value)}
                required
              />
            </FormField>
            <FormField label="Name" name="name">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. KRAS-G12D-1-169" />
            </FormField>
            <FormField label="Residues" name="residues">
              <Input value={form.residues} onChange={(e) => set('residues', e.target.value)} placeholder="e.g. 1-169" />
            </FormField>
            <FormField label="Construct Type" name="construct_type">
              <EnumSelect options={CONSTRUCT_TYPES} value={form.construct_type} onChange={(v) => set('construct_type', v)} />
            </FormField>
            <FormField label="Expression System" name="expression_system">
              <Input value={form.expression_system} onChange={(e) => set('expression_system', e.target.value)} placeholder="e.g. E. coli BL21(DE3)" />
            </FormField>
            <FormField label="Vector" name="vector">
              <Input value={form.vector} onChange={(e) => set('vector', e.target.value)} placeholder="e.g. pET-28a" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Tag Name" name="tag_name">
                <Input value={form.tag_name} onChange={(e) => set('tag_name', e.target.value)} placeholder="e.g. His6" />
              </FormField>
              <FormField label="Tag Position" name="tag_position">
                <EnumSelect options={TAG_POSITIONS} value={form.tag_position} onChange={(v) => set('tag_position', v)} />
              </FormField>
            </div>
            <FormField label="Sequence (Expression)" name="seq_expression">
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[80px]"
                value={form.seq_expression}
                onChange={(e) => set('seq_expression', e.target.value)}
                placeholder="Amino acid sequence..."
              />
            </FormField>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Construct'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewConstructPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
      <NewConstructForm />
    </Suspense>
  );
}
