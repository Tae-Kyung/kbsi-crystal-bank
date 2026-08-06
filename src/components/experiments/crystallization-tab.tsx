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

const OUTCOMES = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'] as const;
const OUTCOME_COLORS: Record<string, string> = {
  clear: 'bg-gray-100 text-gray-700',
  precipitate: 'bg-red-100 text-red-800',
  phase_separation: 'bg-orange-100 text-orange-800',
  microcrystal: 'bg-yellow-100 text-yellow-800',
  single_crystal: 'bg-green-100 text-green-800',
  diffraction_quality: 'bg-emerald-100 text-emerald-900',
};

interface CrystallizationTabProps {
  data: any[];
  constructId: number;
}

export function CrystallizationTab({ data, constructId }: CrystallizationTabProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    stage: '', protein_concentration: '', precipitant_type: '', precipitant_conc: '',
    precipitant_unit: '%', buffer_type: '', ph: '', temperature: '',
    additive: '', drop_ratio: '1:1', outcome: '', condition_detail: '',
    performed_by: '', performed_on: '',
  });

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/crystallizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          construct_id: constructId,
          stage: form.stage || null,
          protein_concentration: form.protein_concentration ? parseFloat(form.protein_concentration) : null,
          precipitant_type: form.precipitant_type || null,
          precipitant_conc: form.precipitant_conc ? parseFloat(form.precipitant_conc) : null,
          precipitant_unit: form.precipitant_unit || null,
          buffer_type: form.buffer_type || null,
          ph: form.ph ? parseFloat(form.ph) : null,
          temperature: form.temperature ? parseFloat(form.temperature) : null,
          additive: form.additive || null,
          drop_ratio: form.drop_ratio || null,
          outcome: form.outcome || null,
          condition_detail: form.condition_detail || null,
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
          <Plus className="h-4 w-4 mr-1" />{showForm ? 'Cancel' : 'Add Crystallization'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Crystallization</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField label="Stage" name="stage">
                <EnumSelect options={['screening', 'optimization']} value={form.stage} onChange={(v) => set('stage', v)} />
              </FormField>
              <FormField label="Protein Conc (mg/mL)" name="protein_concentration">
                <Input type="number" step="0.1" value={form.protein_concentration} onChange={(e) => set('protein_concentration', e.target.value)} />
              </FormField>
              <FormField label="Precipitant Type" name="precipitant_type">
                <Input value={form.precipitant_type} onChange={(e) => set('precipitant_type', e.target.value)} placeholder="PEG 3350" />
              </FormField>
              <div className="flex gap-2">
                <FormField label="Conc" name="precipitant_conc" className="flex-1">
                  <Input type="number" step="0.1" value={form.precipitant_conc} onChange={(e) => set('precipitant_conc', e.target.value)} />
                </FormField>
                <FormField label="Unit" name="precipitant_unit" className="w-20">
                  <Input value={form.precipitant_unit} onChange={(e) => set('precipitant_unit', e.target.value)} />
                </FormField>
              </div>
              <FormField label="Buffer" name="buffer_type">
                <Input value={form.buffer_type} onChange={(e) => set('buffer_type', e.target.value)} placeholder="Bis-Tris" />
              </FormField>
              <FormField label="pH" name="ph">
                <Input type="number" step="0.1" min="0" max="14" value={form.ph} onChange={(e) => set('ph', e.target.value)} />
              </FormField>
              <FormField label="Temperature (C)" name="temperature">
                <Input type="number" step="1" value={form.temperature} onChange={(e) => set('temperature', e.target.value)} />
              </FormField>
              <FormField label="Drop Ratio" name="drop_ratio">
                <Input value={form.drop_ratio} onChange={(e) => set('drop_ratio', e.target.value)} />
              </FormField>
              <FormField label="Outcome" name="outcome">
                <EnumSelect options={OUTCOMES} value={form.outcome} onChange={(v) => set('outcome', v)} />
              </FormField>
              <FormField label="Condition Detail" name="condition_detail" className="md:col-span-2">
                <Input value={form.condition_detail} onChange={(e) => set('condition_detail', e.target.value)} placeholder="Screen kit, plate, well..." />
              </FormField>
              <FormField label="Performed By" name="performed_by">
                <Input value={form.performed_by} onChange={(e) => set('performed_by', e.target.value)} />
              </FormField>
              <div className="md:col-span-4 flex justify-end">
                <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">#{c.attempt_number ?? c.id}</span>
                      {c.outcome && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${OUTCOME_COLORS[c.outcome] ?? ''}`}>
                          {c.outcome.replace(/_/g, ' ')}
                        </span>
                      )}
                      {c.stage && <Badge variant="outline">{c.stage}</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {[
                        c.precipitant_type && `${c.precipitant_type} ${c.precipitant_conc ?? ''}${c.precipitant_unit ?? ''}`,
                        c.buffer_type && `${c.buffer_type}`,
                        c.ph != null && `pH ${c.ph}`,
                        c.temperature != null && `${c.temperature}°C`,
                        c.protein_concentration != null && `${c.protein_concentration} mg/mL`,
                      ].filter(Boolean).join(' | ')}
                    </div>
                    {c.condition_detail && <p className="text-sm">{c.condition_detail}</p>}
                    {c.days_to_crystal != null && <p className="text-sm">Crystal in {c.days_to_crystal} days</p>}
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {c.performed_by && <div>{c.performed_by}</div>}
                    {c.performed_on && <div>{c.performed_on}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !showForm && <p className="text-center text-muted-foreground py-8">No crystallization data yet.</p>
      )}
    </div>
  );
}
