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

function logScale(val: number, maxVal: number, barMaxW: number): number {
  if (val <= 0) return 4;
  const logMax = Math.log10(maxVal + 1);
  const logVal = Math.log10(val + 1);
  return Math.max((logVal / logMax) * barMaxW, 20);
}

export function PipelineSankey({ data }: PipelineSankeyProps) {
  const allVals = [...STAGES.map(s => data[s.key as keyof typeof data] as number), data.ligands];
  const maxVal = Math.max(...allVals, 1);
  const barMaxW = 300;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {STAGES.map((stage) => {
          const val = data[stage.key as keyof typeof data] as number;
          const w = logScale(val, maxVal, barMaxW);

          return (
            <div key={stage.key} className="flex items-center gap-3">
              <div className="w-28 text-right text-xs text-muted-foreground">{stage.label}</div>
              <div className="flex-1 flex items-center gap-2">
                <div
                  className="h-7 rounded-r-md transition-all relative"
                  style={{ width: w, backgroundColor: stage.color + 'cc' }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white drop-shadow">
                    {val.toLocaleString()}
                  </span>
                </div>
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
            className="h-7 rounded-r-md relative"
            style={{
              width: logScale(data.ligands, maxVal, barMaxW),
              backgroundColor: '#ec4899cc',
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white drop-shadow">
              {data.ligands.toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {data.bindings.toLocaleString()} bindings
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-right">* log scale</p>
    </div>
  );
}
