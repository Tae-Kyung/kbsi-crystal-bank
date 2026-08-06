'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/forms/form-field';
import { EnumSelect } from '@/components/forms/enum-select';
import { Plus } from 'lucide-react';

const METHODS = ['X-ray', 'NMR', 'Cryo-EM'] as const;

export function StructureTab({ data, constructId }: { data: any[]; constructId: number }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ method: '', resolution: '', pdb_id: '', emdb_id: '', notes: '' });

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/structures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          construct_id: constructId,
          method: form.method,
          resolution: form.resolution ? parseFloat(form.resolution) : null,
          pdb_id: form.pdb_id || null,
          emdb_id: form.emdb_id || null,
          notes: form.notes || null,
        }),
      });
      setShowForm(false);
      router.refresh();
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" />{showForm ? 'Cancel' : 'Add Structure'}
        </Button>
      </div>
      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Structure</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField label="Method" name="method" required>
                <EnumSelect options={METHODS} value={form.method} onChange={(v) => set('method', v)} />
              </FormField>
              <FormField label="Resolution (A)" name="resolution">
                <Input type="number" step="0.01" value={form.resolution} onChange={(e) => set('resolution', e.target.value)} />
              </FormField>
              <FormField label="PDB ID" name="pdb_id">
                <Input value={form.pdb_id} onChange={(e) => set('pdb_id', e.target.value)} placeholder="e.g. 6GOD" />
              </FormField>
              <FormField label="EMDB ID" name="emdb_id">
                <Input value={form.emdb_id} onChange={(e) => set('emdb_id', e.target.value)} />
              </FormField>
              <div className="md:col-span-4 flex justify-end">
                <Button type="submit" disabled={loading || !form.method}>{loading ? 'Saving...' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Badge>{s.method}</Badge>
                  {s.resolution && <span className="text-sm">{s.resolution} A</span>}
                  {s.pdb_id && <Badge variant="outline" className="font-mono">{s.pdb_id}</Badge>}
                  {s.emdb_id && <Badge variant="outline" className="font-mono">{s.emdb_id}</Badge>}
                  {s.bmrb_id && <Badge variant="outline" className="font-mono">{s.bmrb_id}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !showForm && <p className="text-center text-muted-foreground py-8">No structure data yet.</p>
      )}
    </div>
  );
}
