/**
 * TargetTrack 결정화 프로토콜 전량 Import
 * 기존 import-cryst-protocols.ts 확장: 전체 데이터셋 + 중복 방지 + 진행률 추적
 *
 * npx tsx scripts/bulk-targettrack.ts [옵션]
 *   --limit 500        최대 처리 건수 (기본: 전량)
 *   --offset 77        시작 위치 (기존 77건 이후부터)
 *   --dry-run          미리보기
 *   --batch 20         동시 LLM 호출 배치 크기 (기본: 10)
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

interface Protocol { id: string; name: string; text: string; }

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  const limit = parseInt(getArg('limit', '99999'));
  const offset = parseInt(getArg('offset', '0'));
  const batchSize = parseInt(getArg('batch', '10'));
  const dryRun = args.includes('--dry-run');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error('OPENAI_API_KEY 필요'); process.exit(1); }

  // 프로토콜 로드
  const raw = await readFile(INPUT_FILE, 'utf-8');
  const protocols: Protocol[] = JSON.parse(raw);
  console.log(`전체 프로토콜: ${protocols.length}건`);

  // 이미 import된 TargetTrack ID 조회
  const { data: existing } = await supabase
    .from('kbsi_construct')
    .select('name')
    .like('name', 'TT-%');
  const existingIds = new Set((existing || []).map((c: any) => c.name.replace('TT-', '')));
  console.log(`이미 import됨: ${existingIds.size}건`);

  // 신규 대상 필터
  const targets = protocols
    .filter(p => !existingIds.has(p.id))
    .slice(offset, offset + limit);
  console.log(`신규 대상: ${targets.length}건 (offset: ${offset})\n`);

  let success = 0;
  let failed = 0;
  const startTime = Date.now();

  // 배치 처리
  for (let batchStart = 0; batchStart < targets.length; batchStart += batchSize) {
    const batch = targets.slice(batchStart, batchStart + batchSize);

    // 병렬 LLM 호출
    const results = await Promise.all(
      batch.map(async (p) => {
        const parsed = await parseWithLLM(apiKey, p.text);
        return { protocol: p, parsed };
      })
    );

    // 순차 DB insert
    for (let ri = 0; ri < results.length; ri++) {
      const { protocol: p, parsed } = results[ri];
      const progress = `[${batchStart + ri + 1}/${targets.length}]`;

      if (!parsed) {
        console.log(`${progress} ${p.id}: ⚠ LLM 파싱 실패`);
        failed++;
        continue;
      }

      const outcome = parsed.outcome || 'diffraction_quality';
      const summary = `${parsed.precipitant_type || '?'} ${parsed.precipitant_conc || ''}${parsed.precipitant_unit || ''} | pH ${parsed.ph || '?'} | ${parsed.temperature || '?'}°C`;

      if (dryRun) {
        console.log(`${progress} ${p.id}: ${summary} | ${outcome}`);
        success++;
        continue;
      }

      try {
        const proteinName = parsed.protein_name || p.name || `TargetTrack ${p.id}`;

        // Protein upsert
        const { data: existingP } = await supabase
          .from('kbsi_protein')
          .select('id')
          .eq('full_name', proteinName)
          .maybeSingle();

        let proteinId: number;
        if (existingP) {
          proteinId = existingP.id;
        } else {
          const { data: newP, error: pErr } = await supabase
            .from('kbsi_protein')
            .insert({ full_name: proteinName, organism: parsed.organism || null })
            .select('id')
            .single();
          if (pErr) { console.log(`${progress} ${p.id}: ⚠ Protein: ${pErr.message}`); failed++; continue; }
          proteinId = newP.id;
        }

        // Construct
        const { data: newC, error: cErr } = await supabase
          .from('kbsi_construct')
          .insert({ protein_id: proteinId, name: `TT-${p.id}`, construct_type: 'full-length' })
          .select('id')
          .single();
        if (cErr) { console.log(`${progress} ${p.id}: ⚠ Construct: ${cErr.message}`); failed++; continue; }

        // Crystallization
        const isValid = (v: any) => v != null && v !== 'null' && v !== '';
        const isNum = (v: any) => typeof v === 'number' && !isNaN(v);
        const crystData: any = {
          construct_id: newC.id, source_type: 'literature', outcome,
          condition_detail: p.text.slice(0, 500), notes: `TargetTrack ${p.id}`,
        };
        if (isValid(parsed.precipitant_type)) crystData.precipitant_type = parsed.precipitant_type;
        if (isNum(parsed.precipitant_conc)) crystData.precipitant_conc = parsed.precipitant_conc;
        if (isValid(parsed.precipitant_unit)) crystData.precipitant_unit = parsed.precipitant_unit;
        if (isValid(parsed.buffer_type)) crystData.buffer_type = parsed.buffer_type;
        if (isNum(parsed.ph)) crystData.ph = parsed.ph;
        if (isNum(parsed.temperature)) crystData.temperature = parsed.temperature;
        if (isValid(parsed.salt_type)) crystData.salt_type = parsed.salt_type;
        if (isNum(parsed.salt_conc)) crystData.salt_conc = parsed.salt_conc;
        if (isNum(parsed.protein_concentration)) crystData.protein_concentration = parsed.protein_concentration;
        if (isValid(parsed.additive)) crystData.additive = parsed.additive;

        const { error: xErr } = await supabase.from('kbsi_crystallization').insert(crystData);
        if (xErr) { console.log(`${progress} ${p.id}: ⚠ Cryst: ${xErr.message}`); failed++; continue; }

        console.log(`${progress} ${p.id}: ✓ ${summary} | P:${proteinId} C:${newC.id}`);
        success++;
      } catch (err: any) {
        console.log(`${progress} ${p.id}: ✗ ${err.message}`);
        failed++;
      }
    }

    // 배치 간 딜레이
    await sleep(500);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료: 성공 ${success}, 실패 ${failed}, 소요 ${elapsed}s ${dryRun ? '(dry-run)' : ''}`);
  console.log(`속도: ${(success / (parseFloat(elapsed) || 1) * 60).toFixed(0)}건/분`);
}

async function parseWithLLM(apiKey: string, text: string): Promise<any | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
  } catch { return null; }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
