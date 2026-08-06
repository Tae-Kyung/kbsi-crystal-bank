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

const RESULT_LEVELS = ['no_expression', 'insoluble', 'low', 'moderate', 'high'] as const;
const RESULT_COLORS: Record<string, string> = {
  no_expression: 'bg-red-100 text-red-800',
  insoluble: 'bg-orange-100 text-orange-800',
  low: 'bg-yellow-100 text-yellow-800',
  moderate: 'bg-blue-100 text-blue-800',
  high: 'bg-green-100 text-green-800',
};

interface ExpressionTabProps {
  data: any[];
  constructId: number;
}

export function ExpressionTab({ data, constructId }: ExpressionTabProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    host: '', strain: '', induction_temp: '', yield_mg_l: '',
    solubility: '', result_level: '', conditions: '', notes: '',
    performed_by: '', performed_on: '',
  });

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/expressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          construct_id: constructId,
          host: form.host || null,
          strain: form.strain || null,
          induction_temp: form.induction_temp ? parseFloat(form.induction_temp) : null,
          yield_mg_l: form.yield_mg_l ? parseFloat(form.yield_mg_l) : null,
          solubility: form.solubility || null,
          result_level: form.result_level || null,
          conditions: form.conditions || null,
          notes: form.notes || null,
          performed_by: form.performed_by || null,
          performed_on: form.performed_on || null,
        }),
      });
      setShowForm(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" />{showForm ? 'Cancel' : 'Add Expression'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Expression</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Host" name="host">
                <Input value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="E. coli" />
              </FormField>
              <FormField label="Strain" name="strain">
                <Input value={form.strain} onChange={(e) => set('strain', e.target.value)} placeholder="BL21(DE3)" />
              </FormField>
              <FormField label="Induction Temp (C)" name="induction_temp">
                <Input type="number" step="0.1" value={form.induction_temp} onChange={(e) => set('induction_temp', e.target.value)} />
              </FormField>
              <FormField label="Yield (mg/L)" name="yield_mg_l">
                <Input type="number" step="0.1" value={form.yield_mg_l} onChange={(e) => set('yield_mg_l', e.target.value)} />
              </FormField>
              <FormField label="Result Level" name="result_level">
                <EnumSelect options={RESULT_LEVELS} value={form.result_level} onChange={(v) => set('result_level', v)} />
              </FormField>
              <FormField label="Performed By" name="performed_by">
                <Input value={form.performed_by} onChange={(e) => set('performed_by', e.target.value)} />
              </FormField>
              <FormField label="Performed On" name="performed_on">
                <Input type="date" value={form.performed_on} onChange={(e) => set('performed_on', e.target.value)} />
              </FormField>
              <FormField label="Conditions" name="conditions" className="md:col-span-2">
                <Input value={form.conditions} onChange={(e) => set('conditions', e.target.value)} placeholder="IPTG 0.5mM, 18C, 16h" />
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
          {data.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">#{exp.attempt_number ?? exp.id}</span>
                      {exp.result_level && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_COLORS[exp.result_level] ?? ''}`}>
                          {exp.result_level.replace(/_/g, ' ')}
                        </span>
                      )}
                      <Badge variant="outline">{exp.source_type}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {[exp.host, exp.strain].filter(Boolean).join(' / ') || 'No host info'}
                      {exp.induction_temp != null && ` | ${exp.induction_temp}°C`}
                      {exp.yield_mg_l != null && ` | ${exp.yield_mg_l} mg/L`}
                    </div>
                    {exp.conditions && <p className="text-sm">{exp.conditions}</p>}
                    {exp.notes && <p className="text-sm text-muted-foreground italic">{exp.notes}</p>}
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {exp.performed_by && <div>{exp.performed_by}</div>}
                    {exp.performed_on && <div>{exp.performed_on}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !showForm && <p className="text-center text-muted-foreground py-8">No expression data yet.</p>
      )}
    </div>
  );
}
