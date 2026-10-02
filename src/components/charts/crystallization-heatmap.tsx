'use client';

import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

const OUTCOME_COLORS: Record<string, string> = {
  clear: '#94a3b8',
  precipitate: '#ef4444',
  phase_separation: '#f97316',
  microcrystal: '#eab308',
  single_crystal: '#22c55e',
  diffraction_quality: '#059669',
};

interface DataPoint {
  ph: number | null;
  temperature: number | null;
  outcome: string | null;
  precipitant_type: string | null;
  source_type?: string | null;
}

interface CrystallizationHeatmapProps {
  data: DataPoint[];
}

export function CrystallizationHeatmap({ data }: CrystallizationHeatmapProps) {
  const allPoints = data
    .filter((d) => d.ph != null && d.temperature != null)
    .map((d) => ({
      ph: d.ph!,
      temp: d.temperature!,
      outcome: d.outcome || 'unknown',
      precipitant: d.precipitant_type || 'unknown',
      source: d.source_type || 'experimental',
    }));

  if (allPoints.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No crystallization data with pH and temperature yet.</p>;
  }

  const realPoints = allPoints.filter((p) => p.source !== 'synthetic');
  const syntheticPoints = allPoints.filter((p) => p.source === 'synthetic');

  return (
    <div>
      <ResponsiveContainer width="100%" height={350}>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
          <XAxis type="number" dataKey="ph" name="pH" domain={[2, 12]} label={{ value: 'pH', position: 'bottom', offset: 10 }} />
          <YAxis type="number" dataKey="temp" name="Temperature" unit="°C" label={{ value: 'Temp (°C)', angle: -90, position: 'insideLeft' }} />
          <ZAxis range={[80, 80]} />
          <Tooltip
            content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-popover border rounded-md p-2 text-sm shadow-md">
                  <div>pH {d.ph} / {d.temp}°C</div>
                  <div className="font-medium">{d.outcome.replace(/_/g, ' ')}</div>
                  <div className="text-muted-foreground">{d.precipitant}</div>
                  <div className="text-xs text-muted-foreground">{d.source === 'synthetic' ? '(합성)' : '(실험/DB)'}</div>
                </div>
              );
            }}
          />
          <Legend
            payload={[
              { value: '성공 (실험/DB)', type: 'circle', color: '#059669' },
              { value: '성공 (합성)', type: 'triangle', color: '#059669' },
              { value: '실패 (실험/DB)', type: 'circle', color: '#ef4444' },
              { value: '실패 (합성)', type: 'triangle', color: '#ef4444' },
            ]}
          />
          {/* Real data — circles */}
          <Scatter name="실험/DB" data={realPoints} shape="circle">
            {realPoints.map((p, idx) => (
              <Cell key={idx} fill={OUTCOME_COLORS[p.outcome] || '#94a3b8'} fillOpacity={0.9} />
            ))}
          </Scatter>
          {/* Synthetic data — triangles */}
          {syntheticPoints.length > 0 && (
            <Scatter name="합성" data={syntheticPoints} shape="triangle">
              {syntheticPoints.map((p, idx) => (
                <Cell key={idx} fill={OUTCOME_COLORS[p.outcome] || '#94a3b8'} fillOpacity={0.5} />
              ))}
            </Scatter>
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
