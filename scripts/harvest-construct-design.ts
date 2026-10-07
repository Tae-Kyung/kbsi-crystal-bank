/**
 * 논문에서 Construct 설계 정보 추출 (vector, tag, cleavage_site, codon_optimized)
 * 이미 Expression 데이터가 있는 construct만 대상 (full text 접근 가능했던 것)
 *
 * npx tsx scripts/harvest-construct-design.ts [--limit N] [--offset N] [--dry-run]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EPMC_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

const EXTRACT_PROMPT = `You are an expert structural biologist. Extract ONLY construct design information from a scientific paper's Methods section.
Return a JSON object with one key: "construct".
Only extract information explicitly stated. Use null for anything not mentioned.

Output schema:
{
  "construct": {
    "vector": "string or null (e.g. pET-28a, pGEX-6P-1, pFastBac, pCDNA3.1, pMCSG7)",
    "tag": "string or null (e.g. His6, GST, MBP, SUMO, Strep-tag, FLAG, Thioredoxin)",
    "tag_position": "N-terminal | C-terminal | null",
    "cleavage_site": "string or null (e.g. TEV, PreScission, Thrombin, Factor Xa, Enterokinase)",
    "codon_optimized": "true | false | null (only if explicitly mentioned)"
  }
}`;

async function getFullText(doi: string): Promise<string | null> {
  try {
    const idRes = await fetch(`https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${encodeURIComponent(doi)}&format=json`);
    if (!idRes.ok) return null;
    const idData = await idRes.json();
    const pmcid = idData.records?.[0]?.pmcid;
    if (!pmcid) return null;

    const textRes = await fetch(`${EPMC_API}/${pmcid}/fullTextXML`);
    if (!textRes.ok) return null;
    const xml = await textRes.text();

    const methodsMatch = xml.match(/<sec[^>]*>[\s\S]*?<title[^>]*>[^<]*(method|experiment|material|procedure|cloning|expression|construct|plasmid|vector)[^<]*<\/title>[\s\S]*?<\/sec>/gi);
    if (methodsMatch) {
      return methodsMatch.join('\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
    }

    const bodyText = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const keywords = ['cloned into', 'expression vector', 'pET', 'pGEX', 'His-tag', 'TEV', 'codon-optimized'];
    for (const kw of keywords) {
      const idx = bodyText.toLowerCase().indexOf(kw.toLowerCase());
      if (idx > 0) return bodyText.slice(Math.max(0, idx - 500), idx + 3000).trim();
    }
    return null;
  } catch { return null; }
}

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
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch { return null; }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => { const idx = args.indexOf(`--${name}`); return idx >= 0 && args[idx + 1] ? args[idx + 1] : def; };
  const limit = parseInt(getArg('limit', '5000'));
  const startOffset = parseInt(getArg('offset', '0'));
  const dryRun = args.includes('--dry-run');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey && !dryRun) { console.error('OPENAI_API_KEY 필요'); process.exit(1); }

  console.log('Construct 설계 정보 추출 (vector, tag, cleavage)');
  console.log(`limit: ${limit}, offset: ${startOffset}, dry-run: ${dryRun}\n`);

  // Expression이 있는 construct의 DOI 조회 (이미 full text 접근 성공한 것)
  let expressions: any[] = [];
  let offset = startOffset;
  while (expressions.length < limit) {
    const { data } = await supabase
      .from('kbsi_expression')
      .select('construct_id, source_id')
      .eq('source_db', 'PubMed')
      .not('source_id', 'is', null)
      .order('id')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    expressions = expressions.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  expressions = expressions.slice(0, limit);

  // 이미 vector가 있는 construct 제외
  const constructIds = [...new Set(expressions.map(e => e.construct_id))];
  const { data: hasVector } = await supabase
    .from('kbsi_construct')
    .select('id')
    .in('id', constructIds.slice(0, 1000))
    .not('vector', 'is', null);
  const skipSet = new Set((hasVector || []).map((c: any) => c.id));

  const targets = expressions.filter(e => !skipSet.has(e.construct_id));
  // DOI 중복 제거 (같은 DOI에서 여러 construct)
  const seen = new Set<string>();
  const uniqueTargets = targets.filter(t => {
    const key = `${t.construct_id}:${t.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Expression 데이터: ${expressions.length}건`);
  console.log(`Vector 미보유: ${uniqueTargets.length}건\n`);

  let totalUpdated = 0, noFullText = 0, noData = 0;
  const isValid = (v: any) => v != null && v !== 'null' && v !== '';

  for (let i = 0; i < uniqueTargets.length; i++) {
    const { construct_id, source_id: doi } = uniqueTargets[i];

    const text = await getFullText(doi);
    if (!text) { noFullText++; continue; }

    if (dryRun) {
      console.log(`[${i + 1}] construct=${construct_id} DOI=${doi.slice(0, 35)} | ${text.length} chars`);
      totalUpdated++;
      continue;
    }

    const parsed = await parseWithLLM(apiKey!, text);
    if (!parsed?.construct) { noData++; continue; }

    const c = parsed.construct;
    const update: any = {};
    if (isValid(c.vector)) update.vector = c.vector;
    if (isValid(c.tag)) update.tag_name = c.tag;
    if (isValid(c.tag_position)) update.tag_position = c.tag_position;
    if (isValid(c.cleavage_site)) update.cleavage_site = c.cleavage_site;
    if (c.codon_optimized === true || c.codon_optimized === false) update.codon_optimized = c.codon_optimized;

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('kbsi_construct')
        .update(update)
        .eq('id', construct_id)
        .is('vector', null); // 기존 값 보호
      if (!error) totalUpdated++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`[${i + 1}/${uniqueTargets.length}] updated: ${totalUpdated}, noText: ${noFullText}, noData: ${noData}`);
    }

    await sleep(300);
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
  console.log(`  Updated: ${totalUpdated}`);
  console.log(`  Full text 없음: ${noFullText}`);
  console.log(`  LLM 추출 없음: ${noData}`);
  console.log('═'.repeat(50));
}

main().catch(console.error);
