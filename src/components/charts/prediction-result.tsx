'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/forms/form-field';

interface PredictionResponse {
  prediction: {
    success_probability: number;
    confidence: 'high' | 'medium' | 'low';
    k_used: number;
    data_points_total: number;
  } | null;
  outcome_distribution: Record<string, number>;
  best_match: Record<string, any> | null;
  message?: string;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-red-500',
};

export function PredictionResult() {
  const [form, setForm] = useState({
    protein_concentration: '',
    precipitant_type: '',
    precipitant_conc: '',
    ph: '',
    temperature: '',
    additive: '',
  });
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handlePredict(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, any> = {};
      if (form.protein_concentration) body.protein_concentration = parseFloat(form.protein_concentration);
      if (form.precipitant_type) body.precipitant_type = form.precipitant_type;
      if (form.precipitant_conc) body.precipitant_conc = parseFloat(form.precipitant_conc);
      if (form.ph) body.ph = parseFloat(form.ph);
      if (form.temperature) body.temperature = parseFloat(form.temperature);
      if (form.additive) body.additive = form.additive;

      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Prediction failed');
      }

      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>결정화 성공 확률 예측</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePredict} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Protein Conc. (mg/mL)" name="protein_concentration">
              <Input type="number" step="0.1" value={form.protein_concentration} onChange={(e) => set('protein_concentration', e.target.value)} />
            </FormField>
            <FormField label="Precipitant Type" name="precipitant_type">
              <Input value={form.precipitant_type} onChange={(e) => set('precipitant_type', e.target.value)} placeholder="e.g. PEG 3350" />
            </FormField>
            <FormField label="Precipitant Conc." name="precipitant_conc">
              <Input type="number" step="0.1" value={form.precipitant_conc} onChange={(e) => set('precipitant_conc', e.target.value)} />
            </FormField>
            <FormField label="pH" name="ph">
              <Input type="number" step="0.1" min="0" max="14" value={form.ph} onChange={(e) => set('ph', e.target.value)} />
            </FormField>
            <FormField label="Temperature (°C)" name="temperature">
              <Input type="number" step="1" value={form.temperature} onChange={(e) => set('temperature', e.target.value)} />
            </FormField>
            <FormField label="Additive" name="additive">
              <Input value={form.additive} onChange={(e) => set('additive', e.target.value)} placeholder="optional" />
            </FormField>
            <div className="md:col-span-3 flex justify-end">
              <Button type="submit" disabled={loading}>{loading ? 'Predicting...' : 'Predict'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-300">
          <CardContent className="p-4 text-red-600">{error}</CardContent>
        </Card>
      )}

      {result && (
        <>
          {result.prediction ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  예측 결과
                  <Badge className={CONFIDENCE_COLOR[result.prediction.confidence]}>
                    Confidence: {result.prediction.confidence}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold">
                    {result.prediction.success_probability}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    성공 확률 (k={result.prediction.k_used}, 총 {result.prediction.data_points_total}건 기반)
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${result.prediction.success_probability}%` }}
                  />
                </div>

                {/* Outcome distribution */}
                {Object.keys(result.outcome_distribution).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">이웃 Outcome 분포</h4>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(result.outcome_distribution).map(([outcome, count]) => (
                        <Badge key={outcome} variant="outline">
                          {outcome}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Best match */}
                {result.best_match && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">가장 유사한 성공 사례</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      {result.best_match.precipitant_type && (
                        <div><span className="text-muted-foreground">Precipitant:</span> {result.best_match.precipitant_type}</div>
                      )}
                      {result.best_match.ph && (
                        <div><span className="text-muted-foreground">pH:</span> {result.best_match.ph}</div>
                      )}
                      {result.best_match.temperature && (
                        <div><span className="text-muted-foreground">Temp:</span> {result.best_match.temperature}°C</div>
                      )}
                      {result.best_match.outcome && (
                        <div><span className="text-muted-foreground">Outcome:</span> {result.best_match.outcome}</div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 text-muted-foreground">
                {result.message || '예측 불가 — 데이터가 부족합니다.'}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
