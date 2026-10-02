'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, Database } from 'lucide-react';

export function MlExportCard() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [includeSynthetic, setIncludeSynthetic] = useState(true);
  const [binaryOutcome, setBinaryOutcome] = useState(true);

  async function fetchPreview() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        include_synthetic: String(includeSynthetic),
        outcome_binary: String(binaryOutcome),
      });
      const res = await fetch(`/api/export/ml-dataset?${params}`);
      const json = await res.json();
      setStats(json.stats);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function handleDownload(format: 'json' | 'csv') {
    const params = new URLSearchParams({
      format,
      include_synthetic: String(includeSynthetic),
      outcome_binary: String(binaryOutcome),
    });
    window.open(`/api/export/ml-dataset?${params}`, '_blank');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4" />
          ML 학습 데이터셋 Export
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          결정화 조건 + 결과를 ML 학습용으로 내보냅니다
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Options */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={includeSynthetic}
                onChange={(e) => setIncludeSynthetic(e.target.checked)}
                className="rounded"
              />
              합성 데이터 포함
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={binaryOutcome}
                onChange={(e) => setBinaryOutcome(e.target.checked)}
                className="rounded"
              />
              이진 분류 (성공/실패)
            </label>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={fetchPreview} disabled={loading}>
              {loading && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              미리보기
            </Button>
            {stats && (
              <div className="flex gap-2 text-sm">
                <Badge variant="secondary">전체 {stats.total}</Badge>
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  성공 {stats.success}
                </Badge>
                <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                  실패 {stats.failure}
                </Badge>
                {includeSynthetic && (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    합성 {stats.synthetic}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Download buttons */}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleDownload('csv')}>
              <Download className="h-3 w-3 mr-1.5" />
              CSV 다운로드
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDownload('json')}>
              <Download className="h-3 w-3 mr-1.5" />
              JSON 다운로드
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
