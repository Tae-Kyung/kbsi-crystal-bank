import { NextRequest, NextResponse } from 'next/server';
import { CHAT_TO_FORM_SYSTEM_PROMPT, buildChatToFormPrompt } from '@/lib/llm/chat-to-form-prompt';

export async function POST(request: NextRequest) {
  const { text, experimentType } = await request.json();

  if (!text || typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const validTypes = ['expression', 'crystallization', 'purification', 'characterization', 'structure'];
  if (!validTypes.includes(experimentType)) {
    return NextResponse.json({ error: `Invalid experimentType. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  const prompt = buildChatToFormPrompt(text, experimentType);

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CHAT_TO_FORM_SYSTEM_PROMPT },
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

  try {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const parsed = JSON.parse(jsonStr);
    return NextResponse.json({ data: parsed });
  } catch {
    return NextResponse.json({ error: 'Failed to parse LLM response', raw: content }, { status: 500 });
  }
}
