/**
 * BMRB에서 backbone chemical shift 데이터 수집 → kbsi_nmr_chemical_shift
 *
 * bmrb_id가 있는 kbsi_nmr_experiment에서 BMRB API로 backbone chemical shift를 가져옴.
 * Backbone atoms: H, N, CA, CB, HA (잔기당 최대 5개)
 *
 * npx tsx scripts/harvest-bmrb-chemical-shifts.ts [옵션]
 *   --limit 100       처리 건수 (기본: 전체)
 *   --offset 0        시작 오프셋
 *   --dry-run         미리보기 (DB 삽입 안 함)
 *   --validate-only   API 응답 검증만 (통계 출력)
 */

import pg from 'pg';

const client = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const BMRB_API = 'https://api.bmrb.io/v2/entry';
const BATCH_SIZE = 10; // BMRB API는 느리므로 작은 배치
const API_DELAY_MS = 500;
const BACKBONE_ATOMS = new Set(['H', 'N', 'CA', 'CB', 'HA']);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ChemShiftRow {
  nmr_experiment_id: number;
  bmrb_id: string;
  seq_id: number;
  comp_id: string;
  atom_id: string;
  atom_type: string;
  chemical_shift: number;
  chemical_shift_err: number | null;
  source_db: string;
  source_id: string;
}

interface BmrbShiftData {
  shifts: ChemShiftRow[];
  totalRaw: number;
  backboneCount: number;
  residueCount: number;
}

