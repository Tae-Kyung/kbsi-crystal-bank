import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const status = new URL(request.url).searchParams.get('status') || 'pending';

  const { data, error, count } = await supabase
    .from('kbsi_extraction_staging')
    .select('*, kbsi_reference(title, doi, year)', { count: 'exact' })
    .eq('review_status', status)
    .order('extraction_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { ids, action, reviewed_by } = body as {
    ids: number[];
    action: 'approved' | 'rejected';
    reviewed_by: string;
  };

  if (!ids?.length || !action || !reviewed_by) {
    return NextResponse.json({ error: 'ids, action, reviewed_by required' }, { status: 400 });
  }

  // Update staging records
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('kbsi_extraction_staging') as any)
    .update({
      review_status: action,
      reviewed_by,
      reviewed_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If approved, migrate data to main tables
  if (action === 'approved') {
    const { data: approved } = await supabase
      .from('kbsi_extraction_staging')
      .select('*')
      .in('id', ids);

    if (approved) {
      for (const rec of approved) {
        const record = rec as any;
        // TODO: Map extracted_payload fields to the target table and insert
        // The payload is already structured by the LLM prompt to match the table schema
        void record.extracted_payload;
      }
    }
  }

  return NextResponse.json({ message: `${ids.length} records ${action}` });
}
