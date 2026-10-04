'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const OUTCOME_COLORS: Record<string, string> = {
  clear: '#94a3b8',
  precipitate: '#ef4444',
  phase_separation: '#f97316',
  microcrystal: '#eab308',
  single_crystal: '#22c55e',
  diffraction_quality: '#059669',
};

interface OutcomeDistributionProps {
  data: any[];
}

export function OutcomeDistribution({ data }: OutcomeDistributionProps) {
  // 두 가지 형태 지원:
  // 1. 집계 데이터: { outcome, real, synthetic, count }
  // 2. 원시 데이터: { outcome, source_type }
  let chartData: { name: string; value: number; real: number; synthetic: number; fill: string }[];

  if (data.length > 0 && 'real' in data[0]) {
    // 이미 집계된 데이터
    chartData = data.map((d: any) => ({
      name: (d.outcome || '').replace(/_/g, ' '),
      value: (d.real || 0) + (d.synthetic || 0),
      real: d.real || 0,
      synthetic: d.synthetic || 0,
      fill: OUTCOME_COLORS[d.outcome] || '#94a3b8',
    }));
  } else {
    // 원시 데이터 — 클라이언트에서 집계
    const counts = data.reduce<Record<string, { real: number; synthetic: number }>>((acc, d: any) => {
      const outcome = d.outcome;
      if (!outcome) return acc;
      if (!acc[outcome]) acc[outcome] = { real: 0, synthetic: 0 };
      if (d.source_type === 'synthetic') acc[outcome].synthetic++;
      else acc[outcome].real++;
      return acc;
    }, {});

    chartData = Object.entries(counts).map(([name, { real, synthetic }]) => ({
      name: name.replace(/_/g, ' '),
      value: real + synthetic,
      real,
      synthetic,
      fill: OUTCOME_COLORS[name] || '#94a3b8',
    }));
  }

  if (chartData.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No crystallization data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={({ name, real, synthetic }) =>
            `${name}: ${real}${synthetic > 0 ? `+${synthetic}` : ''}`
          }
        >
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          content={({ payload }) => {
            if (!payload?.[0]) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-popover border rounded-md p-2 text-sm shadow-md">
                <div className="font-medium">{d.name}</div>
                <div>실험/DB: {d.real}건</div>
                {d.synthetic > 0 && <div>합성: {d.synthetic}건</div>}
                <div className="font-medium">합계: {d.value}건</div>
              </div>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
