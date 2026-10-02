import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const PARSE_SYSTEM_PROMPT = `You are an expert crystallographer. Extract structured crystallization conditions from the given free-text description.
Only extract information explicitly stated — never infer or hallucinate values.
If a value is not mentioned, use null.
For temperature: if given in Kelvin (K), convert to Celsius (subtract 273.15).
For concentration: extract numeric value and unit separately.
Respond ONLY with a valid JSON object. No explanation, no markdown.

Output schema:
{
  "precipitant_type": "string or null (e.g. PEG 3350, PEG 4000, PEG 8000, ammonium sulfate)",
  "precipitant_conc": "number or null",
  "precipitant_unit": "string or null (%, M, mM, % w/v, % v/v)",
  "salt_type": "string or null (e.g. NaCl, ammonium sulfate, MgCl2, sodium citrate)",
  "salt_conc": "number or null",
  "buffer_type": "string or null (e.g. HEPES, Tris, Bis-Tris, MES, sodium acetate, potassium phosphate)",
  "protein_concentration": "number or null (mg/mL)",
  "additive": "string or null (e.g. glycerol, DTT, DMSO, 2-mercaptoethanol)",
  "drop_ratio": "string or null (e.g. 1:1, 2:1)",
  "method": "string or null (e.g. vapor diffusion hanging drop, vapor diffusion sitting drop, batch, microbatch)"
}`;

/**
 * GET /api/pdb-import/enrich — 파싱이 필요한 결정화 레코드 목록 조회
 */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await (supabase.from('kbsi_crystallization') as any)
    .select(`
      id, condition_detail, ph, temperature,
      precipitant_type, precipitant_conc, precipitant_unit,
      salt_type, salt_conc, buffer_type,
      protein_concentration, additive, drop_ratio,
      construct:kbsi_construct!inner(
        id, name,
        protein:kbsi_protein!inner(full_name)
      )
    `)
    .not('condition_detail', 'is', null)
    .order('id', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 파싱이 필요한 것: condition_detail은 있지만 주요 구조화 필드가 비어있는 레코드
  const needsParsing = (data || []).filter((r: any) =>
    !r.precipitant_type && !r.buffer_type && !r.salt_type
  );

  const alreadyParsed = (data || []).filter((r: any) =>
    r.precipitant_type || r.buffer_type || r.salt_type
  );

  return NextResponse.json({
    total: (data || []).length,
    needsParsing: needsParsing.length,
    alreadyParsed: alreadyParsed.length,
    records: needsParsing.map((r: any) => ({
      id: r.id,
      conditionDetail: r.condition_detail,
      proteinName: r.construct?.protein?.full_name || '',
      constructName: r.construct?.name || '',
      currentFields: {
        ph: r.ph,
        temperature: r.temperature,
        precipitant_type: r.precipitant_type,
        buffer_type: r.buffer_type,
        salt_type: r.salt_type,
      },
    })),
  });
}

/**
 * POST /api/pdb-import/enrich — LLM으로 결정화 조건 파싱 후 DB 업데이트
 * body: { ids: number[] } or { all: true }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  // 파싱 대상 레코드 조회
  let query = (supabase.from('kbsi_crystallization') as any)
    .select('id, condition_detail, precipitant_type, buffer_type, salt_type')
    .not('condition_detail', 'is', null);

  if (body.ids && Array.isArray(body.ids)) {
    query = query.in('id', body.ids);
  }

  const { data: records, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 이미 파싱된 것은 제외 (강제 재파싱이 아닌 경우)
  const targets = body.force
    ? records
    : (records || []).filter((r: any) => !r.precipitant_type && !r.buffer_type && !r.salt_type);

  if (targets.length === 0) {
    return NextResponse.json({ message: '파싱이 필요한 레코드가 없습니다', updated: 0 });
  }

  const results: { id: number; success: boolean; parsed?: any; error?: string }[] = [];

  for (const record of targets) {
    try {
      const parsed = await parseCondition(apiKey, record.condition_detail);
      if (!parsed) {
        results.push({ id: record.id, success: false, error: 'LLM 파싱 실패' });
        continue;
      }

      // null이 아닌 필드만 업데이트 ("null" 문자열도 제외)
      const isValid = (v: any) => v != null && v !== 'null' && v !== '';
      const isValidNum = (v: any) => v != null && v !== 'null' && typeof v === 'number';
      const updates: any = {};
      if (isValid(parsed.precipitant_type)) updates.precipitant_type = parsed.precipitant_type;
      if (isValidNum(parsed.precipitant_conc)) updates.precipitant_conc = parsed.precipitant_conc;
      if (isValid(parsed.precipitant_unit)) updates.precipitant_unit = parsed.precipitant_unit;
      if (isValid(parsed.salt_type)) updates.salt_type = parsed.salt_type;
      if (isValidNum(parsed.salt_conc)) updates.salt_conc = parsed.salt_conc;
      if (isValid(parsed.buffer_type)) updates.buffer_type = parsed.buffer_type;
      if (isValidNum(parsed.protein_concentration)) updates.protein_concentration = parsed.protein_concentration;
      if (isValid(parsed.additive)) updates.additive = parsed.additive;
      if (isValid(parsed.drop_ratio)) updates.drop_ratio = parsed.drop_ratio;

      if (Object.keys(updates).length === 0) {
        results.push({ id: record.id, success: true, parsed, error: '추출 가능한 정보 없음' });
        continue;
      }

      const { error: updateErr } = await (supabase.from('kbsi_crystallization') as any)
        .update(updates)
        .eq('id', record.id);

      if (updateErr) {
        results.push({ id: record.id, success: false, error: updateErr.message });
      } else {
        results.push({ id: record.id, success: true, parsed: updates });
      }
    } catch (err: any) {
      results.push({ id: record.id, success: false, error: err.message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  return NextResponse.json({
    message: `${successCount}/${results.length}건 파싱 완료`,
    results,
  });
}

async function parseCondition(apiKey: string, conditionDetail: string): Promise<any | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: PARSE_SYSTEM_PROMPT },
          { role: 'user', content: `Parse this crystallization condition:\n\n${conditionDetail}` },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[enrich] OpenAI API error ${res.status}:`, errText);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[enrich] Empty content from OpenAI');
      return null;
    }

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('[enrich] parseCondition error:', err);
    return null;
  }
}
