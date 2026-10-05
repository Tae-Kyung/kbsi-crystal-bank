'use client';

import { Badge } from '@/components/ui/badge';
import { DataTable } from './data-table';
import { type ColumnDef } from '@tanstack/react-table';

interface LigandRow {
  id: number;
  name: string;
  smiles: string | null;
  mw: number | null;
  source: string | null;
  source_db: string | null;
  source_id: string | null;
  created_at: string;
  kbsi_construct_ligand?: { count: number }[];
}

function getExternalUrl(source_db: string | null, source_id: string | null, name: string): { url: string; label: string; badge: string } | null {
  if (source_db === 'ChEMBL' && source_id) {
    return { url: `https://www.ebi.ac.uk/chembl/compound_report_card/${source_id}/`, label: source_id, badge: 'ChEMBL' };
  }
  if (source_db === 'PDB' && source_id) {
    return { url: `https://www.rcsb.org/ligand/${source_id}`, label: source_id, badge: 'PDB' };
  }
  // source 필드에서 ChEMBL ID 추출
  if (!source_id && name) {
    const match = name.match(/(CHEMBL\d+)/);
    if (match) return { url: `https://www.ebi.ac.uk/chembl/compound_report_card/${match[1]}/`, label: match[1], badge: 'ChEMBL' };
  }
  return null;
}

const columns: ColumnDef<LigandRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => {
      const r = row.original;
      const link = getExternalUrl(r.source_db, r.source_id, r.name);
      if (link) {
        return (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
            {r.name}
            <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        );
      }
      return <span className="font-medium">{r.name}</span>;
    },
  },
  {
    accessorKey: 'smiles',
    header: 'SMILES',
    cell: ({ row }) => {
      const smiles = row.original.smiles;
      if (!smiles) return '-';
      return (
        <span className="font-mono text-xs max-w-[250px] truncate block" title={smiles}>
          {smiles.length > 40 ? smiles.slice(0, 40) + '...' : smiles}
        </span>
      );
    },
  },
  {
    accessorKey: 'mw',
    header: 'MW (Da)',
    cell: ({ row }) => row.original.mw?.toFixed(1) ?? '-',
  },
  {
    id: 'source',
    header: 'Source',
    cell: ({ row }) => {
      const r = row.original;
      const link = getExternalUrl(r.source_db, r.source_id, r.name);
      if (link) {
        return (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px]">{link.badge}</Badge>
            <span className="text-[10px] text-primary hover:underline font-mono">{link.label}</span>
          </a>
        );
      }
      return r.source_db ? <Badge variant="outline" className="text-[10px]">{r.source_db}</Badge> : '-';
    },
  },
  {
    id: 'bindings',
    header: 'Bindings',
    cell: ({ row }) => {
      const count = row.original.kbsi_construct_ligand?.[0]?.count ?? 0;
      return count > 0 ? <Badge variant="secondary">{count}</Badge> : '-';
    },
  },
  {
    id: 'links',
    header: 'Links',
    cell: ({ row }) => {
      const r = row.original;
      const link = getExternalUrl(r.source_db, r.source_id, r.name);
      const smiles = r.smiles;

      return (
        <div className="flex gap-1.5">
          {link && (
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950">
                {link.badge}
              </Badge>
            </a>
          )}
          {smiles && (
            <a href={`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(smiles)}&input_type=smiles`} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-green-50 dark:hover:bg-green-950">
                PubChem
              </Badge>
            </a>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Added',
    cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString('ko-KR'),
  },
];

export function LigandTable({ data }: { data: LigandRow[] }) {
  return <DataTable columns={columns} data={data} searchKey="name" searchPlaceholder="리간드 이름 검색..." />;
}
