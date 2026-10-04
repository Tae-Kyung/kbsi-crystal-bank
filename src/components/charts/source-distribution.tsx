'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';

const SOURCE_COLORS: Record<string, string> = {
  PDB: '#3b82f6',
  TargetTrack: '#8b5cf6',
  ChEMBL: '#f59e0b',
  KBSI: '#10b981',
  synthetic: '#ec4899',
  unknown: '#94a3b8',
};

const SOURCE_LABELS: Record<string, string> = {
  PDB: 'RCSB PDB',
  TargetTrack: 'TargetTrack',
  ChEMBL: 'ChEMBL',
  KBSI: 'KBSI (자체)',
  synthetic: '합성 데이터',
  unknown: '미분류',
};

interface SourceDistributionProps {
  data: { source_db: string; count: number }[];
}

export function SourceDistribution({ data }: SourceDistributionProps) {
  const chartData = data
    .sort((a, b) => b.count - a.count)
    .map(d => ({
      name: SOURCE_LABELS[d.source_db] || d.source_db,
      value: d.count,
      fill: SOURCE_COLORS[d.source_db] || SOURCE_COLORS.unknown,
      source_db: d.source_db,
    }));

  if (chartData.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No source data.</p>;
  }

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
          <Tooltip
            formatter={(value: number) => [`${value.toLocaleString()}건 (${(value / total * 100).toFixed(1)}%)`, '건수']}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-3 justify-center">
        {chartData.map(d => (
          <div key={d.source_db} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: d.fill }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-medium">{d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
