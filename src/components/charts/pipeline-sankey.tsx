'use client';

interface PipelineSankeyProps {
  data: {
    expression: number;
    purification: number;
    characterization: number;
    crystallization: number;
    diffraction: number;
    structure: number;
    ligands: number;
    bindings: number;
  };
}

const STAGES = [
  { key: 'expression', label: 'Expression', color: '#3b82f6' },
  { key: 'purification', label: 'Purification', color: '#6366f1' },
  { key: 'characterization', label: 'Characterization', color: '#f97316' },
  { key: 'crystallization', label: 'Crystallization', color: '#8b5cf6' },
  { key: 'diffraction', label: 'Diffraction', color: '#ef4444' },
  { key: 'structure', label: 'Structure', color: '#22c55e' },
] as const;

export function PipelineSankey({ data }: PipelineSankeyProps) {
  const maxVal = Math.max(...STAGES.map(s => data[s.key as keyof typeof data] as number), 1);
  const barMaxW = 280;

  return (
    <div className="space-y-4">
      {/* Pipeline flow */}
      <div className="space-y-1.5">
        {STAGES.map((stage, i) => {
          const val = data[stage.key as keyof typeof data] as number;
          const w = Math.max((val / maxVal) * barMaxW, 4);
          const prevVal = i > 0 ? data[STAGES[i - 1].key as keyof typeof data] as number : val;
          const convRate = prevVal > 0 && i > 0 ? Math.round((val / prevVal) * 100) : null;

          return (
            <div key={stage.key} className="flex items-center gap-3">
              <div className="w-28 text-right text-xs text-muted-foreground">{stage.label}</div>
              <div className="flex-1 flex items-center gap-2">
                <div
                  className="h-6 rounded-r-md transition-all relative"
                  style={{ width: w, backgroundColor: stage.color + 'cc' }}
                >
                  {val > 0 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">
                      {val.toLocaleString()}
                    </span>
                  )}
                </div>
                {convRate !== null && val > 0 && prevVal > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {convRate > 100 ? '' : `← ${convRate}%`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ligand branch */}
      <div className="flex items-center gap-3 border-t pt-3">
        <div className="w-28 text-right text-xs text-muted-foreground">Ligands</div>
        <div className="flex items-center gap-2">
          <div
            className="h-6 rounded-r-md relative"
            style={{
              width: Math.max((data.ligands / maxVal) * barMaxW, 4),
              backgroundColor: '#ec4899cc',
            }}
          >
            {data.ligands > 0 && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">
                {data.ligands.toLocaleString()}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">
            → {data.bindings.toLocaleString()} bindings
          </span>
        </div>
      </div>
    </div>
  );
}
