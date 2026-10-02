'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Download, Loader2, Check, AlertCircle,
  Sparkles, CheckCircle2, Plus, Trash2, RefreshCw,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface FeaturedProtein {
  pdbId: string;
  name: string;
  organism: string;
  method: string;
  resolution: number;
  description: string;
  imported: boolean;
}

interface SearchResult {
  pdbId: string;
  title: string;
  method: string;
  resolution: number | null;
}

interface Suggestion {
  pdbId: string;
  name: string;
  organism: string | null;
  method: string;
  resolution: number | null;
  description: string;
  category: string;
}

interface PreviewData {
  pdb: any;
  uniprot: any;
  willCreate: {
    protein: any;
    construct: any;
    crystallization: any;
    expression: any;
    structure: any;
  };
}

export function PdbImportClient() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [selectedPdbId, setSelectedPdbId] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [featured, setFeatured] = useState<FeaturedProtein[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchImporting, setBatchImporting] = useState(false);
  const [newPdbId, setNewPdbId] = useState('');
  const [addingFeatured, setAddingFeatured] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const fetchFeatured = useCallback(async () => {
    try {
      const res = await fetch('/api/pdb-import/featured');
      const json = await res.json();
      setFeatured(json.results || []);
    } catch {
      // 실패해도 검색 기능은 사용 가능
    } finally {
      setFeaturedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatured();
  }, [fetchFeatured]);

  const notImported = featured.filter((p) => !p.imported);
  const imported = featured.filter((p) => p.imported);

  function toggleSelect(pdbId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pdbId)) next.delete(pdbId);
      else next.add(pdbId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === notImported.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notImported.map((p) => p.pdbId)));
    }
  }

  async function handleBatchImport() {
    if (selectedIds.size === 0) return;
    setBatchImporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/pdb-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      setMessage({ type: 'success', text: json.message });
      setSelectedIds(new Set());
      fetchFeatured();
    } catch {
      setMessage({ type: 'error', text: '일괄 등록 실패' });
    } finally {
      setBatchImporting(false);
    }
  }

  async function handleAddFeatured() {
    if (!newPdbId.trim()) return;
    setAddingFeatured(true);
    setMessage(null);
    try {
      const res = await fetch('/api/pdb-import/featured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbId: newPdbId.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error });
      } else {
        setMessage({ type: 'success', text: json.message });
        setNewPdbId('');
        fetchFeatured();
      }
    } catch {
      setMessage({ type: 'error', text: '추천 목록 추가 실패' });
    } finally {
      setAddingFeatured(false);
    }
  }

  async function handleSuggest() {
    setSuggestLoading(true);
    try {
      const res = await fetch('/api/pdb-import/featured/suggest?count=6');
      const json = await res.json();
      setSuggestions(json.suggestions || []);
    } catch {
      setMessage({ type: 'error', text: '추천 불러오기 실패' });
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleAddSuggestion(s: Suggestion) {
    try {
      const res = await fetch('/api/pdb-import/featured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbId: s.pdbId }),
      });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((p) => p.pdbId !== s.pdbId));
        fetchFeatured();
      }
    } catch {
      // ignore
    }
  }

  async function handleRemoveFeatured(pdbId: string) {
    try {
      await fetch('/api/pdb-import/featured', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbId }),
      });
      fetchFeatured();
    } catch {
      // ignore
    }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setMessage(null);
    setPreview(null);
    setSearchResults([]);

    const isPdbId = /^[0-9][A-Za-z0-9]{3}$/.test(query.trim());

    if (isPdbId) {
      await loadPreview(query.trim().toUpperCase());
    } else {
      try {
        const res = await fetch(`/api/pdb-import?q=${encodeURIComponent(query.trim())}&limit=10`);
        const json = await res.json();
        setSearchResults(json.results || []);
        if (json.results?.length === 0) {
          setMessage({ type: 'error', text: 'No results found' });
        }
      } catch {
        setMessage({ type: 'error', text: 'Search failed' });
      }
    }
    setLoading(false);
  }

  async function loadPreview(pdbId: string) {
    setLoading(true);
    setSelectedPdbId(pdbId);
    setMessage(null);
    try {
      const res = await fetch(`/api/pdb-import?pdb_id=${pdbId}`);
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error });
        return;
      }
      setPreview(json);
      setSearchResults([]);
    } catch {
      setMessage({ type: 'error', text: 'Failed to fetch PDB data' });
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedPdbId) return;
    setImporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/pdb-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbId: selectedPdbId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error });
        return;
      }
      setMessage({ type: 'success', text: json.message });
      setPreview(null);
      fetchFeatured();
    } catch {
      setMessage({ type: 'error', text: 'Import failed' });
    } finally {
      setImporting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="PDB ID (예: 1LYZ) 또는 단백질명 (예: lysozyme)"
          className="max-w-md"
        />
        <Button onClick={handleSearch} disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-1.5">Search</span>
        </Button>
      </div>

      {/* Status message */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
        }`}>
          {message.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Featured proteins with tabs */}
      {!preview && searchResults.length === 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                추천 단백질
              </CardTitle>
              {/* 추천 추가 */}
              <div className="flex items-center gap-2">
                <Input
                  value={newPdbId}
                  onChange={(e) => setNewPdbId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddFeatured(); }}
                  placeholder="PDB ID 추가"
                  className="w-32 h-8 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddFeatured}
                  disabled={addingFeatured || !newPdbId.trim()}
                >
                  {addingFeatured ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  <span className="ml-1">추가</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {featuredLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                목록 불러오는 중...
              </div>
            ) : (
              <Tabs defaultValue="not-imported">
                <div className="flex items-center justify-between mb-3">
                  <TabsList>
                    <TabsTrigger value="not-imported">
                      미등록 ({notImported.length})
                    </TabsTrigger>
                    <TabsTrigger value="imported">
                      등록됨 ({imported.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* 미등록 탭 */}
                <TabsContent value="not-imported">
                  {notImported.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      모든 추천 단백질이 등록되었습니다
                    </div>
                  ) : (
                    <>
                      {/* 일괄 등록 액션바 */}
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === notImported.length && notImported.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded"
                          />
                          전체 선택 ({selectedIds.size}/{notImported.length})
                        </label>
                        {selectedIds.size > 0 && (
                          <Button
                            size="sm"
                            onClick={handleBatchImport}
                            disabled={batchImporting}
                          >
                            {batchImporting ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                            ) : (
                              <Download className="h-3 w-3 mr-1.5" />
                            )}
                            {batchImporting ? '등록 중...' : `선택 항목 일괄 등록 (${selectedIds.size})`}
                          </Button>
                        )}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]" />
                            <TableHead className="w-[80px]">PDB ID</TableHead>
                            <TableHead>단백질</TableHead>
                            <TableHead className="hidden md:table-cell">유기체</TableHead>
                            <TableHead className="hidden lg:table-cell">설명</TableHead>
                            <TableHead className="w-[70px] text-right">해상도</TableHead>
                            <TableHead className="w-[40px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {notImported.map((p) => (
                            <TableRow
                              key={p.pdbId}
                              className="cursor-pointer hover:bg-accent/50"
                              onClick={() => { setQuery(p.pdbId); loadPreview(p.pdbId); }}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(p.pdbId)}
                                  onChange={() => toggleSelect(p.pdbId)}
                                  className="rounded"
                                />
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono">{p.pdbId}</Badge>
                              </TableCell>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{p.organism}</TableCell>
                              <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{p.description}</TableCell>
                              <TableCell className="text-right text-sm">{p.resolution} Å</TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleRemoveFeatured(p.pdbId)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  title="추천 목록에서 제거"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* 더 추천받기 */}
                      <div className="mt-4 border-t pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-muted-foreground">
                            PDB에서 새로운 단백질을 찾아 추천 목록에 추가합니다
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSuggest}
                            disabled={suggestLoading}
                          >
                            {suggestLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                            ) : (
                              <RefreshCw className="h-3 w-3 mr-1.5" />
                            )}
                            {suggestLoading ? '검색 중...' : '더 추천받기'}
                          </Button>
                        </div>

                        {suggestions.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {suggestions.map((s) => (
                              <div
                                key={s.pdbId}
                                className="flex items-start justify-between p-3 rounded-lg border hover:bg-accent/30 transition-colors"
                              >
                                <div className="flex-1 min-w-0 mr-2">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="font-mono shrink-0">{s.pdbId}</Badge>
                                    <Badge variant="secondary" className="text-xs shrink-0">{s.category}</Badge>
                                  </div>
                                  <p className="text-sm font-medium truncate">{s.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {s.organism}{s.resolution ? ` · ${s.resolution} Å` : ''}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleAddSuggestion(s)}
                                  className="shrink-0"
                                  title="추천 목록에 추가"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* 등록됨 탭 */}
                <TabsContent value="imported">
                  {imported.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      아직 등록된 단백질이 없습니다
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">PDB ID</TableHead>
                          <TableHead>단백질</TableHead>
                          <TableHead className="hidden md:table-cell">유기체</TableHead>
                          <TableHead className="hidden lg:table-cell">설명</TableHead>
                          <TableHead className="w-[70px] text-right">해상도</TableHead>
                          <TableHead className="w-[80px] text-center">상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {imported.map((p) => (
                          <TableRow key={p.pdbId} className="opacity-70">
                            <TableCell>
                              <Badge variant="outline" className="font-mono">{p.pdbId}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{p.organism}</TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{p.description}</TableCell>
                            <TableCell className="text-right text-sm">{p.resolution} Å</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                등록됨
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search results */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Search Results</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {searchResults.map((r) => (
                <div
                  key={r.pdbId}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => loadPreview(r.pdbId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono shrink-0">{r.pdbId}</Badge>
                      <span className="text-sm truncate">{r.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <Badge variant="secondary">{r.method}</Badge>
                    {r.resolution && <span className="text-xs text-muted-foreground">{r.resolution} A</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge className="font-mono text-base">{preview.pdb.pdbId}</Badge>
                {preview.pdb.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <PreviewSection title="Protein" items={[
                  ['Name', preview.willCreate.protein.full_name],
                  ['Gene', preview.willCreate.protein.gene_name],
                  ['Organism', preview.willCreate.protein.organism],
                ]} />
                <PreviewSection title="Construct" items={[
                  ['Expression System', preview.willCreate.construct.expression_system],
                  ['Sequence Length', preview.willCreate.construct.seq_final ? `${preview.willCreate.construct.seq_final.length} aa` : null],
                ]} />
                <PreviewSection title="Structure" items={[
                  ['Method', preview.willCreate.structure.method],
                  ['Resolution', preview.willCreate.structure.resolution ? `${preview.willCreate.structure.resolution} A` : null],
                  ['PDB ID', preview.willCreate.structure.pdb_id],
                ]} />
                {preview.willCreate.crystallization && (
                  <PreviewSection title="Crystallization" items={[
                    ['pH', preview.willCreate.crystallization.ph],
                    ['Temperature', preview.willCreate.crystallization.temperature != null ? `${preview.willCreate.crystallization.temperature}°C` : null],
                    ['Outcome', preview.willCreate.crystallization.outcome],
                    ['Details', preview.willCreate.crystallization.condition_detail],
                  ]} />
                )}
                {preview.willCreate.expression && (
                  <PreviewSection title="Expression" items={[
                    ['Host', preview.willCreate.expression.host],
                    ['Strain', preview.willCreate.expression.strain],
                  ]} />
                )}
                {preview.uniprot && (
                  <PreviewSection title="UniProt" items={[
                    ['Accession', preview.uniprot.accession],
                    ['Function', preview.uniprot.function ? preview.uniprot.function.slice(0, 100) + '...' : null],
                  ]} />
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleImport} disabled={importing} size="lg">
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              {importing ? 'Importing...' : `Import ${selectedPdbId}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewSection({ title, items }: { title: string; items: [string, any][] }) {
  const filtered = items.filter(([, v]) => v != null && v !== '');
  if (filtered.length === 0) return null;

  return (
    <div className="rounded-lg border p-3">
      <h4 className="font-medium text-sm mb-2">{title}</h4>
      <dl className="space-y-1">
        {filtered.map(([label, value]) => (
          <div key={label} className="flex gap-2 text-sm">
            <dt className="text-muted-foreground shrink-0">{label}:</dt>
            <dd className="break-all">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
