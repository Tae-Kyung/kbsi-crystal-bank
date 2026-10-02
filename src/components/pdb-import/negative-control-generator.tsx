'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, Check, AlertCircle, Trash2 } from 'lucide-react';

interface Strategy {
  name: string;
  label: string;
  description: string;
}

interface PreviewItem {
  sourceId: number;
  precipitant: string;
  ph: number | null;
  temperature: number | null;
  applicableStrategies: string[];
  count: number;
}

interface Stats {
  successRecords: number;
  existingSynthetic: number;
  totalPossible: number;
  strategies: Strategy[];
  preview: PreviewItem[];
}

export function NegativeControlGenerator() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedStrategies, setSelectedStrategies] = useState<Set<string>>(new Set());
  const [fetched, setFetched] = useState(false);

  async function fetchPreview() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/pdb-import/negative-controls');
      const json = await res.json();
      setStats(json);
      setSelectedStrategies(new Set(json.strategies.map((s: Strategy) => s.name)));
      setFetched(true);
    } catch {
      setMessage({ type: 'error', text: '미리보기 조회 실패' });
    } finally {
      setLoading(false);
    }
  }

  function toggleStrategy(name: string) {
    setSelectedStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/pdb-import/negative-controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies: Array.from(selectedStrategies) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error });
      } else {
        setMessage({ type: 'success', text: json.message });
        fetchPreview();
      }
    } catch {
      setMessage({ type: 'error', text: '생성 실패' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!confirm('합성 데이터를 모두 삭제하시겠습니까?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/pdb-import/negative-controls', { method: 'DELETE' });
      const json = await res.json();
      setMessage({ type: 'success', text: json.message });
      fetchPreview();
    } catch {
      setMessage({ type: 'error', text: '삭제 실패' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Negative Control 생성
          </CardTitle>
          <div className="flex items-center gap-2">
            {stats && stats.existingSynthetic > 0 && (
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Trash2 className="h-3 w-3 mr-1.5" />}
                합성 데이터 삭제 ({stats.existingSynthetic})
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={fetchPreview} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
              {fetched ? '새로고침' : '미리보기'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          성공 조건(diffraction_quality)에서 변형하여 실패 예상 조건을 자동 생성합니다
        </p>
      </CardHeader>
      <CardContent>
        {message && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm mb-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
          }`}>
            {message.type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {!fetched ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            &quot;미리보기&quot; 버튼을 클릭하여 생성 가능한 Negative Control을 확인하세요
          </div>
        ) : stats ? (
          <div className="space-y-4">
            {/* 통계 */}
            <div className="flex gap-4 text-sm">
              <div className="rounded-lg border p-3 flex-1 text-center">
                <div className="text-2xl font-bold">{stats.successRecords}</div>
                <div className="text-muted-foreground">성공 조건</div>
              </div>
              <div className="rounded-lg border p-3 flex-1 text-center">
                <div className="text-2xl font-bold">{stats.totalPossible}</div>
                <div className="text-muted-foreground">생성 가능</div>
              </div>
              <div className="rounded-lg border p-3 flex-1 text-center">
                <div className="text-2xl font-bold">{stats.existingSynthetic}</div>
                <div className="text-muted-foreground">기존 합성</div>
              </div>
            </div>

            {/* 전략 선택 */}
            <div>
              <h4 className="text-sm font-medium mb-2">변형 전략 선택</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {stats.strategies.map((s) => (
                  <label
                    key={s.name}
                    className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedStrategies.has(s.name) ? 'border-primary bg-primary/5' : 'hover:bg-accent/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStrategies.has(s.name)}
                      onChange={() => toggleStrategy(s.name)}
                      className="mt-0.5 rounded"
                    />
                    <div>
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 생성 버튼 */}
            {selectedStrategies.size > 0 && (
              <div className="flex justify-end">
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FlaskConical className="h-4 w-4 mr-2" />
                  )}
                  {generating ? '생성 중...' : `Negative Control 생성 (${selectedStrategies.size}개 전략)`}
                </Button>
              </div>
            )}

            {/* 미리보기 테이블 */}
            <div>
              <h4 className="text-sm font-medium mb-2">소스별 적용 가능 전략</h4>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {stats.preview.map((p) => (
                  <div key={p.sourceId} className="flex items-center justify-between text-sm p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">ID {p.sourceId}</Badge>
                      <span className="text-muted-foreground">{p.precipitant}</span>
                      {p.ph && <span className="text-xs">pH {p.ph}</span>}
                      {p.temperature && <span className="text-xs">{p.temperature}°C</span>}
                    </div>
                    <Badge variant="secondary">{p.count}개 전략</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
