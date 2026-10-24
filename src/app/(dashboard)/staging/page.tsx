import { query, scalar } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StagingReviewList } from '@/components/staging/staging-review-list';
import { ExtractionForm } from '@/components/staging/extraction-form';

export default async function StagingPage() {
  const [pendingData, pendingCount, approvedData, approvedCount, rejectedData, rejectedCount] = await Promise.all([
    query<any>(
      `SELECT s.*, r.title AS ref_title, r.doi AS ref_doi, r.year AS ref_year
       FROM kbsi_extraction_staging s
       LEFT JOIN kbsi_reference r ON r.id = s.reference_id
       WHERE s.review_status = 'pending'
       ORDER BY s.extraction_date DESC`
    ),
    scalar<number>(`SELECT COUNT(*) FROM kbsi_extraction_staging WHERE review_status = 'pending'`),
    query<any>(
      `SELECT s.*, r.title AS ref_title, r.doi AS ref_doi, r.year AS ref_year
       FROM kbsi_extraction_staging s
       LEFT JOIN kbsi_reference r ON r.id = s.reference_id
       WHERE s.review_status = 'approved'
       ORDER BY s.reviewed_at DESC
       LIMIT 50`
    ),
    scalar<number>(`SELECT COUNT(*) FROM kbsi_extraction_staging WHERE review_status = 'approved'`),
    query<any>(
      `SELECT s.*, r.title AS ref_title, r.doi AS ref_doi, r.year AS ref_year
       FROM kbsi_extraction_staging s
       LEFT JOIN kbsi_reference r ON r.id = s.reference_id
       WHERE s.review_status = 'rejected'
       ORDER BY s.reviewed_at DESC
       LIMIT 50`
    ),
    scalar<number>(`SELECT COUNT(*) FROM kbsi_extraction_staging WHERE review_status = 'rejected'`),
  ]);

  // Reshape to match old nested structure (kbsi_reference nested)
  const reshapeRow = (row: any) => ({
    ...row,
    kbsi_reference: row.ref_title ? { title: row.ref_title, doi: row.ref_doi, year: row.ref_year } : null,
  });

  const pending = { data: pendingData.map(reshapeRow), count: Number(pendingCount) };
  const approved = { data: approvedData.map(reshapeRow), count: Number(approvedCount) };
  const rejected = { data: rejectedData.map(reshapeRow), count: Number(rejectedCount) };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Staging Review</h2>
        <ExtractionForm />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending <Badge variant="secondary" className="ml-2">{pending.count ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.count ?? 0})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.count ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <StagingReviewList data={pending.data ?? []} showActions />
        </TabsContent>
        <TabsContent value="approved">
          <StagingReviewList data={approved.data ?? []} />
        </TabsContent>
        <TabsContent value="rejected">
          <StagingReviewList data={rejected.data ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
