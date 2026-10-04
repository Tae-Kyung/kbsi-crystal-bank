'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ZoomIn, ZoomOut, Filter } from 'lucide-react';

type SourceFilter = 'all' | 'real' | 'synthetic';

export function ServerScatterChart() {
  const [source, setSource] = useState<SourceFilter>('all');
  const [size, setSize] = useState<'normal' | 'large'>('normal');
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState(0);

  const w = size === 'large' ? 1200 : 900;
  const h = size === 'large' ? 800 : 600;
  const src = `/api/charts/scatter?width=${w}&height=${h}&source=${source}&_t=${key}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {(['all', 'real', 'synthetic'] as const).map(f => (
            <Button
              key={f}
              variant={source === f ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setSource(f); setKey(k => k + 1); }}
            >
              <Filter className="h-3 w-3 mr-1" />
              {f === 'all' ? '전체' : f === 'real' ? '실험/DB' : '합성'}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => { setSize(s => s === 'normal' ? 'large' : 'normal'); setKey(k => k + 1); }}
        >
          {size === 'normal' ? <ZoomIn className="h-3 w-3 mr-1" /> : <ZoomOut className="h-3 w-3 mr-1" />}
          {size === 'normal' ? '확대' : '축소'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setKey(k => k + 1)}
        >
          새로고침
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Crystallization pH vs Temperature scatter plot"
          width={w}
          height={h}
          className="w-full h-auto"
          onLoadStart={() => setLoading(true)}
          onLoad={() => setLoading(false)}
        />
        {loading && (
          <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            서버에서 차트 생성 중...
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        서버에서 전체 데이터를 처리하여 SVG를 생성합니다. 클라이언트에 행 데이터가 전송되지 않아 빠릅니다.
        5분간 캐시됩니다.
      </p>
    </div>
  );
}
