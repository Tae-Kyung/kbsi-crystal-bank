'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface EnrichRecord {
  id: number;
  conditionDetail: string;
  proteinName: string;
  constructName: string;
  currentFields: {
    ph: number | null;
    temperature: number | null;
    precipitant_type: string | null;
    buffer_type: string | null;
    salt_type: string | null;
  };
}

interface EnrichResult {
  id: number;
  success: boolean;
  parsed?: Record<string, any>;
  error?: string;
}

export function ConditionEnricher() {
  const [records, setRecords] = useState<EnrichRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [results, setResults] = useState<EnrichResult[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [stats, setStats] = useState<{ total: number; needsParsing: number; alreadyParsed: number } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [fetched, setFetched] = useState(false);

  async function fetchRecords() {
    setLoading(true);
    setMessage(null);
    setResults([]);
    try {
      const res = await fetch('/api/pdb-import/enrich');
      const json = await res.json();
      setRecords(json.records || []);
      setStats({ total: json.total, needsParsing: json.needsParsing, alreadyParsed: json.alreadyParsed });
      setFetched(true);
      if (json.needsParsing === 0) {
        setMessage({ type: 'success', text: '모든 결정화 조건이 이미 파싱되었습니다' });
      }
    } catch {
      setMessage({ type: 'error', text: '데이터 조회 실패' });
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrichAll() {
    setEnriching(true);
    setMessage(null);
    setResults([]);
    try {
      const res = await fetch('/api/pdb-import/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const json = await res.json();
      setResults(json.results || []);
      setMessage({ type: 'success', text: json.message });
      // 완료 후 목록 갱신
      fetchRecords();
    } catch {
      setMessage({ type: 'error', text: 'LLM 파싱 실패' });
    } finally {
      setEnriching(false);
    }
  }

  async function handleEnrichSingle(id: number) {
    setEnriching(true);
    setMessage(null);
    try {
      const res = await fetch('/api/pdb-import/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      const json = await res.json();
      setResults((prev) => [...prev, ...(json.results || [])]);
      setMessage({ type: 'success', text: json.message });
      fetchRecords();
    } catch {
      setMessage({ type: 'error', text: '파싱 실패' });
    } finally {
      setEnriching(false);
    }
  }

  const getResultForId = (id: number) => results.find((r) => r.id === id);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            결정화 조건 자동 파싱
          </CardTitle>
          <div className="flex items-center gap-2">
            {fetched && records.length > 0 && (
              <Button
                size="sm"
                onClick={handleEnrichAll}
                disabled={enriching}
              >
                {enriching ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <Wand2 className="h-3 w-3 mr-1.5" />
                )}
                {enriching ? 'AI 파싱 중...' : `전체 파싱 (${records.length}건)`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={fetchRecords} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
              {fetched ? '새로고침' : '조회'}
            </Button>
          </div>
        </div>
        {stats && (
          <p className="text-sm text-muted-foreground mt-1">
            전체 {stats.total}건 · 파싱 완료 {stats.alreadyParsed}건 · 파싱 필요 {stats.needsParsing}건
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* Status message */}
        {message && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm mb-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
          }`}>
            {message.type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {/* 파싱 결과 요약 */}
        {results.length > 0 && (
          <div className="mb-4 space-y-2">
            <h4 className="text-sm font-medium">파싱 결과</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {results.map((r) => (
                <div
                  key={r.id}
                  className={`text-xs p-2 rounded border ${
                    r.success ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                  }`}
                >
                  <span className="font-mono">ID {r.id}</span>
                  {r.success && r.parsed ? (
                    <span className="ml-2">
                      {Object.entries(r.parsed).map(([k, v]) => (
                        <Badge key={k} variant="secondary" className="mr-1 mb-0.5 text-xs">
                          {k}: {String(v)}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="ml-2 text-red-600">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 파싱 필요 레코드 테이블 */}
        {!fetched ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            &quot;조회&quot; 버튼을 클릭하여 파싱이 필요한 결정화 조건을 확인하세요
          </div>
        ) : records.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">ID</TableHead>
                <TableHead>단백질</TableHead>
                <TableHead className="hidden lg:table-cell">기존 필드</TableHead>
                <TableHead>조건 원문</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => {
                const result = getResultForId(r.id);
                return (
                  <TableRow key={r.id} className={result?.success ? 'opacity-50' : ''}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium truncate max-w-[150px]">{r.proteinName}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {r.currentFields.ph && `pH ${r.currentFields.ph}`}
                      {r.currentFields.temperature && ` · ${r.currentFields.temperature}°C`}
                    </TableCell>
                    <TableCell>
                      <div
                        className="text-xs text-muted-foreground cursor-pointer"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      >
                        <div className="flex items-center gap-1">
                          {expandedId === r.id ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                          <span className={expandedId === r.id ? '' : 'truncate max-w-[300px]'}>
                            {r.conditionDetail}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {result?.success ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEnrichSingle(r.id)}
                          disabled={enriching}
                          title="이 레코드만 파싱"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
