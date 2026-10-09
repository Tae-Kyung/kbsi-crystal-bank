'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, Loader2 } from 'lucide-react';

interface OrganismInfo {
  organism: string;
  count: number;
}

interface ProteinInfo {
  id: number;
  full_name: string;
  abbreviation: string | null;
  gene_name: string | null;
}

interface ProteinDetail {
  expression: number;
  purification: number;
  characterization: number;
  crystallization: number;
  diffraction: number;
  structure: number;
  ligands: number;
}

const PIPELINE = [
  { key: 'expression', label: 'Expr', color: 'bg-blue-500' },
  { key: 'purification', label: 'Purif', color: 'bg-indigo-500' },
  { key: 'characterization', label: 'Char', color: 'bg-orange-500' },
  { key: 'crystallization', label: 'Cryst', color: 'bg-purple-500' },
  { key: 'diffraction', label: 'Diffr', color: 'bg-red-500' },
  { key: 'structure', label: 'Struct', color: 'bg-green-500' },
  { key: 'ligands', label: 'Ligands', color: 'bg-pink-500' },
] as const;

export default function ExplorerPage() {
  const [organisms, setOrganisms] = useState<OrganismInfo[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [proteins, setProteins] = useState<ProteinInfo[]>([]);
  const [selectedProtein, setSelectedProtein] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProteinDetail | null>(null);
  const [loading, setLoading] = useState({ organisms: true, proteins: false, detail: false });
  const [orgSearch, setOrgSearch] = useState('');

  // 1. 종 목록 로드
  useEffect(() => {
    fetch('/api/explorer/organisms')
      .then(r => r.json())
      .then(d => setOrganisms(d))
      .catch(() => {})
      .finally(() => setLoading(l => ({ ...l, organisms: false })));
  }, []);

  // 2. 종 선택 → 단백질 로드
  async function selectOrganism(org: string) {
    setSelectedOrg(org);
    setSelectedProtein(null);
    setDetail(null);
    setLoading(l => ({ ...l, proteins: true }));
    try {
      const res = await fetch(`/api/explorer/proteins?organism=${encodeURIComponent(org)}`);
      setProteins(await res.json());
    } catch { setProteins([]); }
    setLoading(l => ({ ...l, proteins: false }));
  }

  // 3. 단백질 선택 → 상세 로드
  async function selectProtein(id: number) {
    setSelectedProtein(id);
    setLoading(l => ({ ...l, detail: true }));
    try {
      const res = await fetch(`/api/explorer/detail?protein_id=${id}`);
      setDetail(await res.json());
    } catch { setDetail(null); }
    setLoading(l => ({ ...l, detail: false }));
  }

  const filteredOrganisms = orgSearch
    ? organisms.filter(o => o.organism.toLowerCase().includes(orgSearch.toLowerCase()))
    : organisms;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Data Explorer</h2>
        <p className="text-muted-foreground">종 → 단백질 → 실험 데이터를 계층적으로 탐색합니다.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Column 1: Organisms */}
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Organisms ({organisms.length})</CardTitle>
            <input
              value={orgSearch}
              onChange={e => setOrgSearch(e.target.value)}
              placeholder="종 검색..."
              className="mt-1 w-full rounded border bg-muted/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto p-0">
            {loading.organisms ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="divide-y">
                {filteredOrganisms.slice(0, 100).map(o => (
                  <button
                    key={o.organism}
                    onClick={() => selectOrganism(o.organism)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex justify-between items-center ${selectedOrg === o.organism ? 'bg-primary/10 font-medium' : ''}`}
                  >
                    <span className="italic truncate flex-1">{o.organism}</span>
                    <Badge variant="secondary" className="text-[9px] ml-1 shrink-0">{o.count.toLocaleString()}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 2: Proteins */}
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedOrg ? <span className="italic">{selectedOrg.slice(0, 25)}</span> : 'Proteins'}
              {proteins.length > 0 && <span className="text-muted-foreground font-normal ml-1">({proteins.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto p-0">
            {loading.proteins ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !selectedOrg ? (
              <p className="text-xs text-muted-foreground p-3">← 종을 선택하세요</p>
            ) : proteins.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">데이터 없음</p>
            ) : (
              <div className="divide-y">
                {proteins.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selectProtein(p.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 ${selectedProtein === p.id ? 'bg-primary/10 font-medium' : ''}`}
                  >
                    <div className="font-medium">{p.abbreviation || p.gene_name || p.full_name?.slice(0, 30)}</div>
                    {p.gene_name && p.abbreviation !== p.gene_name && (
                      <div className="text-[10px] text-muted-foreground">{p.gene_name}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 3: Detail */}
        <Card className="md:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedProtein ? (
                <Link href={`/proteins/${selectedProtein}`} className="text-primary hover:underline">
                  {proteins.find(p => p.id === selectedProtein)?.abbreviation || proteins.find(p => p.id === selectedProtein)?.full_name?.slice(0, 40)}
                  <ChevronRight className="inline h-3 w-3 ml-1" />
                </Link>
              ) : 'Data Overview'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading.detail ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !selectedProtein ? (
              <p className="text-xs text-muted-foreground">← 단백질을 선택하세요</p>
            ) : !detail ? (
              <p className="text-xs text-muted-foreground">데이터 없음</p>
            ) : (
              <div className="space-y-4">
                {/* Pipeline bars */}
                <div className="space-y-1.5">
                  {PIPELINE.map(p => {
                    const val = detail[p.key as keyof ProteinDetail] ?? 0;
                    return (
                      <div key={p.key} className="flex items-center gap-2">
                        <div className="w-12 text-[10px] text-right text-muted-foreground">{p.label}</div>
                        <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden relative">
                          {val > 0 && (
                            <div className={`h-full ${p.color} rounded-sm`} style={{ width: `${Math.min(val * 2, 100)}%` }} />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                            {val > 0 ? val.toLocaleString() : '-'}
                          </span>
                        </div>
                        {val > 0 && (
                          <div className="h-3 w-3 rounded-full bg-green-500" title="데이터 있음" />
                        )}
                        {val === 0 && (
                          <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" title="미시도" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick links */}
                <div className="flex flex-wrap gap-1 pt-2 border-t">
                  <Link href={`/proteins/${selectedProtein}`}>
                    <Button variant="outline" size="sm" className="text-[10px] h-7">상세 보기</Button>
                  </Link>
                  <Link href={`/copilot`}>
                    <Button variant="outline" size="sm" className="text-[10px] h-7">AI Copilot</Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