async function fetchChemicalShifts(bmrbId: string, nmrExpId: number): Promise<BmrbShiftData | null> {
  try {
    const res = await fetch(`${BMRB_API}/${bmrbId}`, {
      headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const entry = data[bmrbId] || data;
    const saveframes = entry.saveframes || [];

    const shifts: ChemShiftRow[] = [];
    let totalRaw = 0;

    for (const sf of saveframes) {
      if (sf.category !== 'assigned_chemical_shifts') continue;

      for (const loop of sf.loops || []) {
        if (loop.category !== '_Atom_chem_shift') continue;

        const tags: string[] = loop.tags;
        const idxSeq = tags.indexOf('Seq_ID');
        const idxComp = tags.indexOf('Comp_ID');
        const idxAtom = tags.indexOf('Atom_ID');
        const idxType = tags.indexOf('Atom_type');
        const idxVal = tags.indexOf('Val');
        const idxErr = tags.indexOf('Val_err');

        if (idxSeq < 0 || idxComp < 0 || idxAtom < 0 || idxVal < 0) continue;

        for (const row of loop.data) {
          totalRaw++;
          const atomId = row[idxAtom];
          if (!BACKBONE_ATOMS.has(atomId)) continue;

          const val = parseFloat(row[idxVal]);
          if (isNaN(val)) continue;

          const errRaw = idxErr >= 0 ? parseFloat(row[idxErr]) : NaN;

          shifts.push({
            nmr_experiment_id: nmrExpId,
            bmrb_id: bmrbId,
            seq_id: parseInt(row[idxSeq]),
            comp_id: row[idxComp],
            atom_id: atomId,
            atom_type: idxType >= 0 ? row[idxType] : atomId === 'H' || atomId === 'HA' ? 'H' : atomId === 'N' ? 'N' : 'C',
            chemical_shift: val,
            chemical_shift_err: !isNaN(errRaw) ? errRaw : null,
            source_db: 'BMRB',
            source_id: bmrbId,
          });
        }
      }
    }

    const residueCount = new Set(shifts.map(s => s.seq_id)).size;

    return { shifts, totalRaw, backboneCount: shifts.length, residueCount };
  } catch {
    return null;
  }
}

async function insertShiftBatch(shifts: ChemShiftRow[]): Promise<{ error: string | null }> {
  if (shifts.length === 0) return { error: null };

  // Build a multi-row INSERT ... ON CONFLICT DO NOTHING
  const cols = ['nmr_experiment_id', 'bmrb_id', 'seq_id', 'comp_id', 'atom_id', 'atom_type', 'chemical_shift', 'chemical_shift_err', 'source_db', 'source_id'];
  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < shifts.length; i++) {
    const s = shifts[i];
    const base = i * cols.length;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`);
    values.push(s.nmr_experiment_id, s.bmrb_id, s.seq_id, s.comp_id, s.atom_id, s.atom_type, s.chemical_shift, s.chemical_shift_err, s.source_db, s.source_id);
  }

  const sql = `INSERT INTO kbsi_nmr_chemical_shift (${cols.join(', ')})
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (bmrb_id, seq_id, atom_id) DO NOTHING`;

  try {
    await client.query(sql, values);
    return { error: null };
  } catch (err: any) {
    return { error: err.message || String(err) };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
  const offsetIdx = args.indexOf('--offset');
  const startOffset = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) : 0;
  const dryRun = args.includes('--dry-run');
  const validateOnly = args.includes('--validate-only');

  console.log(`=== BMRB Chemical Shift Harvester ===`);
  console.log(`Mode: ${validateOnly ? 'VALIDATE ONLY' : dryRun ? 'DRY RUN' : 'LIVE INSERT'}`);
  console.log(`Atoms: ${[...BACKBONE_ATOMS].join(', ')} (backbone only)`);
  console.log(`DB: Lab PostgreSQL (203.255.78.89:15432)\n`);

  await client.connect();

  try {
    // 1. bmrb_id가 있는 NMR experiment 조회
    const PAGE_SIZE = 1000;
    const experiments: { id: number; bmrb_id: string; source_id: string }[] = [];
    for (let off = startOffset; ; off += PAGE_SIZE) {
      const res = await client.query(
        `SELECT id, bmrb_id, source_id FROM kbsi_nmr_experiment
         WHERE bmrb_id IS NOT NULL
         ORDER BY id ASC
         LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, off]
      );
      if (res.rows.length === 0) break;
      experiments.push(...res.rows);
      if (res.rows.length < PAGE_SIZE) break;
      if (limit < Infinity && experiments.length >= limit) break;
    }
    console.log(`NMR experiments with bmrb_id: ${experiments.length}`);

    // 이미 chemical shift가 있는 bmrb_id 확인 (중복 방지)
    const existingBmrb = new Set<string>();
    {
      const res = await client.query(
        `SELECT DISTINCT bmrb_id FROM kbsi_nmr_chemical_shift`
      );
      for (const row of res.rows) {
        existingBmrb.add(row.bmrb_id);
      }
    }

    // 중복 bmrb_id 제거 (같은 bmrb_id가 여러 experiment에 연결될 수 있음)
    const seenBmrb = new Set<string>();
    const toProcess: { id: number; bmrb_id: string; source_id: string }[] = [];
    for (const exp of experiments) {
      if (existingBmrb.has(exp.bmrb_id)) continue;
      if (seenBmrb.has(exp.bmrb_id)) continue;
      seenBmrb.add(exp.bmrb_id);
      toProcess.push(exp);
    }

    const processLimit = Math.min(toProcess.length, limit === Infinity ? toProcess.length : limit);
    console.log(`Already imported: ${existingBmrb.size}`);
    console.log(`Unique BMRB IDs to process: ${toProcess.length}`);
    console.log(`Processing: ${processLimit}\n`);

    if (processLimit === 0) {
      console.log('Nothing to do.');
      return;
    }

    // 통계
    const stats = {
      processed: 0,
      apiSuccess: 0,
      apiFail: 0,
      noShifts: 0,
      totalBackbone: 0,
      totalRaw: 0,
      inserted: 0,
      insertErrors: 0,
      residueCounts: [] as number[],
      compDistribution: {} as Record<string, number>,
      atomDistribution: {} as Record<string, number>,
    };

    for (let i = 0; i < processLimit; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, Math.min(i + BATCH_SIZE, processLimit));

      for (const exp of batch) {
        stats.processed++;

        const result = await fetchChemicalShifts(exp.bmrb_id, exp.id);
        if (!result) {
          stats.apiFail++;
          continue;
        }
        stats.apiSuccess++;
        stats.totalRaw += result.totalRaw;
        stats.totalBackbone += result.backboneCount;

        if (result.shifts.length === 0) {
          stats.noShifts++;
          continue;
        }

        stats.residueCounts.push(result.residueCount);

        // 통계 수집
        for (const s of result.shifts) {
          stats.compDistribution[s.comp_id] = (stats.compDistribution[s.comp_id] || 0) + 1;
          stats.atomDistribution[s.atom_id] = (stats.atomDistribution[s.atom_id] || 0) + 1;
        }

        if (validateOnly) continue;

        if (dryRun) {
          if (stats.inserted < 3) {
            console.log(`[DRY] BMRB ${exp.bmrb_id}: ${result.backboneCount} backbone shifts, ${result.residueCount} residues`);
            console.log(`  Sample: ${result.shifts[0].comp_id}${result.shifts[0].seq_id} ${result.shifts[0].atom_id} = ${result.shifts[0].chemical_shift} ppm`);
          }
          stats.inserted++;
          continue;
        }

        // DB 삽입 (배치)
        const INSERT_BATCH = 200;
        for (let j = 0; j < result.shifts.length; j += INSERT_BATCH) {
          const chunk = result.shifts.slice(j, j + INSERT_BATCH);
          const { error } = await insertShiftBatch(chunk);

          if (error) {
            stats.insertErrors++;
            if (stats.insertErrors <= 3) console.error(`  [ERR] BMRB ${exp.bmrb_id}: ${error}`);
          }
        }
        stats.inserted++;
      }

      const pct = Math.round(Math.min(i + batch.length, processLimit) / processLimit * 100);
      process.stdout.write(`\r  Progress: ${Math.min(i + batch.length, processLimit)}/${processLimit} (${pct}%) | api=${stats.apiSuccess}/${stats.processed} shifts=${stats.totalBackbone} entries=${stats.inserted}`);

      if (i + BATCH_SIZE < processLimit) await sleep(API_DELAY_MS);
    }

    console.log('\n');

    // ── 리포트 ──
    console.log('=== RESULTS ===');
    console.log(`  Processed:       ${stats.processed}`);
    console.log(`  API success:     ${stats.apiSuccess}`);
    console.log(`  API fail:        ${stats.apiFail}`);
    console.log(`  No shifts:       ${stats.noShifts}`);
    console.log(`  Entries stored:  ${stats.inserted}`);
    console.log(`  Insert errors:   ${stats.insertErrors}`);
    console.log(`  Total raw:       ${stats.totalRaw.toLocaleString()}`);
    console.log(`  Backbone only:   ${stats.totalBackbone.toLocaleString()}`);
    console.log(`  Ratio:           ${stats.totalRaw > 0 ? Math.round(stats.totalBackbone / stats.totalRaw * 100) : 0}%`);
    console.log();

    if (stats.residueCounts.length > 0) {
      const sorted = stats.residueCounts.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
      console.log('=== RESIDUE COUNTS ===');
      console.log(`  Entries: ${sorted.length}`);
      console.log(`  Median:  ${median}`);
      console.log(`  Average: ${avg}`);
      console.log(`  Min:     ${sorted[0]}`);
      console.log(`  Max:     ${sorted[sorted.length - 1]}`);
      console.log();
    }

    if (Object.keys(stats.atomDistribution).length > 0) {
      console.log('=== ATOM DISTRIBUTION ===');
      for (const [k, v] of Object.entries(stats.atomDistribution).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${k.padEnd(4)} ${v.toLocaleString()}`);
      }
      console.log();
    }

    if (Object.keys(stats.compDistribution).length > 0) {
      console.log('=== TOP RESIDUE TYPES ===');
      const sorted = Object.entries(stats.compDistribution).sort((a, b) => b[1] - a[1]);
      for (const [k, v] of sorted.slice(0, 15)) {
        console.log(`  ${k.padEnd(5)} ${v.toLocaleString()}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch(console.error);
