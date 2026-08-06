'use client';

import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const OUTCOME_COLORS: Record<string, string> = {
  clear: '#94a3b8',
  precipitate: '#ef4444',
  phase_separation: '#f97316',
  microcrystal: '#eab308',
  single_crystal: '#22c55e',
  diffraction_quality: '#059669',
};

interface CrystallizationHeatmapProps {
  data: { ph: number | null; temperature: number | null; outcome: string | null; precipitant_type: string | null }[];
}

export function CrystallizationHeatmap({ data }: CrystallizationHeatmapProps) {
  const points = data
    .filter((d) => d.ph != null && d.temperature != null)
    .map((d) => ({
      ph: d.ph!,
      temp: d.temperature!,
      outcome: d.outcome || 'unknown',
      precipitant: d.precipitant_type || 'unknown',
    }));

  if (points.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No crystallization data with pH and temperature yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
        <XAxis type="number" dataKey="ph" name="pH" domain={[3, 11]} label={{ value: 'pH', position: 'bottom' }} />
        <YAxis type="number" dataKey="temp" name="Temperature" unit="C" label={{ value: 'Temp (C)', angle: -90, position: 'insideLeft' }} />
        <ZAxis range={[60, 60]} />
        <Tooltip
          content={({ payload }) => {
            if (!payload?.[0]) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-popover border rounded-md p-2 text-sm shadow-md">
                <div>pH {d.ph} / {d.temp}C</div>
                <div className="font-medium">{d.outcome.replace(/_/g, ' ')}</div>
                <div className="text-muted-foreground">{d.precipitant}</div>
              </div>
            );
          }}
        />
        <Scatter data={points}>
          {points.map((p, idx) => (
            <Cell key={idx} fill={OUTCOME_COLORS[p.outcome] || '#94a3b8'} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
