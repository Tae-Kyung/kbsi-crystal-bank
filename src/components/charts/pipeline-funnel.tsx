'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#6366f1', '#f97316', '#8b5cf6', '#ef4444', '#22c55e'];

interface PipelineFunnelProps {
  data: {
    expressions: number;
    purifications: number;
    characterizations: number;
    crystallizations: number;
    diffractions: number;
    structures: number;
  };
}

export function PipelineFunnel({ data }: PipelineFunnelProps) {
  const chartData = [
    { stage: 'Expression', count: data.expressions },
    { stage: 'Purification', count: data.purifications },
    { stage: 'Characterization', count: data.characterizations },
    { stage: 'Crystallization', count: data.crystallizations },
    { stage: 'Diffraction', count: data.diffractions },
    { stage: 'Structure', count: data.structures },
  ];

  if (chartData.every((d) => d.count === 0)) {
    return <p className="text-center text-muted-foreground py-8">No experiment data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <XAxis type="number" />
        <YAxis type="category" dataKey="stage" width={110} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value: number) => value.toLocaleString()} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {chartData.map((_, idx) => (
            <Cell key={idx} fill={COLORS[idx]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
