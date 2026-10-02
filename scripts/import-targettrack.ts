/**
 * TargetTrack 파싱된 데이터를 LLM으로 구조화 후 DB에 import
 *
 * 사용법:
 *   npx tsx scripts/import-targettrack.ts [--limit 50] [--dry-run]
 *
 * 선행: scripts/parse-targettrack.ts 실행 완료
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data', 'targettrack');
const INPUT_FILE = join(DATA_DIR, 'crystallization_trials.json');
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

interface TargetTrial {
  targetId: string;
  proteinName: string;
  organism: string;
  sequence: string;
  status: string;
  stopStatus: string | null;
  crystallizationProtocol: string | null;
  center: string;
  trialId: string;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '50');
  const dryRun = args.includes('--dry-run');

  console.log(`TargetTrack → DB Import (limit: ${limit}, dry-run: ${dryRun})`);

  // JSON 로드
  const raw = await readFile(INPUT_FILE, 'utf-8');
  const trials: TargetTrial[] = JSON.parse(raw);
  console.log(`로드: ${trials.length}건`);

  // 프로토콜이 있는 것만 (LLM 파싱 가능)
  const withProtocol = trials.filter((t) => t.crystallizationProtocol && t.crystallizationProtocol.length > 20);
  console.log(`프로토콜 텍스트 있음: ${withProtocol.length}건`);

  const targets = withProtocol.slice(0, limit);
  console.log(`처리 대상: ${targets.length}건\n`);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY 환경변수가 필요합니다');
    process.exit(1);
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const progress = `[${i + 1}/${targets.length}]`;

    // 결정화 성공/실패 판단
    const isSuccess = t.status.toLowerCase().includes('diffraction') ||
                      t.status.toLowerCase().includes('crystal structure');
    const outcome = isSuccess ? 'diffraction_quality' : determinFailureOutcome(t.status, t.stopStatus);

    console.log(`${progress} ${t.targetId} | ${t.proteinName?.slice(0, 40)} | ${t.status} → ${outcome}`);

    // LLM으로 프로토콜 파싱
    const parsed = await parseProtocol(apiKey, t.crystallizationProtocol!);
    if (!parsed) {
      console.log(`  ⚠ LLM 파싱 실패, 건너뜀`);
      failed++;
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY-RUN] ${JSON.stringify(parsed)}`);
      success++;
      continue;
    }

    // DB import: 먼저 protein + construct 생성, 그 다음 crystallization
    try {
      // 1. Protein 찾기/생성
      const proteinRes = await fetch(`${API_BASE}/api/proteins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: t.proteinName || `TargetTrack ${t.targetId}`,
          organism: t.organism || null,
        }),
      });
      let proteinId: number;
      if (proteinRes.ok) {
        const pj = await proteinRes.json();
        proteinId = pj.id;
      } else {
        // 이미 존재할 수 있음
        console.log(`  ⚠ Protein 생성 실패 (${proteinRes.status}), 건너뜀`);
        failed++;
        continue;
      }

      // 2. Construct 생성
      const constructRes = await fetch(`${API_BASE}/api/constructs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protein_id: proteinId,
          name: `TT-${t.targetId}`,
          seq_final: t.sequence || null,
          construct_type: 'full-length',
        }),
      });
      if (!constructRes.ok) {
        console.log(`  ⚠ Construct 생성 실패 (${constructRes.status}), 건너뜀`);
        failed++;
        continue;
      }
      const cj = await constructRes.json();
      const constructId = cj.id;

      // 3. Crystallization 레코드 생성
      const crystRes = await fetch(`${API_BASE}/api/crystallizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          construct_id: constructId,
          source_type: 'literature',
          outcome,
          precipitant_type: parsed.precipitant_type || null,
          precipitant_conc: parsed.precipitant_conc || null,
          precipitant_unit: parsed.precipitant_unit || null,
          buffer_type: parsed.buffer_type || null,
          ph: parsed.ph || null,
          temperature: parsed.temperature || null,
          salt_type: parsed.salt_type || null,
          salt_conc: parsed.salt_conc || null,
          protein_concentration: parsed.protein_concentration || null,
          additive: parsed.additive || null,
          condition_detail: t.crystallizationProtocol?.slice(0, 500) || null,
          notes: `TargetTrack ${t.targetId} (${t.center}) | status: ${t.status}${t.stopStatus ? ` | stop: ${t.stopStatus}` : ''}`,
        }),
      });
      if (crystRes.ok) {
        console.log(`  ✓ 등록 완료 (construct: ${constructId})`);
        success++;
      } else {
        console.log(`  ⚠ Crystallization 등록 실패 (${crystRes.status})`);
        failed++;
      }
    } catch (err: any) {
      console.log(`  ✗ 에러: ${err.message}`);
      failed++;
    }

    // Rate limiting
    await sleep(500);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`성공: ${success}, 실패: ${failed}`);
}

function determinFailureOutcome(status: string, stopStatus: string | null): string {
  const s = (status + ' ' + (stopStatus || '')).toLowerCase();
  if (s.includes('precipit')) return 'precipitate';
  if (s.includes('phase')) return 'phase_separation';
  if (s.includes('micro')) return 'microcrystal';
  if (s.includes('clear')) return 'clear';
  // 결정화 단계에서 멈춘 경우 기본 precipitate
  if (s.includes('crystal') && (s.includes('stop') || s.includes('fail') || s.includes('abandon'))) {
    return 'precipitate';
  }
  return 'clear';
}

async function parseProtocol(apiKey: string, protocol: string): Promise<any | null> {
  const systemPrompt = `You are an expert crystallographer. Extract structured crystallization conditions from a protocol description.
Only extract information explicitly stated. If not mentioned, use null.
Convert temperature from Kelvin to Celsius if needed.
Respond ONLY with a valid JSON object.

Output schema:
{
  "precipitant_type": "string or null",
  "precipitant_conc": "number or null",
  "precipitant_unit": "string or null",
  "salt_type": "string or null",
  "salt_conc": "number or null",
  "buffer_type": "string or null",
  "ph": "number or null",
  "temperature": "number or null (Celsius)",
  "protein_concentration": "number or null (mg/mL)",
  "additive": "string or null"
}`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Parse this crystallization protocol:\n\n${protocol.slice(0, 1000)}` },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
