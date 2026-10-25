'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Download, FlaskConical, Search } from 'lucide-react';

// --- Types matching server ScreenDesign ---

interface ScreenCondition {
  well: string;
  precipitant_type: string;
  precipitant_conc: number;
  precipitant_unit: string;
  buffer_type: string;
  ph: number;
  temperature: number;
  additive?: string;
  expected_success_rate: number;
  source: string;
}

interface ScreenDesign {
  protein_name: string;
  organism: string;
  total_conditions: number;
  expected_success_rate: number;
  conditions: ScreenCondition[];
  analysis: {
    based_on_proteins: number;
    based_on_trials: number;
    top_precipitant: string;
    optimal_ph_range: string;
    optimal_temp: number;
  };
}

interface ProteinSuggestion {
  id: number;
  full_name: string;
  abbreviation: string | null;
  organism: string;
}

// --- Color helpers ---

function successRateColor(rate: number): string {
  if (rate >= 40) return 'bg-green-500 text-white';
  if (rate >= 25) return 'bg-green-400 text-white';
  if (rate >= 15) return 'bg-yellow-400 text-gray-900';
  if (rate >= 5) return 'bg-orange-400 text-white';
  return 'bg-red-400 text-white';
}

function successRateBg(rate: number): string {
  if (rate >= 40) return 'bg-green-100 border-green-300';
  if (rate >= 25) return 'bg-green-50 border-green-200';
  if (rate >= 15) return 'bg-yellow-50 border-yellow-200';
  if (rate >= 5) return 'bg-orange-50 border-orange-200';
  return 'bg-red-50 border-red-200';
}

// --- CSV Export ---

function exportCSV(design: ScreenDesign) {
  const headers = [
    'Well',
    'Precipitant',
    'Concentration',
    'Unit',
    'Buffer',
    'pH',
    'Temperature (C)',
    'Additive',
    'Expected Success Rate (%)',
    'Source',
  ];
  const rows = design.conditions.map((c) => [
    c.well,
    c.precipitant_type,
    c.precipitant_conc,
    c.precipitant_unit,
    c.buffer_type,
    c.ph,
    c.temperature,
    c.additive || '',
    c.expected_success_rate,
    c.source,
  ]);

  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `screen-${design.protein_name.replace(/\s+/g, '_')}-24well.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Components ---

function PlateVisualization({ conditions }: { conditions: ScreenCondition[] }) {
  const [hoveredWell, setHoveredWell] = useState<string | null>(null);
  const conditionMap = new Map(conditions.map((c) => [c.well, c]));

  const rows = ['A', 'B', 'C', 'D'];
  const cols = [1, 2, 3, 4, 5, 6];

  const hoveredCondition = hoveredWell ? conditionMap.get(hoveredWell) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1.5 max-w-lg">
        {/* Header row */}
        <div />
        {cols.map((c) => (
          <div key={c} className="text-center text-xs font-medium text-muted-foreground">
            {c}
          </div>
        ))}

        {/* Wells */}
        {rows.map((row) => (
          <>
            <div
              key={`label-${row}`}
              className="flex items-center justify-center text-xs font-medium text-muted-foreground"
            >
              {row}
            </div>
            {cols.map((col) => {
              const well = `${row}${col}`;
              const cond = conditionMap.get(well);
              const rate = cond?.expected_success_rate ?? 0;
              return (
                <div
                  key={well}
                  className={`aspect-square rounded-lg border-2 flex items-center justify-center text-[10px] font-bold cursor-pointer transition-all hover:scale-110 hover:shadow-md ${successRateColor(rate)} ${hoveredWell === well ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                  onMouseEnter={() => setHoveredWell(well)}
                  onMouseLeave={() => setHoveredWell(null)}
                  title={cond ? `${well}: ${cond.precipitant_type} (${rate}%)` : well}
                >
                  {Math.round(rate)}%
                </div>
              );
            })}
          </>
        ))}
      </div>

      {/* Hover detail */}
      {hoveredCondition && (
        <div className="text-sm p-3 rounded-lg border bg-muted/50">
          <span className="font-semibold">{hoveredCondition.well}</span>:{' '}
          {hoveredCondition.precipitant_type} {hoveredCondition.precipitant_conc}
          {hoveredCondition.precipitant_unit}, pH {hoveredCondition.ph},{' '}
          {hoveredCondition.temperature}C
          {hoveredCondition.additive && ` + ${hoveredCondition.additive}`}
          <span className="ml-2 text-muted-foreground">({hoveredCondition.source})</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 text-xs items-center flex-wrap">
        <span className="text-muted-foreground">Success rate:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-500 inline-block" /> 40%+
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-400 inline-block" /> 25-40%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-400 inline-block" /> 15-25%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-400 inline-block" /> 5-15%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-400 inline-block" /> &lt;5%
        </span>
      </div>
    </div>
  );
}

