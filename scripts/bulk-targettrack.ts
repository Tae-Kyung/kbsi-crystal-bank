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
import pg from 'pg';

dotenv.config({ path: '.env.local' });

const client = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

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

  await client.connect();
  try {
    // 프로토콜 로드
    const raw = await readFile(INPUT_FILE, 'utf-8');
    const protocols: Protocol[] = JSON.parse(raw);
    console.log(`전체 프로토콜: ${protocols.length}건`);

    // 이미 import된 TargetTrack ID 조회
    const { rows: existing } = await client.query(
      `SELECT name FROM kbsi_construct WHERE name LIKE $1`,
      ['TT-%']
    );
    const existingIds = new Set(existing.map((c: any) => c.name.replace('TT-', '')));
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
          console.log(`${progress} ${p.id}: WARNING LLM 파싱 실패`);
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
          const { rows: existingP } = await client.query(
            `SELECT id FROM kbsi_protein WHERE full_name = $1 LIMIT 1`,
            [proteinName]
          );

          let proteinId: number;
          if (existingP.length > 0) {
            proteinId = existingP[0].id;
          } else {
            const { rows: newP } = await client.query(
              `INSERT INTO kbsi_protein (full_name, organism) VALUES ($1, $2) RETURNING id`,
              [proteinName, parsed.organism || null]
            );
            proteinId = newP[0].id;
          }

          // Construct
          const { rows: newC } = await client.query(
            `INSERT INTO kbsi_construct (protein_id, name, construct_type) VALUES ($1, $2, $3) RETURNING id`,
            [proteinId, `TT-${p.id}`, 'full-length']
          );
          const constructId = newC[0].id;

          // Crystallization
          const isValid = (v: any) => v != null && v !== 'null' && v !== '';
          const isNum = (v: any) => typeof v === 'number' && !isNaN(v);

          const cols: string[] = ['construct_id', 'source_type', 'outcome', 'condition_detail', 'notes'];
          const vals: any[] = [constructId, 'literature', outcome, p.text.slice(0, 500), `TargetTrack ${p.id}`];

          if (isValid(parsed.precipitant_type)) { cols.push('precipitant_type'); vals.push(parsed.precipitant_type); }
          if (isNum(parsed.precipitant_conc)) { cols.push('precipitant_conc'); vals.push(parsed.precipitant_conc); }
          if (isValid(parsed.precipitant_unit)) { cols.push('precipitant_unit'); vals.push(parsed.precipitant_unit); }
          if (isValid(parsed.buffer_type)) { cols.push('buffer_type'); vals.push(parsed.buffer_type); }
          if (isNum(parsed.ph)) { cols.push('ph'); vals.push(parsed.ph); }
          if (isNum(parsed.temperature)) { cols.push('temperature'); vals.push(parsed.temperature); }
          if (isValid(parsed.salt_type)) { cols.push('salt_type'); vals.push(parsed.salt_type); }
          if (isNum(parsed.salt_conc)) { cols.push('salt_conc'); vals.push(parsed.salt_conc); }
          if (isNum(parsed.protein_concentration)) { cols.push('protein_concentration'); vals.push(parsed.protein_concentration); }
          if (isValid(parsed.additive)) { cols.push('additive'); vals.push(parsed.additive); }

          const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
          await client.query(
            `INSERT INTO kbsi_crystallization (${cols.join(', ')}) VALUES (${placeholders})`,
            vals
          );

          console.log(`${progress} ${p.id}: OK ${summary} | P:${proteinId} C:${constructId}`);
          success++;
        } catch (err: any) {
          console.log(`${progress} ${p.id}: FAIL ${err.message}`);
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
  } finally {
    await client.end();
  }
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
