/**
 * PDB에서 Expression 호스트 데이터 추출 -> kbsi_expression 테이블 적재
 *
 * Phase D-2: Expression/Purification 확장
 *
 * npx tsx scripts/harvest-expression-from-pdb.ts [옵션]
 *   --limit 1000        처리 건수 (기본: 전체)
 *   --offset 0          시작 오프셋 (기본: 0)
 *   --concurrency 5     PDB API 동시 요청 수 (기본: 5, 최대: 10)
 *   --dry-run           미리보기 (DB 삽입 안 함)
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const PDB_API = 'https://data.rcsb.org/rest/v1/core';
const BATCH_SIZE = 500;
const API_DELAY_MS = 120;
const USER_AGENT = 'KBSI-CrystalBank/1.0 (https://kbsi-crystal-bank.vercel.app)';

interface StructureRow { construct_id: number; pdb_id: string; }
interface ExpressionRecord {
  construct_id: number; host: string | null; strain: string | null;
  source_type: 'database'; source_db: string; source_id: string;
  conditions: string | null; notes: string | null; is_validated: boolean;
}

const HOST_NORMALIZE_MAP: Record<string, string> = {
  'escherichia coli': 'Escherichia coli', 'e. coli': 'Escherichia coli',
  'escherichia coli bl21(de3)': 'Escherichia coli', 'escherichia coli bl21 (de3)': 'Escherichia coli',
  'escherichia coli k-12': 'Escherichia coli', 'escherichia coli k12': 'Escherichia coli',
  'escherichia coli str. k-12 substr. mg1655': 'Escherichia coli',
  'saccharomyces cerevisiae': 'Saccharomyces cerevisiae',
  'pichia pastoris': 'Pichia pastoris', 'komagataella phaffii': 'Pichia pastoris', 'komagataella pastoris': 'Pichia pastoris',
  'spodoptera frugiperda': 'Spodoptera frugiperda', 'trichoplusia ni': 'Trichoplusia ni',
  'homo sapiens': 'Homo sapiens', 'cricetulus griseus': 'Cricetulus griseus',
  'drosophila melanogaster': 'Drosophila melanogaster', 'nicotiana benthamiana': 'Nicotiana benthamiana',
  'sf9': 'Spodoptera frugiperda', 'sf21': 'Spodoptera frugiperda',
  'hi5': 'Trichoplusia ni', 'high five': 'Trichoplusia ni',
  'hek293': 'Homo sapiens', 'hek293t': 'Homo sapiens', 'hek-293': 'Homo sapiens',
  'cho': 'Cricetulus griseus', 'chinese hamster ovary': 'Cricetulus griseus',
};

function normalizeHost(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return HOST_NORMALIZE_MAP[trimmed.toLowerCase()] || trimmed;
}

const STRAIN_PATTERNS: { pattern: RegExp; strain: string }[] = [
  { pattern: /bl21\s*\(?\s*de3\s*\)?\s*plyss/i, strain: 'BL21(DE3)pLysS' },
  { pattern: /bl21\s*\(?\s*de3\s*\)?/i, strain: 'BL21(DE3)' },
  { pattern: /bl21/i, strain: 'BL21' },
  { pattern: /rosetta\s*2?\s*\(?\s*de3\s*\)?/i, strain: 'Rosetta(DE3)' },
  { pattern: /rosetta/i, strain: 'Rosetta' },
  { pattern: /origami/i, strain: 'Origami' },
  { pattern: /shuffle/i, strain: 'SHuffle' },
  { pattern: /arctic\s*express/i, strain: 'ArcticExpress' },
  { pattern: /dh5\s*alpha/i, strain: 'DH5alpha' },
  { pattern: /top10/i, strain: 'TOP10' },
  { pattern: /c41\s*\(?\s*de3\s*\)?/i, strain: 'C41(DE3)' },
  { pattern: /c43\s*\(?\s*de3\s*\)?/i, strain: 'C43(DE3)' },
];

function extractStrain(hostRaw: string | null, strainRaw: string | null): string | null {
  if (strainRaw && strainRaw.trim()) return strainRaw.trim();
  if (!hostRaw) return null;
  for (const { pattern, strain } of STRAIN_PATTERNS) {
    if (pattern.test(hostRaw)) return strain;
  }
  return null;
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name: string, defaultVal: number) => {
    const idx = args.indexOf(name);
    return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1]) : defaultVal;
  };
  return {
    limit: getArg('--limit', Infinity),
    offset: getArg('--offset', 0),
    concurrency: Math.min(getArg('--concurrency', 5), 10),
    dryRun: args.includes('--dry-run'),
  };
}

interface PdbExpressionInfo {
  hostOrganism: string | null; hostOrganismStrain: string | null;
  sourceOrganism: string | null; vectorType: string | null; plasmidName: string | null;
}

async function fetchExpressionFromPDB(pdbId: string): Promise<PdbExpressionInfo | null> {
  try {
    const res = await fetch(`${PDB_API}/polymer_entity/${pdbId.toLowerCase()}/1`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const entity = await res.json();
    const srcGen = entity?.entity_src_gen;
    if (!srcGen || !Array.isArray(srcGen) || srcGen.length === 0) {
      const srcNat = entity?.entity_src_nat;
      if (srcNat && Array.isArray(srcNat) && srcNat.length > 0) {
        return { hostOrganism: null, hostOrganismStrain: null, sourceOrganism: srcNat[0].pdbx_organism_scientific || null, vectorType: null, plasmidName: null };
      }
      return null;
    }
    const gen = srcGen[0];
    return {
      hostOrganism: gen.pdbx_host_org_scientific_name || null,
      hostOrganismStrain: gen.pdbx_host_org_strain || null,
      sourceOrganism: gen.pdbx_gene_src_scientific_name || null,
      vectorType: gen.host_org_vector_type || null,
      plasmidName: gen.plasmid_name || null,
    };
  } catch { return null; }
}

async function processWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
      await sleep(API_DELAY_MS);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  await client.connect();
  try {
    const { limit, offset, concurrency, dryRun } = parseArgs();

    console.log('=== PDB Expression Host 데이터 수집 (Phase D-2) ===');
    console.log(`  limit: ${limit === Infinity ? '전체' : limit}, offset: ${offset}`);
    console.log(`  concurrency: ${concurrency}, dry-run: ${dryRun}\n`);

    // Step 1: Load structures
    console.log('[1] kbsi_structure에서 PDB 엔트리 로드...');
    let structures: StructureRow[] = [];
    let dbOffset = 0;
    const PAGE = 1000;
    while (true) {
      const { rows: data } = await client.query(
        `SELECT construct_id, pdb_id FROM kbsi_structure
         WHERE pdb_id IS NOT NULL ORDER BY construct_id OFFSET $1 LIMIT $2`,
        [dbOffset, PAGE]
      );
      if (!data || data.length === 0) break;
      structures = structures.concat(data);
      if (data.length < PAGE) break;
      dbOffset += PAGE;
    }

    const constructPdbMap = new Map<number, string>();
    for (const s of structures) {
      if (!constructPdbMap.has(s.construct_id)) constructPdbMap.set(s.construct_id, s.pdb_id);
    }
    console.log(`  PDB 구조: ${structures.length}개, 고유 construct: ${constructPdbMap.size}개`);

    // Step 2: Existing expressions
    console.log('\n[2] 기존 expression 레코드 확인...');
    const existingConstructIds = new Set<number>();
    dbOffset = 0;
    while (true) {
      const { rows: data } = await client.query(
        `SELECT construct_id FROM kbsi_expression OFFSET $1 LIMIT $2`,
        [dbOffset, PAGE]
      );
      if (!data || data.length === 0) break;
      for (const r of data) existingConstructIds.add(r.construct_id);
      if (data.length < PAGE) break;
      dbOffset += PAGE;
    }
    console.log(`  기존 expression: ${existingConstructIds.size}개`);

    // Step 3: Filter
    const targets: { constructId: number; pdbId: string }[] = [];
    for (const [constructId, pdbId] of constructPdbMap) {
      if (!existingConstructIds.has(constructId)) targets.push({ constructId, pdbId });
    }
    console.log(`  신규 대상: ${targets.length}개`);

    const sliced = targets.slice(offset, offset + (limit === Infinity ? targets.length : limit));
    console.log(`  처리 예정: ${sliced.length}개 (offset ${offset})\n`);

    if (sliced.length === 0) { console.log('처리할 대상이 없습니다.'); return; }

    // Step 4: Fetch + Insert
    console.log('[3] PDB API에서 expression 정보 수집...');
    const startTime = Date.now();
    let totalInserted = 0, totalSkipped = 0, totalFetchFailed = 0, totalInsertFailed = 0;
    const hostStats = new Map<string, number>();

    for (let batchStart = 0; batchStart < sliced.length; batchStart += BATCH_SIZE) {
      const batch = sliced.slice(batchStart, batchStart + BATCH_SIZE);

      const pdbResults = await processWithConcurrency(batch, concurrency, async (item) => {
        const info = await fetchExpressionFromPDB(item.pdbId);
        return { ...item, info };
      });

      const records: ExpressionRecord[] = [];
      for (const result of pdbResults) {
        if (!result.info) { totalFetchFailed++; continue; }
        const { info } = result;
        const host = normalizeHost(info.hostOrganism);
        const strain = extractStrain(info.hostOrganism, info.hostOrganismStrain);
        if (!host && !info.sourceOrganism) { totalSkipped++; continue; }

        const noteParts: string[] = [];
        if (info.sourceOrganism) noteParts.push(`Source: ${info.sourceOrganism}`);
        if (info.vectorType) noteParts.push(`Vector: ${info.vectorType}`);
        if (info.plasmidName) noteParts.push(`Plasmid: ${info.plasmidName}`);

        const condParts: string[] = [];
        if (info.vectorType) condParts.push(info.vectorType);
        if (info.plasmidName) condParts.push(info.plasmidName);

        records.push({
          construct_id: result.constructId,
          host: host || `Native (${info.sourceOrganism})`,
          strain,
          source_type: 'database',
          source_db: 'PDB',
          source_id: result.pdbId,
          conditions: condParts.length > 0 ? condParts.join(', ') : null,
          notes: noteParts.length > 0 ? noteParts.join('; ') : null,
          is_validated: false,
        });

        const hostKey = host || 'Native/Unknown';
        hostStats.set(hostKey, (hostStats.get(hostKey) || 0) + 1);
      }

      if (records.length > 0 && !dryRun) {
        for (const rec of records) {
          try {
            await client.query(
              `INSERT INTO kbsi_expression (construct_id, host, strain, source_type, source_db, source_id, conditions, notes, is_validated)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [rec.construct_id, rec.host, rec.strain, rec.source_type, rec.source_db, rec.source_id, rec.conditions, rec.notes, rec.is_validated]
            );
            totalInserted++;
          } catch (error: any) {
            totalInsertFailed++;
          }
        }
      } else if (dryRun) {
        totalInserted += records.length;
      }

      const processed = Math.min(batchStart + BATCH_SIZE, sliced.length);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(1);
      if (processed % 2000 === 0 || processed >= sliced.length) {
        console.log(`  진행: ${processed.toLocaleString()}/${sliced.length.toLocaleString()} (삽입: ${totalInserted.toLocaleString()}, 스킵: ${totalSkipped}, 실패: ${totalFetchFailed}) ${elapsed}s (${rate}/s)`);
      }
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(60)}`);
    console.log('=== 완료 ===');
    console.log(`  PDB 구조 (고유 construct): ${constructPdbMap.size.toLocaleString()}`);
    console.log(`  기존 expression:           ${existingConstructIds.size.toLocaleString()}`);
    console.log(`  처리 대상:                 ${sliced.length.toLocaleString()}`);
    console.log(`  삽입${dryRun ? '(예정)' : ''}:                 ${totalInserted.toLocaleString()}`);
    console.log(`  스킵 (정보 없음):          ${totalSkipped.toLocaleString()}`);
    console.log(`  API 실패:                  ${totalFetchFailed.toLocaleString()}`);
    if (totalInsertFailed > 0) console.log(`  DB 삽입 실패:              ${totalInsertFailed.toLocaleString()}`);
    console.log(`  소요 시간:                 ${totalElapsed}s`);

    if (hostStats.size > 0) {
      console.log(`\n--- Host Organism 분포 (상위 15) ---`);
      const sorted = [...hostStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
      const maxCount = sorted[0][1];
      for (const [host, count] of sorted) {
        const pct = ((count / totalInserted) * 100).toFixed(1);
        const bar = '#'.repeat(Math.max(1, Math.round((count / maxCount) * 30)));
        console.log(`  ${host.padEnd(30)} ${count.toString().padStart(7)} (${pct.padStart(5)}%) ${bar}`);
      }
    }

    if (dryRun) console.log('\n  (DRY-RUN 모드 -- 실제 DB 변경 없음)');
    console.log('='.repeat(60));
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('치명적 에러:', e); process.exit(1); });
