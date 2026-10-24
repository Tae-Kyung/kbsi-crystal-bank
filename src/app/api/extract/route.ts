import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from '@/lib/llm/extraction-prompt';

export async function POST(request: NextRequest) {
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

  try {
    // Step 1: Find or create reference if DOI provided
    let referenceId: number | null = null;
    if (doi) {
      const existing = await queryOne<{ id: number }>(
        'SELECT id FROM kbsi_reference WHERE doi = $1',
        [doi]
      );

      if (existing) {
        referenceId = existing.id;
      } else {
        // Fetch metadata from CrossRef
        try {
          const crossrefRes = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
          if (crossrefRes.ok) {
            const crossrefData = await crossrefRes.json();
            const work = crossrefData.message;
            const newRef = await queryOne<{ id: number }>(
              `INSERT INTO kbsi_reference (title, authors, year, doi, journal)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id`,
              [
                work.title?.[0] || null,
                work.author?.map((a: any) => `${a.given} ${a.family}`).join(', ') || null,
                work['published-print']?.['date-parts']?.[0]?.[0] || work['published-online']?.['date-parts']?.[0]?.[0] || null,
                doi,
                work['container-title']?.[0] || null,
              ]
            );
            if (newRef) referenceId = newRef.id;
          }
        } catch {
          // CrossRef fetch failed -- continue without reference
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

    if (!content) {
      return NextResponse.json({ error: 'Empty response from LLM' }, { status: 502 });
    }

    let extracted: any[];
    try {
      // LLM이 ```json ... ``` 코드블록으로 감싸는 경우 제거
      let jsonStr = (content || '').trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      const parsed = JSON.parse(jsonStr);
      extracted = Array.isArray(parsed) ? parsed : parsed.data || parsed.results || [parsed];
    } catch {
      return NextResponse.json({ error: 'Failed to parse LLM response', raw: content }, { status: 500 });
    }

    // Step 3: Insert into extraction_staging
    const staged = [];
    for (const item of extracted) {
      const row = await queryOne(
        `INSERT INTO kbsi_extraction_staging
         (reference_id, target_table, extracted_payload, source_snippet, extracted_by, model_version, extraction_confidence, review_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          referenceId,
          targetTable,
          JSON.stringify(item),
          item.source_snippet || null,
          'openai',
          'gpt-4o',
          0.8,
          'pending',
        ]
      );
      if (row) staged.push(row);
    }

    return NextResponse.json({
      message: `Extracted ${extracted.length} records, staged for review.`,
      staged,
      reference_id: referenceId,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
