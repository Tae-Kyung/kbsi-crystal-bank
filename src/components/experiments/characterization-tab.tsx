'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/forms/form-field';
import { Plus } from 'lucide-react';

const METHODS = ['DLS_PDI', 'DLS_Rh', 'DSC_Tm', 'SECMALS_MW', 'MS_mass', 'UV_A280', 'CD', 'other'] as const;

export function CharacterizationTab({ data, constructId }: { data: any[]; constructId: number }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ method: '', value_num: '', value_text: '', unit_raw: '', notes: '' });

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/characterizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          construct_id: constructId,
          method: form.method,
          value_num: form.value_num ? parseFloat(form.value_num) : null,
          value_text: form.value_text || null,
          unit_raw: form.unit_raw || null,
          notes: form.notes || null,
        }),
      });
      setShowForm(false);
      router.refresh();
    } finally { setLoading(false); }
  }

  // Group by method
  const grouped = data.reduce((acc: Record<string, any[]>, item) => {
    const key = item.method || 'other';
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" />{showForm ? 'Cancel' : 'Add Measurement'}
        </Button>
      </div>
      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Characterization</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField label="Method" name="method" required>
                <select className="flex h-8 w-full rounded-lg border px-2.5 text-sm" value={form.method} onChange={(e) => set('method', e.target.value)}>
                  <option value="">Select...</option>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>
              <FormField label="Value (numeric)" name="value_num">
                <Input type="number" step="any" value={form.value_num} onChange={(e) => set('value_num', e.target.value)} />
              </FormField>
              <FormField label="Value (text)" name="value_text">
                <Input value={form.value_text} onChange={(e) => set('value_text', e.target.value)} />
              </FormField>
              <FormField label="Unit" name="unit_raw">
                <Input value={form.unit_raw} onChange={(e) => set('unit_raw', e.target.value)} placeholder="kDa, C, ..." />
              </FormField>
              <div className="md:col-span-4 flex justify-end">
                <Button type="submit" disabled={loading || !form.method}>{loading ? 'Saving...' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {Object.keys(grouped).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(grouped).map(([method, items]) => (
            <Card key={method}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-mono">{method}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {(items as any[]).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 text-sm">
                      {item.value_num != null && <span className="font-medium">{item.value_num}</span>}
                      {item.value_text && <span>{item.value_text}</span>}
                      {item.unit_raw && <span className="text-muted-foreground">{item.unit_raw}</span>}
                      <Badge variant="outline" className="text-xs">{item.source_type}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !showForm && <p className="text-center text-muted-foreground py-8">No characterization data yet.</p>
      )}
    </div>
  );
}
