'use client';

import { useState, useEffect } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const OUTCOME_COLORS: Record<string, string> = {
  clear: '#94a3b8',
  precipitate: '#ef4444',
  phase_separation: '#f97316',
  microcrystal: '#eab308',
  single_crystal: '#22c55e',
  diffraction_quality: '#059669',
};

interface DataPoint {
  ph: number;
  temp: number;
  outcome: string;
  precipitant: string;
  source: string;
}

export function FullScatterChart() {
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });

  async function loadAllData() {
    setLoading(true);
    setData([]);

    try {
      // 1. 전체 건수 확인
      const countRes = await fetch('/api/export?table=kbsi_crystallization&format=json&_count=true');
      // count는 별도로 확인
      const PAGE = 1000;
      let offset = 0;
      let allPoints: DataPoint[] = [];
      let hasMore = true;

      while (hasMore) {
        const res = await fetch(`/api/export?table=kbsi_crystallization&format=json&_offset=${offset}&_limit=${PAGE}`);
        const json = await res.json();
        const rows = json.data || [];

        const points = rows
          .filter((r: any) => r.ph != null && r.temperature != null && r.outcome != null)
          .map((r: any) => ({
            ph: r.ph,
            temp: r.temperature,
            outcome: r.outcome,
            precipitant: r.precipitant_type || 'unknown',
            source: r.source_type || 'database',
          }));

        allPoints = allPoints.concat(points);
        setData([...allPoints]);
        setProgress({ loaded: allPoints.length, total: allPoints.length });

        if (rows.length < PAGE) {
          hasMore = false;
        } else {
          offset += PAGE;
        }
      }

      setLoaded(true);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!loaded && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <p className="text-sm text-muted-foreground">
          전체 결정화 데이터의 pH × Temperature 분포를 표시합니다.
          데이터 로딩에 시간이 걸릴 수 있습니다.
        </p>
        <Button onClick={loadAllData} size="lg">
          전체 데이터 로드
        </Button>
      </div>
    );
  }

  const realPoints = data.filter(p => p.source !== 'synthetic');
  const syntheticPoints = data.filter(p => p.source === 'synthetic');

  return (
    <div>
      {loading && (
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>로딩 중... {progress.loaded.toLocaleString()}건</span>
        </div>
      )}
      {loaded && (
        <div className="text-xs text-muted-foreground mb-3">
          전체 {data.length.toLocaleString()}건 (실험/DB: {realPoints.length.toLocaleString()}, 합성: {syntheticPoints.length.toLocaleString()})
        </div>
      )}
      <ResponsiveContainer width="100%" height={500}>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
          <XAxis type="number" dataKey="ph" name="pH" domain={[2, 12]} label={{ value: 'pH', position: 'bottom', offset: 10 }} />
          <YAxis type="number" dataKey="temp" name="Temperature" unit="°C" label={{ value: 'Temp (°C)', angle: -90, position: 'insideLeft' }} />
          <ZAxis range={[30, 30]} />
          <Tooltip
            content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-popover border rounded-md p-2 text-sm shadow-md">
                  <div>pH {d.ph} / {d.temp}°C</div>
                  <div className="font-medium">{d.outcome.replace(/_/g, ' ')}</div>
                  <div className="text-muted-foreground">{d.precipitant}</div>
                </div>
              );
            }}
          />
          <Legend
            payload={Object.entries(OUTCOME_COLORS).map(([name, color]) => ({
              value: name.replace(/_/g, ' '), type: 'circle', color,
            }))}
          />
          <Scatter name="실험/DB" data={realPoints} shape="circle">
            {realPoints.map((p, idx) => (
              <Cell key={idx} fill={OUTCOME_COLORS[p.outcome] || '#94a3b8'} fillOpacity={0.6} r={2} />
            ))}
          </Scatter>
          {syntheticPoints.length > 0 && (
            <Scatter name="합성" data={syntheticPoints} shape="triangle">
              {syntheticPoints.map((p, idx) => (
                <Cell key={idx} fill={OUTCOME_COLORS[p.outcome] || '#94a3b8'} fillOpacity={0.3} r={2} />
              ))}
            </Scatter>
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
