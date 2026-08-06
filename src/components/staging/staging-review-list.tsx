'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';

interface StagingRecord {
  id: number;
  target_table: string;
  extracted_payload: any;
  source_snippet: string | null;
  extraction_confidence: number | null;
  model_version: string | null;
  extraction_date: string;
  review_status: string;
  kbsi_reference: { title: string | null; doi: string | null; year: number | null } | null;
}

interface StagingReviewListProps {
  data: StagingRecord[];
  showActions?: boolean;
}

export function StagingReviewList({ data, showActions }: StagingReviewListProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === data.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.map((d) => d.id)));
    }
  };

  async function handleAction(action: 'approved' | 'rejected') {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await fetch('/api/staging', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [...selected],
          action,
          reviewed_by: 'admin', // TODO: use actual user
        }),
      });
      setSelected(new Set());
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No records.</p>;
  }

  return (
    <div className="space-y-4 mt-4">
      {showActions && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={selectAll}>
            {selected.size === data.length ? 'Deselect All' : 'Select All'}
          </Button>
          {selected.size > 0 && (
            <>
              <Button size="sm" onClick={() => handleAction('approved')} disabled={loading}>
                <Check className="h-4 w-4 mr-1" />Approve ({selected.size})
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleAction('rejected')} disabled={loading}>
                <X className="h-4 w-4 mr-1" />Reject ({selected.size})
              </Button>
            </>
          )}
        </div>
      )}

      {data.map((record) => {
        const ref = record.kbsi_reference as any;
        return (
          <Card
            key={record.id}
            className={`cursor-pointer transition-colors ${selected.has(record.id) ? 'ring-2 ring-primary' : ''}`}
            onClick={() => showActions && toggle(record.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge>{record.target_table.replace('kbsi_', '')}</Badge>
                    {record.extraction_confidence != null && (
                      <Badge variant="outline">conf: {(record.extraction_confidence * 100).toFixed(0)}%</Badge>
                    )}
                    {record.model_version && (
                      <span className="text-xs text-muted-foreground">{record.model_version}</span>
                    )}
                  </div>

                  {ref && (
                    <p className="text-sm text-muted-foreground truncate">
                      {ref.title} {ref.year && `(${ref.year})`}
                    </p>
                  )}

                  {record.source_snippet && (
                    <p className="text-sm bg-muted p-2 rounded-md italic">
                      &quot;{record.source_snippet.slice(0, 200)}...&quot;
                    </p>
                  )}

                  <pre className="text-xs font-mono bg-muted/50 p-2 rounded-md overflow-x-auto max-h-32">
                    {JSON.stringify(record.extracted_payload, null, 2)}
                  </pre>
                </div>

                <div className="text-xs text-muted-foreground text-right shrink-0">
                  {new Date(record.extraction_date).toLocaleDateString('ko-KR')}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
