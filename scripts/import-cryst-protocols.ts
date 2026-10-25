/**
 * 추출된 결정화 프로토콜을 LLM으로 파싱하여 DB에 import
 * npx tsx scripts/import-cryst-protocols.ts [--limit 20] [--dry-run]
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

  await client.connect();
  try {
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
        console.log('  WARNING LLM 파싱 실패');
        failed++;
        continue;
      }

      const outcome = parsed.outcome || 'diffraction_quality'; // 프로토콜이 있으면 대부분 성공 사례

      console.log(`  → ${parsed.precipitant_type || '?'} ${parsed.precipitant_conc || ''}${parsed.precipitant_unit || ''} | ${parsed.buffer_type || '?'} pH${parsed.ph || '?'} | ${parsed.temperature || '?'}°C | ${outcome}`);

      if (dryRun) {
        success++;
        continue;
      }

      try {
        const proteinName = parsed.protein_name || p.name || `TargetTrack ${p.id}`;

        // 1. Protein upsert
        const { rows: existingRows } = await client.query(
          `SELECT id FROM kbsi_protein WHERE full_name = $1 LIMIT 1`,
          [proteinName]
        );

        let proteinId: number;
        if (existingRows.length > 0) {
          proteinId = existingRows[0].id;
        } else {
          const { rows: newRows } = await client.query(
            `INSERT INTO kbsi_protein (full_name, organism) VALUES ($1, $2) RETURNING id`,
            [proteinName, parsed.organism || null]
          );
          proteinId = newRows[0].id;
        }

        // 2. Construct
        const { rows: cRows } = await client.query(
          `INSERT INTO kbsi_construct (protein_id, name, construct_type) VALUES ($1, $2, $3) RETURNING id`,
          [proteinId, `TT-${p.id}`, 'full-length']
        );
        const constructId = cRows[0].id;

        // 3. Crystallization
        const isValid = (v: any) => v != null && v !== 'null' && v !== '';
        const isValidNum = (v: any) => typeof v === 'number' && !isNaN(v);

        const cols: string[] = ['construct_id', 'source_type', 'outcome', 'condition_detail', 'notes'];
        const vals: any[] = [constructId, 'literature', outcome, p.text.slice(0, 500), `TargetTrack ${p.id}`];

        if (isValid(parsed.precipitant_type)) { cols.push('precipitant_type'); vals.push(parsed.precipitant_type); }
        if (isValidNum(parsed.precipitant_conc)) { cols.push('precipitant_conc'); vals.push(parsed.precipitant_conc); }
        if (isValid(parsed.precipitant_unit)) { cols.push('precipitant_unit'); vals.push(parsed.precipitant_unit); }
        if (isValid(parsed.buffer_type)) { cols.push('buffer_type'); vals.push(parsed.buffer_type); }
        if (isValidNum(parsed.ph)) { cols.push('ph'); vals.push(parsed.ph); }
        if (isValidNum(parsed.temperature)) { cols.push('temperature'); vals.push(parsed.temperature); }
        if (isValid(parsed.salt_type)) { cols.push('salt_type'); vals.push(parsed.salt_type); }
        if (isValidNum(parsed.salt_conc)) { cols.push('salt_conc'); vals.push(parsed.salt_conc); }
        if (isValidNum(parsed.protein_concentration)) { cols.push('protein_concentration'); vals.push(parsed.protein_concentration); }
        if (isValid(parsed.additive)) { cols.push('additive'); vals.push(parsed.additive); }

        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        const { rowCount } = await client.query(
          `INSERT INTO kbsi_crystallization (${cols.join(', ')}) VALUES (${placeholders})`,
          vals
        );

        if (rowCount && rowCount > 0) {
          console.log(`  OK 등록 (protein:${proteinId}, construct:${constructId})`);
          success++;
        } else {
          console.log(`  WARNING Crystallization insert failed`);
          failed++;
        }
      } catch (err: any) {
        console.log(`  FAIL ${err.message}`);
        failed++;
      }

      await sleep(300);
    }

    console.log(`\n=== 완료: 성공 ${success}, 실패 ${failed} ===`);
  } finally {
    await client.end();
  }
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
