'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb } from 'lucide-react';

interface PhInsight { range: string; total: number; success: number; rate: number }
interface TempInsight { range: string; total: number; success: number; rate: number }
interface PrecipInsight { precipitant: string; total: number; success: number; rate: number }

interface InsightsData {
  phInsights: PhInsight[];
  tempInsights: TempInsight[];
  precipInsights: PrecipInsight[];
  patterns: string[];
}

function BarChart({ items, labelKey, color }: { items: { label: string; rate: number; total: number }[]; labelKey: string; color: string }) {
  const maxRate = Math.max(...items.map(i => i.rate), 1);
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{labelKey}</div>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-sm">
          <div className="w-16 text-right text-xs text-muted-foreground truncate">{item.label}</div>
          <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden relative">
            <div
              className={`h-full rounded-sm ${color}`}
              style={{ width: `${Math.max((item.rate / maxRate) * 100, 2)}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
              {item.rate}%
            </span>
          </div>
          <div className="w-14 text-[10px] text-muted-foreground text-right">{item.total.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

export function DataInsights() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/insights')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const phItems = data.phInsights.map(p => ({ label: `pH ${p.range}`, rate: p.rate, total: p.total }));
  const tempItems = data.tempInsights.map(t => ({ label: t.range, rate: t.rate, total: t.total }));
  const precipItems = data.precipInsights.map(p => ({ label: p.precipitant, rate: p.rate, total: p.total }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Cross-Analysis Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.patterns.length > 0 && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 space-y-1">
            {data.patterns.map((p, i) => (
              <p key={i} className="text-sm text-blue-800 dark:text-blue-200">• {p}</p>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <BarChart items={phItems} labelKey="pH Range Success Rate" color="bg-emerald-500" />
          <BarChart items={tempItems} labelKey="Temperature Success Rate" color="bg-sky-500" />
          <BarChart items={precipItems} labelKey="Top Precipitant Success Rate" color="bg-violet-500" />
        </div>
      </CardContent>
    </Card>
  );
}
