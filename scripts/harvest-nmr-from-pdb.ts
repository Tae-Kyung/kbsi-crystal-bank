/**
 * PDB에서 NMR 실험 메타데이터 추출 -> kbsi_nmr_experiment + kbsi_nmr_spectrum 적재
 *
 * npx tsx scripts/harvest-nmr-from-pdb.ts [옵션]
 *   --limit 100       처리 건수 (기본: 전체)
 *   --offset 0        시작 오프셋 (기본: 0)
 *   --dry-run         미리보기 (DB 삽입 안 함)
 *   --validate-only   PDB API 응답 검증만
 *   --backfill        기존 레코드에 새 필드 채우기
 */

import pg from 'pg';

const pgClient = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const PDB_API = 'https://data.rcsb.org/rest/v1/core/entry';
const BATCH_SIZE = 50;
const API_DELAY_MS = 200;

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

interface StructureRow { id: number; construct_id: number; pdb_id: string; reference_id: number | null; }
interface NmrExperimentRecord {
  construct_id: number; source_type: 'database'; source_db: string; source_id: string;
  spectrometer: string | null; magnetic_field: number | null; temperature: number | null;
  labelling: string | null; bmrb_id: string | null; sample_ph: number | null;
  ionic_strength: string | null; pressure: string | null;
  conformers_calculated: number | null; conformers_submitted: number | null;
  reference_id: number | null; is_validated: boolean; notes: string | null;
}
interface NmrSpectrumRecord { nmr_experiment_id: number; spectrum_type: string; }

interface PdbNmrData {
  spectrometers: { type: string; field_strength: number | null; manufacturer: string | null }[];
  experiments: { type: string; conditions_id: string | null }[];
  conditions: { id: string; temperature: number | null; temperature_units: string | null; ph: string | null; ionic_strength: string | null; pressure: string | null }[];
  labelling: string | null; bmrb_id: string | null;
  ensemble: { conformers_calculated: number | null; conformers_submitted: number | null } | null;
}

async function fetchNmrData(pdbId: string): Promise<PdbNmrData | null> {
  try {
    const res = await fetch(`${PDB_API}/${pdbId.toLowerCase()}`, { headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' } });
    if (!res.ok) return null;
    const entry = await res.json();
    const methods = entry.exptl?.map((e: any) => e.method) || [];
    if (!methods.some((m: string) => m?.includes('NMR'))) return null;

    const spectrometers = (entry.pdbx_nmr_spectrometer || []).map((s: any) => ({
      type: s.type || [s.manufacturer, s.model].filter(Boolean).join(' ') || null,
      field_strength: s.field_strength != null ? Number(s.field_strength) : null,
      manufacturer: s.manufacturer || null,
    }));
    const experiments = (entry.pdbx_nmr_exptl || []).map((e: any) => ({ type: e.type || 'unknown', conditions_id: e.conditions_id || null }));
    const conditions = (entry.pdbx_nmr_exptl_sample_conditions || []).map((c: any) => ({
      id: c.conditions_id || '1', temperature: c.temperature != null ? Number(c.temperature) : null,
      temperature_units: c.temperature_units || 'K', ph: c.pH || null,
      ionic_strength: c.ionic_strength || null, pressure: c.pressure || null,
    }));
    const ens = entry.pdbx_nmr_ensemble;
    const ensemble = ens ? { conformers_calculated: ens.conformers_calculated_total_number != null ? Number(ens.conformers_calculated_total_number) : null, conformers_submitted: ens.conformers_submitted_total_number != null ? Number(ens.conformers_submitted_total_number) : null } : null;

    let labelling: string | null = null;
    const sampleDetails = entry.pdbx_nmr_sample_details;
    if (Array.isArray(sampleDetails)) {
      const labels: string[] = [];
      for (const sd of sampleDetails) {
        const contents = sd.contents || '';
        const bracketMatch = contents.match(/\[([^\]]*(?:13C|15N|2H)[^\]]*)\]/i);
        if (bracketMatch) { labels.push(bracketMatch[1].trim()); }
        else {
          const isotopes: string[] = [];
          if (/15N/i.test(contents)) isotopes.push('15N');
          if (/13C/i.test(contents)) isotopes.push('13C');
          if (/(?:^|[^A-Z])2H(?:[^A-Z]|$)/i.test(contents)) isotopes.push('2H');
          if (isotopes.length > 0) { const uniform = /U-/i.test(contents) ? 'U-' : ''; labels.push(`${uniform}${isotopes.join(', ')}`); }
        }
      }
      if (labels.length > 0) labelling = [...new Set(labels)].join('; ');
    }

    let bmrb_id: string | null = null;
    const related = entry.pdbx_database_related;
    if (Array.isArray(related)) {
      for (const rel of related) { if (rel.db_name === 'BMRB') { bmrb_id = rel.db_id || null; break; } }
    }
    return { spectrometers, experiments, conditions, labelling, bmrb_id, ensemble };
  } catch { return null; }
}

