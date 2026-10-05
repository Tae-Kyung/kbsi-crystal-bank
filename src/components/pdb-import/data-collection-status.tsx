'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Stats {
  statistics: Record<string, number>;
}

interface Quality {
  total_crystallization: number;
  field_coverage: Record<string, { count: number; pct: number }>;
  outcome_null: number;
  synthetic_count: number;
  experimental_count: number;
}

export function DataCollectionStatus() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // MCP로 stats + quality 조회
        const [statsRes, qualityRes] = await Promise.all([
          fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_statistics', arguments: {} } }),
          }),
          fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_data_quality', arguments: {} } }),
          }),
        ]);

        const s = await statsRes.json();
        const q = await qualityRes.json();
        setStats(JSON.parse(s.result.content[0].text));
        setQuality(JSON.parse(q.result.content[0].text));
      } catch (e) {
        console.error('Failed to load stats:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Card><CardContent className="p-6 text-center text-muted-foreground">로딩 중...</CardContent></Card>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 수집 현황 */}
      <Card>
        <CardHeader><CardTitle className="text-sm">수집 현황</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {stats && Object.entries(stats.statistics).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground capitalize">{key}</span>
              <span className="text-sm font-bold">{value.toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 데이터 품질 */}
      <Card>
        <CardHeader><CardTitle className="text-sm">데이터 품질</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {quality && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">전체 결정화</span>
                <span className="text-sm font-bold">{quality.total_crystallization.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">실험 데이터</span>
                <span className="text-sm font-bold">{quality.experimental_count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">합성 데이터</span>
                <span className="text-sm font-bold">{quality.synthetic_count.toLocaleString()}</span>
              </div>
              <div className="border-t pt-2 mt-2 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">필드 구조화율</p>
                {Object.entries(quality.field_coverage).map(([field, { pct }]) => (
                  <div key={field} className="flex items-center gap-2">
                    <span className="text-xs w-28 text-muted-foreground">{field}</span>
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium w-12 text-right">{pct}%</span>
                    {pct < 10 && <Badge variant="destructive" className="text-[9px] px-1 py-0">개선 필요</Badge>}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
