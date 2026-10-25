/**
 * 논문에서 Expression/Purification 데이터 자동 추출
 * PDB structure → DOI → Europe PMC full text → LLM 파싱 → DB
 *
 * npx tsx scripts/harvest-papers.ts [옵션]
 *   --limit 1000      처리할 PDB 구조 수 (기본: 1000)
 *   --dry-run          미리보기
 *   --offset 0         시작 위치
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

const PDB_API = 'https://data.rcsb.org/rest/v1/core';
const EPMC_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

const EXTRACT_PROMPT = `You are an expert structural biologist. Extract expression and purification conditions from a scientific paper's Methods section.
Return a JSON object with two keys: "expression" and "purification".
Only extract information explicitly stated. Use null for anything not mentioned.

Output schema:
{
  "expression": {
    "host": "string or null (e.g. E. coli, insect cells, HEK293)",
    "strain": "string or null (e.g. BL21(DE3), Rosetta)",
    "vector": "string or null (e.g. pET-28a, pGEX-6P)",
    "tag": "string or null (e.g. His6, GST, MBP)",
    "induction_temp": "number or null (Celsius)",
    "inducer": "string or null (e.g. IPTG 0.5 mM)",
    "yield_mg_l": "number or null",
    "result_level": "no_expression | insoluble | low | moderate | high | null",
    "conditions": "string or null (brief summary)"
  },
  "purification": {
    "method_summary": "string or null (e.g. Ni-NTA → TEV → SEC)",
    "final_purity": "number or null (percentage)",
    "final_yield": "number or null (mg)",
    "result_level": "failed | low | acceptable | high | null"
  }
}`;

// ─── PDB에서 DOI 가져오기 ───
async function getPDBDoi(pdbId: string): Promise<string | null> {
  try {
    const res = await fetch(`${PDB_API}/entry/${pdbId.toLowerCase()}`);
    if (!res.ok) return null;
    const d = await res.json();
    return d.rcsb_primary_citation?.pdbx_database_id_DOI || null;
  } catch { return null; }
}

// ─── Europe PMC에서 full text 가져오기 ───
async function getFullText(doi: string): Promise<string | null> {
  try {
    // DOI → PMCID 변환
    const idRes = await fetch(`https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${encodeURIComponent(doi)}&format=json`);
    if (!idRes.ok) return null;
    const idData = await idRes.json();
    const pmcid = idData.records?.[0]?.pmcid;
    if (!pmcid) return null;

    // PMC full text (Europe PMC)
    const textRes = await fetch(`${EPMC_API}/${pmcid}/fullTextXML`);
    if (!textRes.ok) return null;
    const xml = await textRes.text();

    // Methods 섹션 추출 (간단한 XML 파싱)
    const methodsMatch = xml.match(/<sec[^>]*>[\s\S]*?<title[^>]*>[^<]*(method|experiment|material|procedure|protein expression|purification|crystallization)[^<]*<\/title>[\s\S]*?<\/sec>/gi);
    if (methodsMatch) {
      // XML 태그 제거
      const text = methodsMatch.join('\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return text.slice(0, 4000); // LLM 입력 제한
    }

    // fallback: body 전체에서 키워드 주변 추출
    const bodyText = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const keywords = ['expressed', 'purified', 'induced', 'IPTG', 'Ni-NTA', 'affinity', 'chromatography'];
    for (const kw of keywords) {
      const idx = bodyText.toLowerCase().indexOf(kw.toLowerCase());
      if (idx > 0) {
        return bodyText.slice(Math.max(0, idx - 500), idx + 3000).trim();
      }
    }
    return null;
  } catch { return null; }
}

// ─── LLM 파싱 ───
async function parseWithLLM(apiKey: string, text: string): Promise<any | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EXTRACT_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    // markdown code block 제거
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch { return null; }
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => { const idx = args.indexOf(`--${name}`); return idx >= 0 && args[idx + 1] ? args[idx + 1] : def; };
  const limit = parseInt(getArg('limit', '1000'));
  const startOffset = parseInt(getArg('offset', '0'));
  const dryRun = args.includes('--dry-run');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey && !dryRun) { console.error('OPENAI_API_KEY 필요'); process.exit(1); }

  await client.connect();
  try {
    console.log('논문 LLM 추출: Expression/Purification 데이터');
    console.log(`limit: ${limit}, offset: ${startOffset}, dry-run: ${dryRun}\n`);

    // PDB ID + construct_id 조회
    const { rows: structures } = await client.query(
      `SELECT id, pdb_id, construct_id FROM kbsi_structure
       WHERE pdb_id IS NOT NULL
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [limit, startOffset]
    );

    // 이미 expression이 있는 construct 제외
    const { rows: existingExpr } = await client.query(
      `SELECT DISTINCT construct_id FROM kbsi_expression`
    );
    const hasExpr = new Set(existingExpr.map((r: any) => r.construct_id));

    const targets = structures.filter((s: any) => !hasExpr.has(s.construct_id));
    console.log(`PDB 구조: ${structures.length}건`);
    console.log(`Expression 미보유: ${targets.length}건\n`);

    let totalExpr = 0, totalPurif = 0, noFullText = 0, noMethods = 0;
    const startTime = Date.now();

    for (let i = 0; i < targets.length; i++) {
      const s = targets[i];
      const progress = `[${i + 1}/${targets.length}]`;

      // 1. PDB → DOI
      const doi = await getPDBDoi(s.pdb_id);
      if (!doi) { continue; }

      // 2. DOI → Full text
      const text = await getFullText(doi);
      if (!text) { noFullText++; continue; }

      if (dryRun) {
        console.log(`${progress} ${s.pdb_id} | DOI: ${doi.slice(0, 35)} | ${text.length} chars`);
        totalExpr++;
        continue;
      }

      // 3. LLM 파싱
      const parsed = await parseWithLLM(apiKey!, text);
      if (!parsed) { noMethods++; continue; }

      const isValid = (v: any) => v != null && v !== 'null' && v !== '';

      // 4. Expression insert
      if (parsed.expression && (isValid(parsed.expression.host) || isValid(parsed.expression.conditions))) {
        const cols: string[] = ['construct_id', 'source_type', 'source_db', 'source_id'];
        const vals: any[] = [s.construct_id, 'literature', 'PubMed', doi];
        let paramIdx = 5;

        if (isValid(parsed.expression.host)) { cols.push('host'); vals.push(parsed.expression.host); paramIdx++; }
        if (isValid(parsed.expression.strain)) { cols.push('strain'); vals.push(parsed.expression.strain); paramIdx++; }
        if (typeof parsed.expression.induction_temp === 'number') { cols.push('induction_temp'); vals.push(parsed.expression.induction_temp); paramIdx++; }
        if (typeof parsed.expression.yield_mg_l === 'number') { cols.push('yield_mg_l'); vals.push(parsed.expression.yield_mg_l); paramIdx++; }
        if (isValid(parsed.expression.result_level)) { cols.push('result_level'); vals.push(parsed.expression.result_level); paramIdx++; }
        if (isValid(parsed.expression.conditions)) { cols.push('conditions'); vals.push(parsed.expression.conditions); paramIdx++; }
        if (isValid(parsed.expression.inducer)) { cols.push('notes'); vals.push(parsed.expression.inducer); paramIdx++; }

        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        const { rowCount } = await client.query(
          `INSERT INTO kbsi_expression (${cols.join(', ')}) VALUES (${placeholders})`,
          vals
        );
        if (rowCount && rowCount > 0) totalExpr++;
      }

      // 5. Purification insert
      if (parsed.purification && isValid(parsed.purification.method_summary)) {
        const cols: string[] = ['construct_id', 'source_type', 'source_db', 'source_id'];
        const vals: any[] = [s.construct_id, 'literature', 'PubMed', doi];

        if (isValid(parsed.purification.method_summary)) { cols.push('method_summary'); vals.push(parsed.purification.method_summary); }
        if (typeof parsed.purification.final_purity === 'number') { cols.push('final_purity'); vals.push(parsed.purification.final_purity); }
        if (typeof parsed.purification.final_yield === 'number') { cols.push('final_yield'); vals.push(parsed.purification.final_yield); }
        if (isValid(parsed.purification.result_level)) { cols.push('result_level'); vals.push(parsed.purification.result_level); }

        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        const { rowCount } = await client.query(
          `INSERT INTO kbsi_purification (${cols.join(', ')}) VALUES (${placeholders})`,
          vals
        );
        if (rowCount && rowCount > 0) totalPurif++;
      }

      if ((i + 1) % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`${progress} expr: ${totalExpr}, purif: ${totalPurif}, noText: ${noFullText} | ${elapsed}s`);
      }

      await sleep(300); // Rate limiting
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
    console.log(`Expression: ${totalExpr}건`);
    console.log(`Purification: ${totalPurif}건`);
    console.log(`Full text 없음: ${noFullText}건`);
    console.log(`LLM 파싱 실패: ${noMethods}건`);
    console.log(`소요: ${elapsed}s`);
    console.log('═'.repeat(60));
  } finally {
    await client.end();
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
main().catch(console.error);
