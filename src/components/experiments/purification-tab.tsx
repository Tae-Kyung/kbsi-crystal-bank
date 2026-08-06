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

const RESULT_LEVELS = ['failed', 'low', 'acceptable', 'high'] as const;

export function PurificationTab({ data, constructId }: { data: any[]; constructId: number }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    method_summary: '', final_purity: '', final_yield: '', result_level: '',
    notes: '', performed_by: '', performed_on: '',
  });

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/purifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          construct_id: constructId,
          method_summary: form.method_summary || null,
          final_purity: form.final_purity ? parseFloat(form.final_purity) : null,
          final_yield: form.final_yield ? parseFloat(form.final_yield) : null,
          result_level: form.result_level || null,
          notes: form.notes || null,
          performed_by: form.performed_by || null,
          performed_on: form.performed_on || null,
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
          <Plus className="h-4 w-4 mr-1" />{showForm ? 'Cancel' : 'Add Purification'}
        </Button>
      </div>
      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Purification</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Method Summary" name="method_summary" className="md:col-span-2">
                <Input value={form.method_summary} onChange={(e) => set('method_summary', e.target.value)} placeholder="Ni-NTA → TEV cleavage → SEC" />
              </FormField>
              <FormField label="Result Level" name="result_level">
                <EnumSelect options={RESULT_LEVELS} value={form.result_level} onChange={(v) => set('result_level', v)} />
              </FormField>
              <FormField label="Final Purity (%)" name="final_purity">
                <Input type="number" step="0.1" value={form.final_purity} onChange={(e) => set('final_purity', e.target.value)} />
              </FormField>
              <FormField label="Final Yield (mg)" name="final_yield">
                <Input type="number" step="0.1" value={form.final_yield} onChange={(e) => set('final_yield', e.target.value)} />
              </FormField>
              <FormField label="Performed By" name="performed_by">
                <Input value={form.performed_by} onChange={(e) => set('performed_by', e.target.value)} />
              </FormField>
              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">#{p.attempt_number ?? p.id}</span>
                      {p.result_level && <Badge variant="secondary">{p.result_level}</Badge>}
                    </div>
                    {p.method_summary && <p className="text-sm">{p.method_summary}</p>}
                    <div className="text-sm text-muted-foreground">
                      {p.final_purity != null && `Purity: ${p.final_purity}%`}
                      {p.final_yield != null && ` | Yield: ${p.final_yield} mg`}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {p.performed_by && <div>{p.performed_by}</div>}
                    {p.performed_on && <div>{p.performed_on}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !showForm && <p className="text-center text-muted-foreground py-8">No purification data yet.</p>
      )}
    </div>
  );
}
