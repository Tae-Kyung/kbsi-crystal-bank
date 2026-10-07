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

function rateColor(rate: number): string {
  if (rate >= 60) return 'bg-green-600 text-white';
  if (rate >= 40) return 'bg-green-400 text-white';
  if (rate >= 25) return 'bg-yellow-400 text-gray-900';
  if (rate >= 10) return 'bg-orange-400 text-white';
  return 'bg-red-500 text-white';
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
            <div className="h-40 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const phLabels = data.phInsights.map(p => p.range);
  const tempLabels = data.tempInsights.map(t => t.range);

  // pH × Temperature 히트맵 데이터 생성 (각 셀의 성공률 추정)
  // 개별 축의 성공률을 조합: rate_cell ≈ rate_ph * rate_temp / avg_rate
  const avgRate = data.phInsights.reduce((s, p) => s + p.rate, 0) / (data.phInsights.length || 1);
  const heatmapData = tempLabels.map((temp, ti) => {
    const tempRate = data.tempInsights[ti]?.rate ?? 0;
    return phLabels.map((ph, pi) => {
      const phRate = data.phInsights[pi]?.rate ?? 0;
      // 조합 추정: 두 축의 비율을 곱한 후 정규화
      const estimated = avgRate > 0 ? Math.round(phRate * tempRate / avgRate) : 0;
      return Math.min(estimated, 100);
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Crystallization Success Rate Heatmap
          <span className="text-xs font-normal text-muted-foreground">(pH × Temperature)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Patterns */}
        {data.patterns.length > 0 && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 space-y-1">
            {data.patterns.map((p, i) => (
              <p key={i} className="text-sm text-blue-800 dark:text-blue-200">• {p}</p>
            ))}
          </div>
        )}

        {/* Heatmap */}
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-right text-muted-foreground">Temp \ pH</th>
                {phLabels.map(ph => (
                  <th key={ph} className="px-2 py-1 text-center text-muted-foreground font-normal">{ph}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tempLabels.map((temp, ti) => (
                <tr key={temp}>
                  <td className="px-2 py-1 text-right text-muted-foreground whitespace-nowrap">{temp}</td>
                  {heatmapData[ti].map((rate, pi) => (
                    <td key={pi} className="px-1 py-1">
                      <div className={`w-12 h-8 rounded flex items-center justify-center text-[11px] font-bold ${rateColor(rate)}`}>
                        {rate}%
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>낮음</span>
          <div className="flex gap-0.5">
            <div className="w-6 h-3 rounded-sm bg-red-500" />
            <div className="w-6 h-3 rounded-sm bg-orange-400" />
            <div className="w-6 h-3 rounded-sm bg-yellow-400" />
            <div className="w-6 h-3 rounded-sm bg-green-400" />
            <div className="w-6 h-3 rounded-sm bg-green-600" />
          </div>
          <span>높음</span>
          <span className="ml-2">(성공 = single_crystal + diffraction_quality)</span>
        </div>

        {/* Precipitant row */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Top Precipitant Success Rate</p>
          <div className="flex flex-wrap gap-2">
            {data.precipInsights.filter(p => p.total > 0).map(p => (
              <div key={p.precipitant} className={`rounded px-2 py-1 text-xs font-medium ${rateColor(p.rate)}`}>
                {p.precipitant} {p.rate}% <span className="opacity-70">({p.total.toLocaleString()})</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
