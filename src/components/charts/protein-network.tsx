'use client';

interface ProteinNetworkProps {
  proteinName: string;
  constructCount: number;
  counts: {
    expression: number;
    purification: number;
    characterization: number;
    crystallization: number;
    diffraction: number;
    structure: number;
    ligands: number;
  };
}

const NODES = [
  { key: 'expression', label: 'Expression', color: '#3b82f6', x: 20, y: 20 },
  { key: 'purification', label: 'Purification', color: '#6366f1', x: 170, y: 20 },
  { key: 'characterization', label: 'Character.', color: '#f97316', x: 320, y: 20 },
  { key: 'crystallization', label: 'Crystal.', color: '#8b5cf6', x: 20, y: 100 },
  { key: 'diffraction', label: 'Diffraction', color: '#ef4444', x: 170, y: 100 },
  { key: 'structure', label: 'Structure', color: '#22c55e', x: 320, y: 100 },
  { key: 'ligands', label: 'Ligands', color: '#ec4899', x: 470, y: 60 },
] as const;

const EDGES: [number, number][] = [
  [0, 1], [1, 2], // row 1
  [2, 3], // row 1 → row 2
  [3, 4], [4, 5], // row 2
  [5, 6], // structure → ligands
];

export function ProteinNetwork({ proteinName, constructCount, counts }: ProteinNetworkProps) {
  const nodeW = 120;
  const nodeH = 52;

  return (
    <div className="w-full">
      <svg viewBox="0 0 610 180" className="w-full" style={{ maxHeight: 220 }}>
        {/* Edges */}
        {EDGES.map(([from, to], i) => {
          const a = NODES[from];
          const b = NODES[to];
          const fromCount = counts[a.key as keyof typeof counts];
          const toCount = counts[b.key as keyof typeof counts];
          const hasData = fromCount > 0 || toCount > 0;

          // For the wrap-around edge (row1→row2), use a path
          if (from === 2 && to === 3) {
            const x1 = a.x + nodeW / 2;
            const y1 = a.y + nodeH;
            const x2 = b.x + nodeW / 2;
            const y2 = b.y;
            return (
              <path
                key={i}
                d={`M${x1},${y1} C${x1},${y1 + 15} ${x2},${y2 - 15} ${x2},${y2}`}
                fill="none"
                stroke={hasData ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={hasData ? 2 : 1}
                strokeDasharray={hasData ? undefined : '4'}
                markerEnd={hasData ? 'url(#arrow)' : undefined}
              />
            );
          }

          return (
            <line
              key={i}
              x1={a.x + nodeW}
              y1={a.y + nodeH / 2}
              x2={b.x}
              y2={b.y + nodeH / 2}
              stroke={hasData ? '#94a3b8' : '#e2e8f0'}
              strokeWidth={hasData ? 2 : 1}
              strokeDasharray={hasData ? undefined : '4'}
            />
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Protein label */}
        <text x={305} y={172} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
          {proteinName} · {constructCount} construct{constructCount !== 1 ? 's' : ''}
        </text>

        {/* Nodes */}
        {NODES.map((node) => {
          const count = counts[node.key as keyof typeof counts];
          const active = count > 0;
          return (
            <g key={node.key}>
              <rect
                x={node.x}
                y={node.y}
                width={nodeW}
                height={nodeH}
                rx={8}
                fill={active ? node.color + '18' : '#f8fafc'}
                stroke={active ? node.color : '#e2e8f0'}
                strokeWidth={active ? 2 : 1}
              />
              <circle
                cx={node.x + 14}
                cy={node.y + nodeH / 2}
                r={5}
                fill={active ? node.color : '#cbd5e1'}
              />
              <text
                x={node.x + 26}
                y={node.y + 20}
                fontSize={11}
                fontWeight={600}
                fill={active ? node.color : '#94a3b8'}
              >
                {node.label}
              </text>
              <text
                x={node.x + 26}
                y={node.y + 40}
                fontSize={14}
                fontWeight={700}
                fill={active ? '#1e293b' : '#cbd5e1'}
              >
                {count.toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
