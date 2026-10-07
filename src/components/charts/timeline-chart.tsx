'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';

interface TimelineData {
  year: number;
  count: number;
  cumulative: number;
}

export function TimelineChart() {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/timeline')
      .then(r => r.json())
      .then(d => setData(d.timeline || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse h-48 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) return null;

  // 최근 30년만
  const recent = data.filter(d => d.year >= 1990);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          PDB Structure Deposits by Year
          <span className="text-xs font-normal text-muted-foreground ml-2">
            ({data[data.length - 1]?.cumulative.toLocaleString()} total)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={recent}>
            <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={4} />
            <YAxis yAxisId="bar" tick={{ fontSize: 10 }} width={50} />
            <YAxis yAxisId="line" orientation="right" tick={{ fontSize: 10 }} width={60} />
            <Tooltip
              formatter={(value: number, name: string) => [
                value.toLocaleString(),
                name === 'count' ? 'New deposits' : 'Cumulative',
              ]}
            />
            <Bar yAxisId="bar" dataKey="count" fill="#3b82f6" opacity={0.7} radius={[2, 2, 0, 0]} />
            <Line yAxisId="line" dataKey="cumulative" stroke="#ef4444" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
