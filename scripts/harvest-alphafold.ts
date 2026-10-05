/**
 * AlphaFold DB 예측 구조 수집
 * DB의 UniProt ID를 기반으로 AlphaFold 예측 구조 메타데이터 수집
 *
 * npx tsx scripts/harvest-alphafold.ts [옵션]
 *   --limit 5000     처리 건수 (기본: 5000)
 *   --dry-run         미리보기
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const AF_API = 'https://alphafold.ebi.ac.uk/api';

interface AlphaFoldEntry {
  uniprotAccession: string;
  modelUrl: string;
  paeImageUrl: string;
  globalMetricValue: number; // pLDDT
}

async function fetchAlphaFold(uniprotId: string): Promise<AlphaFoldEntry | null> {
  try {
    const res = await fetch(`${AF_API}/prediction/${uniprotId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const entry = data[0];
    return {
      uniprotAccession: entry.uniprotAccession,
      modelUrl: entry.pdbUrl || entry.cifUrl || null,
      paeImageUrl: entry.paeImageUrl || null,
      globalMetricValue: entry.globalMetricValue || null,
    };
  } catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[args.indexOf('--limit') + 1] || '5000');
  const dryRun = args.includes('--dry-run');

  console.log('AlphaFold DB 예측 구조 수집');

  // UniProt ID가 있는 단백질 조회
  let uniprotIds: { protein_id: number; db_value: string }[] = [];
  let offset = 0;
  while (uniprotIds.length < limit) {
    const { data } = await supabase
      .from('kbsi_database_id')
      .select('protein_id, db_value')
      .eq('db_name', 'UniProt')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    uniprotIds = uniprotIds.concat(data as any[]);
    if (data.length < 1000) break;
    offset += 1000;
  }
  uniprotIds = uniprotIds.slice(0, limit);

  // 이미 AlphaFold 데이터가 있는 것 제외
  const { data: existing } = await supabase
    .from('kbsi_database_id')
    .select('protein_id')
    .eq('db_name', 'AlphaFold')
    .limit(1000);
  const hasAF = new Set((existing || []).map((r: any) => r.protein_id));

  const targets = uniprotIds.filter(u => !hasAF.has(u.protein_id));
  console.log(`UniProt ID: ${uniprotIds.length}건, AlphaFold 미수집: ${targets.length}건\n`);

  let success = 0, notFound = 0;
  const startTime = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const { protein_id, db_value: db_id } = targets[i];

    const af = await fetchAlphaFold(db_id);
    if (!af) { notFound++; continue; }

    if (dryRun) {
      if (success < 10) console.log(`  ${db_id}: pLDDT=${af.globalMetricValue}`);
      success++;
      continue;
    }

    // AlphaFold ID 저장
    await supabase.from('kbsi_database_id').insert({
      protein_id,
      db_name: 'AlphaFold',
      db_value: af.uniprotAccession,
    }).then(() => {});

    success++;

    if ((i + 1) % 200 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ${i + 1}/${targets.length} | AF found: ${success} | not found: ${notFound} | ${elapsed}s`);
    }

    await sleep(100);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`완료 ${dryRun ? '(dry-run)' : ''}`);
  console.log(`AlphaFold 연결: ${success}건`);
  console.log(`미발견: ${notFound}건`);
  console.log(`소요: ${elapsed}s`);
  console.log('═'.repeat(50));
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
main().catch(console.error);
