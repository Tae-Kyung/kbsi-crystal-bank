'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const OUTCOME_COLORS: Record<string, string> = {
  clear: '#94a3b8',
  precipitate: '#ef4444',
  phase_separation: '#f97316',
  microcrystal: '#eab308',
  single_crystal: '#22c55e',
  diffraction_quality: '#059669',
};

interface OutcomeDistributionProps {
  data: { outcome: string | null }[];
}

export function OutcomeDistribution({ data }: OutcomeDistributionProps) {
  const counts = data.reduce<Record<string, number>>((acc, { outcome }) => {
    if (outcome) acc[outcome] = (acc[outcome] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(counts).map(([name, value]) => ({
    name: name.replace(/_/g, ' '),
    value,
    fill: OUTCOME_COLORS[name] || '#94a3b8',
  }));

  if (chartData.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No crystallization data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
