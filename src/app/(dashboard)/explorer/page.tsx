'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface OrganismInfo { organism: string; count: number }
interface ProteinInfo { id: number; full_name: string; abbreviation: string | null; gene_name: string | null }
interface ConstructInfo { id: number; name: string | null; construct_type: string | null; expression_system: string | null; theoretical_mw: number | null }
interface DetailData { expression: number; purification: number; characterization: number; crystallization: number; diffraction: number; structure: number; ligands: number }

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
  const [constructs, setConstructs] = useState<ConstructInfo[]>([]);
  const [selectedConstruct, setSelectedConstruct] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState({ organisms: true, proteins: false, constructs: false, detail: false });
  const [orgSearch, setOrgSearch] = useState('');

  useEffect(() => {
    fetch('/api/explorer/organisms')
      .then(r => r.json()).then(setOrganisms).catch(() => {})
      .finally(() => setLoading(l => ({ ...l, organisms: false })));
  }, []);

  async function selectOrganism(org: string) {
    setSelectedOrg(org);
    setSelectedProtein(null);
    setConstructs([]);
    setSelectedConstruct(null);
    setDetail(null);
    setLoading(l => ({ ...l, proteins: true }));
    try {
      const res = await fetch(`/api/explorer/proteins?organism=${encodeURIComponent(org)}`);
      setProteins(await res.json());
    } catch { setProteins([]); }
    setLoading(l => ({ ...l, proteins: false }));
  }

  async function selectProtein(id: number) {
    setSelectedProtein(id);
    setSelectedConstruct(null);
    setDetail(null);
    setLoading(l => ({ ...l, constructs: true }));
    try {
      const res = await fetch(`/api/explorer/constructs?protein_id=${id}`);
      setConstructs(await res.json());
    } catch { setConstructs([]); }
    setLoading(l => ({ ...l, constructs: false }));
  }

  async function selectConstruct(id: number) {
    setSelectedConstruct(id);
    setLoading(l => ({ ...l, detail: true }));
    try {
      const res = await fetch(`/api/explorer/detail?construct_id=${id}`);
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
        <p className="text-muted-foreground">종 → 단백질 → Construct → 실험 데이터</p>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <span className={selectedOrg ? 'text-primary cursor-pointer' : 'font-medium'} onClick={() => { setSelectedOrg(null); setProteins([]); setConstructs([]); setDetail(null); }}>Organisms</span>
        {selectedOrg && <><span>›</span><span className={selectedProtein ? 'text-primary cursor-pointer' : 'font-medium'} onClick={() => { setSelectedProtein(null); setConstructs([]); setDetail(null); }}>{selectedOrg.slice(0, 25)}</span></>}
        {selectedProtein && <><span>›</span><span className={selectedConstruct ? 'text-primary cursor-pointer' : 'font-medium'}>{proteins.find(p => p.id === selectedProtein)?.abbreviation || '...'}</span></>}
        {selectedConstruct && <><span>›</span><span className="font-medium">{constructs.find(c => c.id === selectedConstruct)?.name?.slice(0, 20) || `#${selectedConstruct}`}</span></>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Col 1: Organisms */}
        <Card className="md:col-span-2">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs">Organisms ({organisms.length})</CardTitle>
            <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="검색..." className="mt-1 w-full rounded border bg-muted/50 px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </CardHeader>
          <CardContent className="max-h-[550px] overflow-y-auto p-0">
            {loading.organisms ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div> : (
              <div className="divide-y">
                {filteredOrganisms.slice(0, 100).map(o => (
                  <button key={o.organism} onClick={() => selectOrganism(o.organism)}
                    className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-muted/50 flex justify-between ${selectedOrg === o.organism ? 'bg-primary/10 font-medium' : ''}`}>
                    <span className="italic truncate flex-1">{o.organism}</span>
                    <Badge variant="secondary" className="text-[8px] ml-1 shrink-0">{o.count}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Col 2: Proteins */}
        <Card className="md:col-span-3">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs">
              Proteins {proteins.length > 0 && <span className="text-muted-foreground font-normal">({proteins.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[550px] overflow-y-auto p-0">
            {loading.proteins ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div> :
              !selectedOrg ? <p className="text-[10px] text-muted-foreground p-2">← 종 선택</p> :
              proteins.length === 0 ? <p className="text-[10px] text-muted-foreground p-2">없음</p> : (
              <div className="divide-y">
                {proteins.map(p => (
                  <button key={p.id} onClick={() => selectProtein(p.id)}
                    className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-muted/50 ${selectedProtein === p.id ? 'bg-primary/10 font-medium' : ''}`}>
                    <div className="font-medium">{p.abbreviation || p.gene_name || p.full_name?.slice(0, 25)}</div>
                    {p.gene_name && p.abbreviation !== p.gene_name && <div className="text-[9px] text-muted-foreground">{p.gene_name}</div>}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Col 3: Constructs */}
        <Card className="md:col-span-3">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs">
              Constructs {constructs.length > 0 && <span className="text-muted-foreground font-normal">({constructs.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[550px] overflow-y-auto p-0">
            {loading.constructs ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div> :
              !selectedProtein ? <p className="text-[10px] text-muted-foreground p-2">← 단백질 선택</p> :
              constructs.length === 0 ? <p className="text-[10px] text-muted-foreground p-2">없음</p> : (
              <div className="divide-y">
                {constructs.map(c => (
                  <button key={c.id} onClick={() => selectConstruct(c.id)}
                    className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-muted/50 ${selectedConstruct === c.id ? 'bg-primary/10 font-medium' : ''}`}>
                    <div className="font-medium truncate">{c.name || `#${c.id}`}</div>
                    <div className="flex gap-1 mt-0.5">
                      {c.construct_type && c.construct_type !== 'full-length' && <Badge variant="outline" className="text-[8px] px-1">{c.construct_type}</Badge>}
                      {c.expression_system && <span className="text-[8px] text-muted-foreground truncate">{c.expression_system.slice(0, 15)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Col 4: Pipeline Detail */}
        <Card className="md:col-span-4">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs">
              {selectedConstruct ? (
                <Link href={`/constructs/${selectedConstruct}`} className="text-primary hover:underline">
                  {constructs.find(c => c.id === selectedConstruct)?.name?.slice(0, 25) || `Construct #${selectedConstruct}`} →
                </Link>
              ) : 'Experiment Data'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading.detail ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div> :
              !selectedConstruct ? <p className="text-[10px] text-muted-foreground">← Construct 선택</p> :
              !detail ? <p className="text-[10px] text-muted-foreground">없음</p> : (
              <div className="space-y-4">
                <div className="space-y-1">
                  {PIPELINE.map(p => {
                    const val = detail[p.key as keyof DetailData] ?? 0;
                    return (
                      <div key={p.key} className="flex items-center gap-2">
                        <div className="w-12 text-[10px] text-right text-muted-foreground">{p.label}</div>
                        <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden relative">
                          {val > 0 && <div className={`h-full ${p.color} rounded-sm`} style={{ width: `${Math.min(val * 3, 100)}%` }} />}
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{val > 0 ? val.toLocaleString() : '-'}</span>
                        </div>
                        <div className={`h-3 w-3 rounded-full ${val > 0 ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      </div>
                    );
                  })}
                </div>
                {/* Construct info */}
                {selectedConstruct && (() => {
                  const c = constructs.find(cc => cc.id === selectedConstruct);
                  return c ? (
                    <div className="text-[10px] space-y-1 border-t pt-2 text-muted-foreground">
                      {c.construct_type && <div>Type: <span className="text-foreground">{c.construct_type}</span></div>}
                      {c.expression_system && <div>Host: <span className="text-foreground">{c.expression_system}</span></div>}
                      {c.theoretical_mw && <div>MW: <span className="text-foreground">{(c.theoretical_mw / 1000).toFixed(1)} kDa</span></div>}
                    </div>
                  ) : null;
                })()}
                <div className="flex gap-1 pt-1">
                  <Link href={`/constructs/${selectedConstruct}`}><Button variant="outline" size="sm" className="text-[10px] h-6">상세</Button></Link>
                  {selectedProtein && <Link href={`/proteins/${selectedProtein}`}><Button variant="outline" size="sm" className="text-[10px] h-6">Protein</Button></Link>}
                  <Link href="/copilot"><Button variant="outline" size="sm" className="text-[10px] h-6">Copilot</Button></Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
