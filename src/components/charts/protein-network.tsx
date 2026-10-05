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
  { key: 'expression', label: 'Expression', color: '#3b82f6', x: 100, y: 30 },
  { key: 'purification', label: 'Purification', color: '#6366f1', x: 250, y: 30 },
  { key: 'characterization', label: 'Character.', color: '#f97316', x: 400, y: 30 },
  { key: 'crystallization', label: 'Crystal.', color: '#8b5cf6', x: 550, y: 30 },
  { key: 'diffraction', label: 'Diffraction', color: '#ef4444', x: 700, y: 30 },
  { key: 'structure', label: 'Structure', color: '#22c55e', x: 850, y: 30 },
  { key: 'ligands', label: 'Ligands', color: '#ec4899', x: 550, y: 130 },
] as const;

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], // pipeline flow
  [3, 6], // crystallization → ligands (co-crystallization)
];

export function ProteinNetwork({ proteinName, constructCount, counts }: ProteinNetworkProps) {
  const nodeW = 110;
  const nodeH = 52;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox="0 -10 960 180" className="w-full min-w-[700px]" style={{ maxHeight: 200 }}>
        {/* Edges */}
        {EDGES.map(([from, to], i) => {
          const a = NODES[from];
          const b = NODES[to];
          const fromCount = counts[a.key as keyof typeof counts];
          const toCount = counts[b.key as keyof typeof counts];
          const hasData = fromCount > 0 && toCount > 0;
          return (
            <line
              key={i}
              x1={a.x + nodeW / 2}
              y1={a.y + nodeH / 2}
              x2={b.x + nodeW / 2}
              y2={b.y + nodeH / 2}
              stroke={hasData ? '#94a3b8' : '#e2e8f0'}
              strokeWidth={hasData ? 2 : 1}
              strokeDasharray={hasData ? undefined : '4'}
            />
          );
        })}

        {/* Protein center label */}
        <text x={480} y={170} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
          {proteinName} ({constructCount} constructs)
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
                y={node.y + 38}
                fontSize={13}
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