export default function ScreenDesignPage() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ProteinSuggestion[]>([]);
  const [selectedProtein, setSelectedProtein] = useState<ProteinSuggestion | null>(null);
  const [design, setDesign] = useState<ScreenDesign | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounced protein search
  const searchProteins = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/proteins?search=${encodeURIComponent(term)}&limit=10`
      );
      if (res.ok) {
        const body = await res.json();
        // /api/proteins returns { data: [...], ... }
        const items = Array.isArray(body) ? body : (body.data ?? []);
        setSuggestions(
          items.map((p: Record<string, unknown>) => ({
            id: p.id as number,
            full_name: (p.full_name as string) || '',
            abbreviation: (p.abbreviation as string) || null,
            organism: (p.organism as string) || '',
          }))
        );
      }
    } catch {
      // ignore
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedProtein(null);
    setShowSuggestions(true);
    // Simple debounce via timeout
    const timer = setTimeout(() => searchProteins(value), 300);
    return () => clearTimeout(timer);
  };

  const selectProtein = (p: ProteinSuggestion) => {
    setSelectedProtein(p);
    setQuery(p.abbreviation || p.full_name);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const generateScreen = async () => {
    if (!selectedProtein) return;
    setLoading(true);
    setError(null);
    setDesign(null);

    try {
      const res = await fetch(`/api/screen-design?protein_id=${selectedProtein.id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate screen');
      } else {
        setDesign(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6" />
          Custom Screen Designer
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate an optimized 24-condition crystallization screen based on DB analysis of similar
          proteins.
        </p>
      </div>

      {/* Search + Generate */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">Select Protein</CardTitle>
        </CardHeader>
        <CardContent className="overflow-visible">
          <div className="flex gap-3 items-start">
            <div className="relative flex-1" style={{ zIndex: 50 }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by protein name, gene, or abbreviation..."
                  value={query}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="pl-9"
                />
                {searchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Autocomplete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-[100] w-full mt-1 bg-white dark:bg-gray-900 border-2 border-primary/30 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                  {suggestions.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-sm"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectProtein(p)}
                    >
                      <div className="font-medium">
                        {p.abbreviation || p.full_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.organism} | ID: {p.id}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedProtein && (
                <div className="mt-2 text-sm">
                  Selected:{' '}
                  <Badge variant="outline">
                    {selectedProtein.abbreviation || selectedProtein.full_name}
                  </Badge>{' '}
                  <span className="text-muted-foreground">
                    ({selectedProtein.organism}, ID: {selectedProtein.id})
                  </span>
                </div>
              )}
            </div>

            <Button onClick={generateScreen} disabled={!selectedProtein || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                'Generate Custom Screen'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {design && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground uppercase">Protein</div>
                <div className="text-lg font-bold mt-1">{design.protein_name}</div>
                <div className="text-sm text-muted-foreground">{design.organism}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground uppercase">Expected Success</div>
                <div className="text-2xl font-bold mt-1">{design.expected_success_rate}%</div>
                <div className="text-sm text-muted-foreground">avg across 24 conditions</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground uppercase">Based On</div>
                <div className="text-lg font-bold mt-1">
                  {design.analysis.based_on_trials.toLocaleString()} trials
                </div>
                <div className="text-sm text-muted-foreground">
                  from {design.analysis.based_on_proteins.toLocaleString()} proteins
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground uppercase">Top Precipitant</div>
                <div className="text-lg font-bold mt-1">{design.analysis.top_precipitant}</div>
                <div className="text-sm text-muted-foreground">
                  pH {design.analysis.optimal_ph_range}, {design.analysis.optimal_temp}C
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Plate visualization + Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">24-Well Plate Layout</CardTitle>
              </CardHeader>
              <CardContent>
                <PlateVisualization conditions={design.conditions} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Condition Details</CardTitle>
                <Button variant="outline" size="sm" onClick={() => exportCSV(design)}>
                  <Download className="h-4 w-4 mr-1" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Well</TableHead>
                        <TableHead>Precipitant</TableHead>
                        <TableHead className="w-16">Conc</TableHead>
                        <TableHead className="w-16">pH</TableHead>
                        <TableHead className="w-12">Temp</TableHead>
                        <TableHead className="w-16">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {design.conditions.map((c) => (
                        <TableRow key={c.well} className={successRateBg(c.expected_success_rate)}>
                          <TableCell className="font-mono font-bold">{c.well}</TableCell>
                          <TableCell>
                            <div>{c.precipitant_type}</div>
                            {c.additive && (
                              <div className="text-xs text-muted-foreground">+ {c.additive}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {c.precipitant_conc} {c.precipitant_unit}
                          </TableCell>
                          <TableCell>{c.ph}</TableCell>
                          <TableCell>{c.temperature}C</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={successRateColor(c.expected_success_rate)}
                            >
                              {c.expected_success_rate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
