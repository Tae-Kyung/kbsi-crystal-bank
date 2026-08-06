import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from '@/lib/llm/extraction-prompt';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const formData = await request.formData();
  const text = formData.get('text') as string | null;
  const doi = formData.get('doi') as string | null;
  const targetTable = (formData.get('target_table') as string) || 'kbsi_expression';

  if (!text) {
    return NextResponse.json({ error: 'text field is required' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  // Step 1: Find or create reference if DOI provided
  let referenceId: number | null = null;
  if (doi) {
    const { data: existing } = await supabase
      .from('kbsi_reference')
      .select('id')
      .eq('doi', doi)
      .maybeSingle();

    if (existing) {
      referenceId = (existing as any).id;
    } else {
      // Fetch metadata from CrossRef
      try {
        const crossrefRes = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
        if (crossrefRes.ok) {
          const crossrefData = await crossrefRes.json();
          const work = crossrefData.message;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newRef } = await (supabase.from('kbsi_reference') as any)
            .insert({
              title: work.title?.[0] || null,
              authors: work.author?.map((a: any) => `${a.given} ${a.family}`).join(', ') || null,
              year: work['published-print']?.['date-parts']?.[0]?.[0] || work['published-online']?.['date-parts']?.[0]?.[0] || null,
              doi,
              journal: work['container-title']?.[0] || null,
            })
            .select('id')
            .single();
          if (newRef) referenceId = newRef.id;
        }
      } catch {
        // CrossRef fetch failed — continue without reference
      }
    }
  }

  // Step 2: Call OpenAI API
  const prompt = buildExtractionPrompt(text, targetTable);

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return NextResponse.json({ error: 'OpenAI API error', details: err }, { status: 502 });
  }

  const openaiData = await openaiRes.json();
  const content = openaiData.choices?.[0]?.message?.content;

  let extracted: any[];
  try {
    const parsed = JSON.parse(content);
    extracted = Array.isArray(parsed) ? parsed : parsed.data || parsed.results || [parsed];
  } catch {
    return NextResponse.json({ error: 'Failed to parse LLM response', raw: content }, { status: 500 });
  }

  // Step 3: Insert into extraction_staging
  const stagingRows = extracted.map((item: any) => ({
    reference_id: referenceId,
    target_table: targetTable,
    extracted_payload: item,
    source_snippet: item.source_snippet || null,
    extracted_by: 'openai',
    model_version: 'gpt-4o',
    extraction_confidence: 0.8,
    review_status: 'pending' as const,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staged, error } = await (supabase.from('kbsi_extraction_staging') as any)
    .insert(stagingRows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: `Extracted ${extracted.length} records, staged for review.`,
    staged,
    reference_id: referenceId,
  }, { status: 201 });
}
