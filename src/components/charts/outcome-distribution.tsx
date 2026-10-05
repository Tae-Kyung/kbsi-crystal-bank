'use client';

import { useState } from 'react';

const OUTCOME_COLORS: Record<string, string> = {
  clear: '#94a3b8',
  precipitate: '#ef4444',
  phase_separation: '#f97316',
  microcrystal: '#eab308',
  single_crystal: '#22c55e',
  diffraction_quality: '#059669',
};

const OUTCOME_LABELS: Record<string, string> = {
  clear: 'Clear',
  precipitate: 'Precipitate',
  phase_separation: 'Phase Sep.',
  microcrystal: 'Microcrystal',
  single_crystal: 'Single Crystal',
  diffraction_quality: 'Diffraction Quality',
};

interface OutcomeDistributionProps {
  data: any[];
}

export function OutcomeDistribution({ data }: OutcomeDistributionProps) {
  const [showSynthetic, setShowSynthetic] = useState(true);

  let chartData: { outcome: string; real: number; synthetic: number }[];

  if (data.length > 0 && 'real' in data[0]) {
    chartData = data.map((d: any) => ({
      outcome: d.outcome || '',
      real: d.real || 0,
      synthetic: d.synthetic || 0,
    }));
  } else {
    const counts: Record<string, { real: number; synthetic: number }> = {};
    data.forEach((d: any) => {
      const outcome = d.outcome;
      if (!outcome) return;
      if (!counts[outcome]) counts[outcome] = { real: 0, synthetic: 0 };
      if (d.source_type === 'synthetic') counts[outcome].synthetic++;
      else counts[outcome].real++;
    });
    chartData = Object.entries(counts).map(([outcome, v]) => ({ outcome, ...v }));
  }

  if (chartData.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No crystallization data yet.</p>;
  }

  // Sort: success outcomes last (bottom = green)
  const ORDER = ['clear', 'precipitate', 'phase_separation', 'microcrystal', 'single_crystal', 'diffraction_quality'];
  chartData.sort((a, b) => ORDER.indexOf(a.outcome) - ORDER.indexOf(b.outcome));

  const getVal = (d: { real: number; synthetic: number }) => showSynthetic ? d.real + d.synthetic : d.real;
  const total = chartData.reduce((sum, d) => sum + getVal(d), 0);
  const maxVal = Math.max(...chartData.map(d => getVal(d)), 1);

  const successCount = chartData
    .filter(d => d.outcome === 'single_crystal' || d.outcome === 'diffraction_quality')
    .reduce((sum, d) => sum + getVal(d), 0);
  const successRate = total > 0 ? ((successCount / total) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Success rate: <span className="font-bold text-green-600">{successRate}%</span>
          <span className="ml-1">({successCount.toLocaleString()} / {total.toLocaleString()})</span>
        </div>
        <button
          onClick={() => setShowSynthetic(!showSynthetic)}
          className="text-[10px] px-2 py-1 rounded border hover:bg-muted transition-colors"
        >
          {showSynthetic ? '합성 포함' : '실험만'}
        </button>
      </div>

      {/* Bars */}
      <div className="space-y-1.5">
        {chartData.map((d) => {
          const val = getVal(d);
          const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
          const barW = Math.max((val / maxVal) * 100, 2);
          const color = OUTCOME_COLORS[d.outcome] || '#94a3b8';

          return (
            <div key={d.outcome} className="flex items-center gap-2">
              <div className="w-28 text-right text-xs text-muted-foreground truncate">
                {OUTCOME_LABELS[d.outcome] || d.outcome}
              </div>
              <div className="flex-1 relative">
                <div className="flex h-6 rounded-sm overflow-hidden bg-muted/30">
                  {/* Real data bar */}
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(d.real / maxVal) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                  {/* Synthetic bar (striped) */}
                  {showSynthetic && d.synthetic > 0 && (
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${(d.synthetic / maxVal) * 100}%`,
                        backgroundColor: color,
                        opacity: 0.35,
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 6px)',
                      }}
                    />
                  )}
                </div>
              </div>
              <div className="w-20 text-right text-[11px] font-mono tabular-nums">
                <span className="font-semibold">{pct}%</span>
                <span className="text-muted-foreground ml-1">({val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val})</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-green-600" /> 실험/DB
        </div>
        {showSynthetic && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-600/35" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.4) 2px, rgba(255,255,255,0.4) 4px)' }} /> 합성(NC)
          </div>
        )}
      </div>
    </div>
  );
}
