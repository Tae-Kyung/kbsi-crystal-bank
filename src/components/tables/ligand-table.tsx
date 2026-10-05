'use client';

import Link from 'next/link';
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
  kbsi_construct_ligand?: any[];
}

function getExternalUrl(source_db: string | null, source_id: string | null, name: string): { url: string; label: string; badge: string } | null {
  if (source_db === 'ChEMBL' && source_id) {
    return { url: `https://www.ebi.ac.uk/chembl/compound_report_card/${source_id}/`, label: source_id, badge: 'ChEMBL' };
  }
  if (source_db === 'PDB' && source_id) {
    return { url: `https://www.rcsb.org/ligand/${source_id}`, label: source_id, badge: 'PDB' };
  }
  if (!source_id && name) {
    const match = name.match(/(CHEMBL\d+)/);
    if (match) return { url: `https://www.ebi.ac.uk/chembl/compound_report_card/${match[1]}/`, label: match[1], badge: 'ChEMBL' };
  }
  return null;
}

function getBindingTarget(row: LigandRow): { proteinName: string; proteinId: number; constructName: string; constructId: number } | null {
  const bindings = row.kbsi_construct_ligand;
  if (!bindings || bindings.length === 0) return null;
  // Find first binding with construct/protein info
  for (const b of bindings) {
    const c = b.kbsi_construct;
    if (c && c.kbsi_protein) {
      return {
        proteinName: c.kbsi_protein.abbreviation || c.kbsi_protein.full_name?.slice(0, 15) || '',
        proteinId: c.kbsi_protein.id,
        constructName: c.name?.slice(0, 15) || `#${c.id}`,
        constructId: c.id,
      };
    }
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
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline text-xs">
            {r.name.length > 25 ? r.name.slice(0, 25) + '...' : r.name}
          </a>
        );
      }
      return <span className="font-medium text-xs">{r.name.length > 25 ? r.name.slice(0, 25) + '...' : r.name}</span>;
    },
  },
  {
    id: 'target',
    header: 'Target Protein',
    cell: ({ row }) => {
      const target = getBindingTarget(row.original);
      if (!target) return <span className="text-xs text-muted-foreground">-</span>;
      return (
        <Link href={`/proteins/${target.proteinId}`} className="text-primary hover:underline text-xs">
          {target.proteinName}
        </Link>
      );
    },
  },
  {
    accessorKey: 'mw',
    header: 'MW',
    cell: ({ row }) => <span className="text-xs">{row.original.mw?.toFixed(0) ?? '-'}</span>,
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
      const bindings = row.original.kbsi_construct_ligand;
      const count = bindings?.length ?? bindings?.[0]?.count ?? 0;
      return count > 0 ? <Badge variant="secondary" className="text-[10px]">{count}</Badge> : '-';
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
              <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950">{link.badge}</Badge>
            </a>
          )}
          {smiles && (
            <a href={`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(smiles)}&input_type=smiles`} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-green-50 dark:hover:bg-green-950">PubChem</Badge>
            </a>
          )}
        </div>
      );
    },
  },
];

export function LigandTable({ data }: { data: LigandRow[] }) {
  return <DataTable columns={columns} data={data} searchKey="name" searchPlaceholder="리간드 이름 검색..." />;
}
