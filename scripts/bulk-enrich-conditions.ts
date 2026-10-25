/**
 * 결정화 조건 일괄 LLM 파싱 (Condition Enrichment)
 * condition_detail 텍스트에서 구조화된 필드(precipitant, pH 등)를 추출
 *
 * npx tsx scripts/bulk-enrich-conditions.ts [옵션]
 *   --limit 100       처리 건수 (기본: 100)
 *   --dry-run         실제 DB 업데이트 없이 미리보기
 *   --force           이미 파싱된 레코드도 다시 처리
 */

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

const PARSE_PROMPT = `You are an expert crystallographer. Extract structured crystallization conditions from a free-text description.
Only extract information explicitly stated in the text. Do not infer or guess.
If temperature is in Kelvin, convert to Celsius. Separate numeric value from unit.
Respond ONLY with a valid JSON object.

Output schema:
{
  "precipitant_type": "string or null (e.g. PEG 3350, Ammonium sulfate)",
  "precipitant_conc": "number or null",
  "precipitant_unit": "% or M or mM or null",
  "buffer_type": "string or null",
  "ph": "number or null (override if different from existing)",
  "temperature": "number or null (Celsius)",
  "salt_type": "string or null",
  "salt_conc": "number or null (mM)",
  "protein_concentration": "number or null (mg/mL)",
  "additive": "string or null"
}`;

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '100');
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY 필요');
    process.exit(1);
  }

  await client.connect();
  try {
    // condition_detail이 있지만 precipitant_type이 없는 레코드 조회
    const whereClause = force
      ? `WHERE condition_detail IS NOT NULL`
      : `WHERE condition_detail IS NOT NULL AND precipitant_type IS NULL`;

    const { rows: records } = await client.query(
      `SELECT id, condition_detail, precipitant_type, ph, temperature
       FROM kbsi_crystallization
       ${whereClause}
       ORDER BY id
       LIMIT $1`,
      [limit]
    );

    console.log(`대상 레코드: ${records.length}건 (limit: ${limit}${force ? ', force' : ''})\n`);
    if (records.length === 0) {
      console.log('파싱할 레코드가 없습니다.');
      return;
    }

    let success = 0;
    let failed = 0;

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const detail = rec.condition_detail?.slice(0, 1500) || '';
      if (!detail) continue;

      process.stdout.write(`[${i + 1}/${records.length}] ID:${rec.id} — `);

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
              { role: 'user', content: detail },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) {
          console.log('LLM API 오류');
          failed++;
          continue;
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) { console.log('빈 응답'); failed++; continue; }

        const parsed = JSON.parse(content.trim());

        // 유효한 필드만 업데이트
        const isValid = (v: any) => v != null && v !== 'null' && v !== '';
        const isNum = (v: any) => typeof v === 'number' && !isNaN(v);

        const updates: Record<string, any> = {};
        if (isValid(parsed.precipitant_type)) updates.precipitant_type = parsed.precipitant_type;
        if (isNum(parsed.precipitant_conc)) updates.precipitant_conc = parsed.precipitant_conc;
        if (isValid(parsed.precipitant_unit)) updates.precipitant_unit = parsed.precipitant_unit;
        if (isValid(parsed.buffer_type)) updates.buffer_type = parsed.buffer_type;
        if (isNum(parsed.ph) && !rec.ph) updates.ph = parsed.ph;
        if (isNum(parsed.temperature) && !rec.temperature) updates.temperature = parsed.temperature;
        if (isValid(parsed.salt_type)) updates.salt_type = parsed.salt_type;
        if (isNum(parsed.salt_conc)) updates.salt_conc = parsed.salt_conc;
        if (isNum(parsed.protein_concentration)) updates.protein_concentration = parsed.protein_concentration;
        if (isValid(parsed.additive)) updates.additive = parsed.additive;

        const fieldCount = Object.keys(updates).length;
        const summary = `${parsed.precipitant_type || '?'} ${parsed.precipitant_conc || ''}${parsed.precipitant_unit || ''} | pH ${parsed.ph || '?'} | ${parsed.temperature || '?'}°C`;

        if (fieldCount === 0) {
          console.log(`(추출 필드 없음) ${detail.slice(0, 80)}...`);
          failed++;
          continue;
        }

        if (dryRun) {
          console.log(`${summary} [${fieldCount} fields]`);
        } else {
          // Build parameterized UPDATE
          const setClauses: string[] = [];
          const vals: any[] = [];
          let paramIdx = 1;
          for (const [col, val] of Object.entries(updates)) {
            setClauses.push(`${col} = $${paramIdx}`);
            vals.push(val);
            paramIdx++;
          }
          vals.push(rec.id);

          const { rowCount } = await client.query(
            `UPDATE kbsi_crystallization SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
            vals
          );

          if (!rowCount || rowCount === 0) {
            console.log(`DB 업데이트 실패`);
            failed++;
            continue;
          }
          console.log(`OK ${summary} [${fieldCount} fields]`);
        }
        success++;
      } catch (err: any) {
        console.log(`FAIL ${err.message}`);
        failed++;
      }

      await sleep(300);
    }

    console.log(`\n=== 완료: 성공 ${success}, 실패 ${failed} ${dryRun ? '(dry-run)' : ''} ===`);
  } finally {
    await client.end();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