function toTemperatureCelsius(temp: number | null, units: string | null): number | null {
  if (temp == null) return null;
  let celsius: number;
  if (units === 'K' || (!units && temp > 200)) { celsius = temp < 200 ? temp : temp - 273.15; }
  else { celsius = temp; }
  if (celsius < -20 || celsius > 100) return null;
  return Math.round(celsius * 10) / 10;
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round(n / total * 100)}%`;
}

async function main() {
  await pgClient.connect();
  try {
    const args = process.argv.slice(2);
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;
    const offsetIdx = args.indexOf('--offset');
    const startOffset = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) : 0;
    const dryRun = args.includes('--dry-run');
    const validateOnly = args.includes('--validate-only');
    const backfill = args.includes('--backfill');

    console.log(`=== NMR Experiment Harvester ===`);
    console.log(`Mode: ${backfill ? 'BACKFILL' : validateOnly ? 'VALIDATE ONLY' : dryRun ? 'DRY RUN' : 'LIVE INSERT'}`);

    if (backfill) { await runBackfill(limit, dryRun); return; }

    // 1. NMR 구조 목록 조회
    const PAGE_SIZE = 1000;
    const structures: StructureRow[] = [];
    for (let off = startOffset; ; off += PAGE_SIZE) {
      const { rows: data } = await pgClient.query(
        `SELECT id, construct_id, pdb_id, reference_id FROM kbsi_structure
         WHERE method = $1 AND pdb_id IS NOT NULL ORDER BY id OFFSET $2 LIMIT $3`,
        ['NMR', off, PAGE_SIZE]
      );
      if (!data || data.length === 0) break;
      structures.push(...data);
      if (data.length < PAGE_SIZE) break;
      if (limit < Infinity && structures.length >= limit) break;
    }
    if (structures.length === 0) { console.log('No NMR structures found.'); return; }
    console.log(`Loaded ${structures.length} NMR structures from DB`);

    // 이미 존재하는 source_id 확인
    const pdbIds = structures.map(s => s.pdb_id);
    const existingSourceIds = new Set<string>();
    for (let i = 0; i < pdbIds.length; i += 500) {
      const chunk = pdbIds.slice(i, i + 500);
      const { rows: existing } = await pgClient.query(
        'SELECT source_id FROM kbsi_nmr_experiment WHERE source_id = ANY($1)', [chunk]
      );
      existing?.forEach((r: any) => existingSourceIds.add(r.source_id));
    }

    const toProcess = structures.filter(s => !existingSourceIds.has(s.pdb_id));
    console.log(`Structures: ${structures.length} total, ${existingSourceIds.size} already imported, ${toProcess.length} to process`);
    if (toProcess.length === 0) { console.log('Nothing to do.'); return; }

    const stats = { processed: 0, apiSuccess: 0, apiFail: 0, inserted: 0, spectraInserted: 0,
      noSpectrometer: 0, noConditions: 0, noExperiments: 0, temperatureDistribution: {} as Record<string, number>,
      fieldStrengthDistribution: {} as Record<string, number>, spectrumTypeDistribution: {} as Record<string, number>,
      labellingCount: 0, bmrbCount: 0, phCount: 0, ionicStrengthCount: 0, ensembleCount: 0,
      phDistribution: {} as Record<string, number>, conformerDistribution: {} as Record<string, number> };

    const processLimit = Math.min(toProcess.length, limit === Infinity ? toProcess.length : limit);
    console.log(`Processing ${processLimit} entries...\n`);

    for (let i = 0; i < processLimit; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, Math.min(i + BATCH_SIZE, processLimit));
      for (const structure of batch) {
        stats.processed++;
        const nmrData = await fetchNmrData(structure.pdb_id);
        if (!nmrData) { stats.apiFail++; continue; }
        stats.apiSuccess++;

        if (nmrData.spectrometers.length === 0) stats.noSpectrometer++;
        if (nmrData.conditions.length === 0) stats.noConditions++;
        if (nmrData.experiments.length === 0) stats.noExperiments++;
        if (nmrData.labelling) stats.labellingCount++;
        if (nmrData.bmrb_id) stats.bmrbCount++;

        const cond0 = nmrData.conditions[0];
        if (cond0?.ph && cond0.ph !== '0') { stats.phCount++; const phVal = parseFloat(cond0.ph); if (!isNaN(phVal)) { const bucket = `${(Math.round(phVal * 2) / 2).toFixed(1)}`; stats.phDistribution[bucket] = (stats.phDistribution[bucket] || 0) + 1; } }
        if (cond0?.ionic_strength) stats.ionicStrengthCount++;
        if (nmrData.ensemble) { stats.ensembleCount++; const sub = nmrData.ensemble.conformers_submitted; if (sub != null) { const bucket = sub <= 1 ? '1' : sub <= 10 ? '2-10' : sub <= 20 ? '11-20' : sub <= 50 ? '21-50' : '51+'; stats.conformerDistribution[bucket] = (stats.conformerDistribution[bucket] || 0) + 1; } }
        for (const spec of nmrData.spectrometers) { if (spec.field_strength) { const bucket = `${Math.round(spec.field_strength)} MHz`; stats.fieldStrengthDistribution[bucket] = (stats.fieldStrengthDistribution[bucket] || 0) + 1; } }
        for (const exp of nmrData.experiments) { const t = exp.type || 'unknown'; stats.spectrumTypeDistribution[t] = (stats.spectrumTypeDistribution[t] || 0) + 1; }

        const cond = nmrData.conditions[0];
        const tempC = cond ? toTemperatureCelsius(cond.temperature, cond.temperature_units) : null;
        if (tempC != null) { const bucket = `${Math.round(tempC / 5) * 5}C`; stats.temperatureDistribution[bucket] = (stats.temperatureDistribution[bucket] || 0) + 1; }

        if (validateOnly) continue;

        const mainSpec = nmrData.spectrometers.sort((a, b) => (b.field_strength || 0) - (a.field_strength || 0))[0];
        const samplePh = cond?.ph && cond.ph !== '0' ? parseFloat(cond.ph) : null;

        const record: NmrExperimentRecord = {
          construct_id: structure.construct_id, source_type: 'database', source_db: 'PDB', source_id: structure.pdb_id,
          spectrometer: mainSpec?.type || null, magnetic_field: mainSpec?.field_strength || null, temperature: tempC,
          labelling: nmrData.labelling, bmrb_id: nmrData.bmrb_id,
          sample_ph: samplePh != null && !isNaN(samplePh) ? samplePh : null,
          ionic_strength: cond?.ionic_strength || null, pressure: cond?.pressure || null,
          conformers_calculated: nmrData.ensemble?.conformers_calculated ?? null,
          conformers_submitted: nmrData.ensemble?.conformers_submitted ?? null,
          reference_id: structure.reference_id, is_validated: false,
          notes: nmrData.spectrometers.length > 1 ? `${nmrData.spectrometers.length} spectrometers used: ${nmrData.spectrometers.map(s => `${s.field_strength || '?'} MHz`).join(', ')}` : null,
        };

        if (dryRun) { stats.inserted++; stats.spectraInserted += nmrData.experiments.length; continue; }

        try {
          const { rows: [inserted] } = await pgClient.query(
            `INSERT INTO kbsi_nmr_experiment (construct_id, source_type, source_db, source_id, spectrometer, magnetic_field, temperature, labelling, bmrb_id, sample_ph, ionic_strength, pressure, conformers_calculated, conformers_submitted, reference_id, is_validated, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
            [record.construct_id, record.source_type, record.source_db, record.source_id, record.spectrometer, record.magnetic_field, record.temperature, record.labelling, record.bmrb_id, record.sample_ph, record.ionic_strength, record.pressure, record.conformers_calculated, record.conformers_submitted, record.reference_id, record.is_validated, record.notes]
          );
          stats.inserted++;
          if (nmrData.experiments.length > 0 && inserted) {
            for (const e of nmrData.experiments) {
              try {
                await pgClient.query('INSERT INTO kbsi_nmr_spectrum (nmr_experiment_id, spectrum_type) VALUES ($1, $2)', [inserted.id, e.type]);
                stats.spectraInserted++;
              } catch (specErr: any) { console.error(`  [ERR] spectra ${structure.pdb_id}: ${specErr.message}`); }
            }
          }
        } catch (insErr: any) { console.error(`  [ERR] ${structure.pdb_id}: ${insErr.message}`); }
      }

      const pctDone = Math.round(Math.min(i + batch.length, processLimit) / processLimit * 100);
      process.stdout.write(`\r  Progress: ${Math.min(i + batch.length, processLimit)}/${processLimit} (${pctDone}%) | inserted=${stats.inserted} spectra=${stats.spectraInserted} apiFail=${stats.apiFail}`);
      if (i + BATCH_SIZE < processLimit) await sleep(API_DELAY_MS);
    }

    console.log('\n\n=== RESULTS ===');
    console.log(`  Processed: ${stats.processed}  API success: ${stats.apiSuccess}  API fail: ${stats.apiFail}`);
    console.log(`  Experiments: ${stats.inserted}  Spectra: ${stats.spectraInserted}`);
    console.log(`  No spectrometer: ${stats.noSpectrometer}  Has labelling: ${stats.labellingCount}  Has BMRB: ${stats.bmrbCount}`);
    console.log(`  Has pH: ${stats.phCount}  Has ionic str: ${stats.ionicStrengthCount}  Has ensemble: ${stats.ensembleCount}`);
  } finally {
    await pgClient.end();
  }
}

