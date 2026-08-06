import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StagingReviewList } from '@/components/staging/staging-review-list';
import { ExtractionForm } from '@/components/staging/extraction-form';

export default async function StagingPage() {
  const supabase = await createClient();

  const [pending, approved, rejected] = await Promise.all([
    supabase.from('kbsi_extraction_staging').select('*, kbsi_reference(title, doi, year)', { count: 'exact' }).eq('review_status', 'pending').order('extraction_date', { ascending: false }),
    supabase.from('kbsi_extraction_staging').select('*, kbsi_reference(title, doi, year)', { count: 'exact' }).eq('review_status', 'approved').order('reviewed_at', { ascending: false }).limit(50),
    supabase.from('kbsi_extraction_staging').select('*, kbsi_reference(title, doi, year)', { count: 'exact' }).eq('review_status', 'rejected').order('reviewed_at', { ascending: false }).limit(50),
  ]);

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
