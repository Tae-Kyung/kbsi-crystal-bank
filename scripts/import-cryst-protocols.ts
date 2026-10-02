/**
 * 추출된 결정화 프로토콜을 LLM으로 파싱하여 DB에 import
 * npx tsx scripts/import-cryst-protocols.ts [--limit 20] [--dry-run]
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DATA_DIR = join(process.cwd(), 'data', 'targettrack');
const INPUT_FILE = join(DATA_DIR, 'crystallization_protocols.json');

const PARSE_PROMPT = `You are an expert crystallographer. Extract structured crystallization conditions from a protocol description.
Only extract information explicitly stated. If not mentioned, use null.
Convert temperature from Kelvin to Celsius if needed.
Respond ONLY with a valid JSON object.

Output schema:
{
  "protein_name": "string or null",
  "organism": "string or null",
  "protein_concentration": "number or null (mg/mL)",
  "precipitant_type": "string or null (e.g. PEG 3350, ammonium sulfate)",
  "precipitant_conc": "number or null",
  "precipitant_unit": "string or null (%, M, mM)",
  "buffer_type": "string or null (e.g. HEPES, Tris)",
  "ph": "number or null",
  "temperature": "number or null (Celsius)",
  "salt_type": "string or null",
  "salt_conc": "number or null (mM)",
  "additive": "string or null",
  "method": "string or null (e.g. sitting drop, hanging drop, batch)",
  "outcome": "clear | precipitate | microcrystal | single_crystal | diffraction_quality | null"
}`;

interface Protocol {
  id: string;
  name: string;
  text: string;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '20');
  const dryRun = args.includes('--dry-run');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY not found in .env.local');
    process.exit(1);
  }

  const raw = await readFile(INPUT_FILE, 'utf-8');
  const protocols: Protocol[] = JSON.parse(raw);
  console.log(`로드: ${protocols.length}건, 처리: ${Math.min(limit, protocols.length)}건\n`);

  const targets = protocols.slice(0, limit);
  let success = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    console.log(`[${i + 1}/${targets.length}] ${p.id}: ${p.name}`);

    // LLM 파싱
    const parsed = await parseWithLLM(apiKey, p.text);
    if (!parsed) {
      console.log('  ⚠ LLM 파싱 실패');
      failed++;
      continue;
    }

    const outcome = parsed.outcome || 'diffraction_quality'; // 프로토콜이 있으면 대부분 성공 사례

    console.log(`  → ${parsed.precipitant_type || '?'} ${parsed.precipitant_conc || ''}${parsed.precipitant_unit || ''} | ${parsed.buffer_type || '?'} pH${parsed.ph || '?'} | ${parsed.temperature || '?'}°C | ${outcome}`);

    if (dryRun) {
      success++;
      continue;
    }

    // Supabase에 직접 insert (RLS 우회를 위해 service role key 사용)
    try {
      const proteinName = parsed.protein_name || p.name || `TargetTrack ${p.id}`;

      // 1. Protein upsert
      const { data: existingProtein } = await supabase
        .from('kbsi_protein')
        .select('id')
        .eq('full_name', proteinName)
        .maybeSingle();

      let proteinId: number;
      if (existingProtein) {
        proteinId = existingProtein.id;
      } else {
        const { data: newProtein, error: pErr } = await supabase
          .from('kbsi_protein')
          .insert({ full_name: proteinName, organism: parsed.organism || null })
          .select('id')
          .single();
        if (pErr) { console.log(`  ⚠ Protein: ${pErr.message}`); failed++; continue; }
        proteinId = newProtein.id;
      }

      // 2. Construct
      const { data: newConstruct, error: cErr } = await supabase
        .from('kbsi_construct')
        .insert({ protein_id: proteinId, name: `TT-${p.id}`, construct_type: 'full-length' })
        .select('id')
        .single();
      if (cErr) { console.log(`  ⚠ Construct: ${cErr.message}`); failed++; continue; }
      const constructId = newConstruct.id;

      // 3. Crystallization
      const isValid = (v: any) => v != null && v !== 'null' && v !== '';
      const isValidNum = (v: any) => typeof v === 'number' && !isNaN(v);

      const crystData: any = {
        construct_id: constructId,
        source_type: 'literature',
        outcome,
        condition_detail: p.text.slice(0, 500),
        notes: `TargetTrack ${p.id}`,
      };
      if (isValid(parsed.precipitant_type)) crystData.precipitant_type = parsed.precipitant_type;
      if (isValidNum(parsed.precipitant_conc)) crystData.precipitant_conc = parsed.precipitant_conc;
      if (isValid(parsed.precipitant_unit)) crystData.precipitant_unit = parsed.precipitant_unit;
      if (isValid(parsed.buffer_type)) crystData.buffer_type = parsed.buffer_type;
      if (isValidNum(parsed.ph)) crystData.ph = parsed.ph;
      if (isValidNum(parsed.temperature)) crystData.temperature = parsed.temperature;
      if (isValid(parsed.salt_type)) crystData.salt_type = parsed.salt_type;
      if (isValidNum(parsed.salt_conc)) crystData.salt_conc = parsed.salt_conc;
      if (isValidNum(parsed.protein_concentration)) crystData.protein_concentration = parsed.protein_concentration;
      if (isValid(parsed.additive)) crystData.additive = parsed.additive;

      const { error: xErr } = await supabase
        .from('kbsi_crystallization')
        .insert(crystData);

      if (!xErr) {
        console.log(`  ✓ 등록 (protein:${proteinId}, construct:${constructId})`);
        success++;
      } else {
        console.log(`  ⚠ Crystallization: ${xErr.message}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`  ✗ ${err.message}`);
      failed++;
    }

    await sleep(300);
  }

  console.log(`\n=== 완료: 성공 ${success}, 실패 ${failed} ===`);
}

async function parseWithLLM(apiKey: string, text: string): Promise<any | null> {
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
          { role: 'system', content: PARSE_PROMPT },
          { role: 'user', content: text.slice(0, 1500) },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content.trim());
  } catch {
    return null;
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