async function runBackfill(limit: number, dryRun: boolean) {
  console.log(`Backfill mode: update existing records with pH, ionic_strength, pressure, conformers`);
  const PAGE_SIZE = 1000;
  const records: { id: number; source_id: string }[] = [];
  for (let off = 0; ; off += PAGE_SIZE) {
    const { rows: data } = await pgClient.query(
      `SELECT id, source_id FROM kbsi_nmr_experiment
       WHERE sample_ph IS NULL AND conformers_submitted IS NULL AND source_id IS NOT NULL
       ORDER BY id OFFSET $1 LIMIT $2`,
      [off, PAGE_SIZE]
    );
    if (!data || data.length === 0) break;
    records.push(...data);
    if (data.length < PAGE_SIZE) break;
    if (limit < Infinity && records.length >= limit) break;
  }

  const processLimit = Math.min(records.length, limit === Infinity ? records.length : limit);
  console.log(`Found ${records.length} records to backfill, processing ${processLimit}\n`);
  if (processLimit === 0) { console.log('Nothing to backfill.'); return; }

  let updated = 0, skipped = 0, apiFail = 0;
  for (let i = 0; i < processLimit; i += BATCH_SIZE) {
    const batch = records.slice(i, Math.min(i + BATCH_SIZE, processLimit));
    for (const rec of batch) {
      const nmrData = await fetchNmrData(rec.source_id);
      if (!nmrData) { apiFail++; continue; }
      const cond = nmrData.conditions[0];
      const phRaw = cond?.ph && cond.ph !== '0' ? parseFloat(cond.ph) : null;
      const samplePh = phRaw != null && !isNaN(phRaw) ? phRaw : null;
      const ionicStrength = cond?.ionic_strength || null;
      const pressure = cond?.pressure || null;
      const conformersCalc = nmrData.ensemble?.conformers_calculated ?? null;
      const conformersSub = nmrData.ensemble?.conformers_submitted ?? null;
      if (samplePh == null && ionicStrength == null && conformersSub == null) { skipped++; continue; }

      if (!dryRun) {
        try {
          await pgClient.query(
            `UPDATE kbsi_nmr_experiment SET sample_ph=$1, ionic_strength=$2, pressure=$3, conformers_calculated=$4, conformers_submitted=$5 WHERE id=$6`,
            [samplePh, ionicStrength, pressure, conformersCalc, conformersSub, rec.id]
          );
          updated++;
        } catch (upErr: any) { console.error(`  [ERR] ${rec.source_id}: ${upErr.message}`); }
      } else { updated++; }
    }
    const pctDone = Math.round(Math.min(i + batch.length, processLimit) / processLimit * 100);
    process.stdout.write(`\r  Progress: ${Math.min(i + batch.length, processLimit)}/${processLimit} (${pctDone}%) | updated=${updated} skipped=${skipped} apiFail=${apiFail}`);
    if (i + BATCH_SIZE < processLimit) await sleep(API_DELAY_MS);
  }
  console.log(`\n\n=== BACKFILL RESULTS ===\n  Processed: ${processLimit}  Updated: ${updated}  Skipped: ${skipped}  API fail: ${apiFail}`);
}

main().catch(console.error);
