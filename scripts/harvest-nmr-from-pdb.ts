/**
 * PDB에서 NMR 실험 메타데이터 추출 → kbsi_nmr_experiment + kbsi_nmr_spectrum 적재
 *
 * kbsi_structure에서 method='NMR'인 엔트리의 pdb_id를 대상으로
 * RCSB REST API에서 spectrometer, field_strength, temperature, labelling,
 * spectrum_type 등을 수집.
 *
 * npx tsx scripts/harvest-nmr-from-pdb.ts [옵션]
 *   --limit 100       처리 건수 (기본: 전체)
 *   --offset 0        시작 오프셋 (기본: 0)
 *   --dry-run         미리보기 (DB 삽입 안 함)
 *   --validate-only   PDB API 응답 검증만 (DB 삽입 안 함, 통계 출력)
 *   --backfill        기존 레코드에 sample_ph/ionic_strength/conformers 등 새 필드 채우기
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PDB_API = 'https://data.rcsb.org/rest/v1/core/entry';
const BATCH_SIZE = 50;
const API_DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 타입 정의 ──

interface StructureRow {
  id: number;
  construct_id: number;
  pdb_id: string;
  reference_id: number | null;
}

interface NmrExperimentRecord {
  construct_id: number;
  source_type: 'database';
  source_db: string;
  source_id: string;
  spectrometer: string | null;
  magnetic_field: number | null;
  temperature: number | null;
  labelling: string | null;
  bmrb_id: string | null;
  sample_ph: number | null;
  ionic_strength: string | null;
  pressure: string | null;
  conformers_calculated: number | null;
  conformers_submitted: number | null;
  reference_id: number | null;
  is_validated: boolean;
  notes: string | null;
}

interface NmrSpectrumRecord {
  nmr_experiment_id: number;
  spectrum_type: string;
}

// ── PDB API 파싱 ──

interface PdbNmrData {
  spectrometers: { type: string; field_strength: number | null; manufacturer: string | null }[];
  experiments: { type: string; conditions_id: string | null }[];
  conditions: { id: string; temperature: number | null; temperature_units: string | null; ph: string | null; ionic_strength: string | null; pressure: string | null }[];
  labelling: string | null;
  bmrb_id: string | null;
  ensemble: { conformers_calculated: number | null; conformers_submitted: number | null } | null;
}

async function fetchNmrData(pdbId: string): Promise<PdbNmrData | null> {
  try {
    const res = await fetch(`${PDB_API}/${pdbId.toLowerCase()}`, {
      headers: { 'User-Agent': 'KBSI-CrystalBank/1.0' },
    });
    if (!res.ok) return null;
    const entry = await res.json();

    // Verify it's actually NMR
    const methods = entry.exptl?.map((e: any) => e.method) || [];
    if (!methods.some((m: string) => m?.includes('NMR'))) return null;

    // Spectrometers
    const spectrometers = (entry.pdbx_nmr_spectrometer || []).map((s: any) => ({
      type: s.type || [s.manufacturer, s.model].filter(Boolean).join(' ') || null,
      field_strength: s.field_strength != null ? Number(s.field_strength) : null,
      manufacturer: s.manufacturer || null,
    }));

    // Experiments (spectrum types)
    const experiments = (entry.pdbx_nmr_exptl || []).map((e: any) => ({
      type: e.type || 'unknown',
      conditions_id: e.conditions_id || null,
    }));

    // Sample conditions
    const conditions = (entry.pdbx_nmr_exptl_sample_conditions || []).map((c: any) => ({
      id: c.conditions_id || '1',
      temperature: c.temperature != null ? Number(c.temperature) : null,
      temperature_units: c.temperature_units || 'K',
      ph: c.pH || null,
      ionic_strength: c.ionic_strength || null,
      pressure: c.pressure || null,
    }));

    // Ensemble (conformer count)
    const ens = entry.pdbx_nmr_ensemble;
    const ensemble = ens ? {
      conformers_calculated: ens.conformers_calculated_total_number != null ? Number(ens.conformers_calculated_total_number) : null,
      conformers_submitted: ens.conformers_submitted_total_number != null ? Number(ens.conformers_submitted_total_number) : null,
    } : null;

    // Labelling — from pdbx_nmr_sample_details.contents
    // Formats vary: "[U-100% 13C; U-100% 15N]", "U-13C,15N", "13C, 15N-labeled"
    let labelling: string | null = null;
    const sampleDetails = entry.pdbx_nmr_sample_details;
    if (Array.isArray(sampleDetails)) {
      const labels: string[] = [];
      for (const sd of sampleDetails) {
        const contents = sd.contents || '';
        // Try bracket format first: [U-100% 13C; U-100% 15N]
        const bracketMatch = contents.match(/\[([^\]]*(?:13C|15N|2H)[^\]]*)\]/i);
        if (bracketMatch) {
          labels.push(bracketMatch[1].trim());
        } else {
          // Detect isotope mentions without brackets
          const isotopes: string[] = [];
          if (/15N/i.test(contents)) isotopes.push('15N');
          if (/13C/i.test(contents)) isotopes.push('13C');
          if (/(?:^|[^A-Z])2H(?:[^A-Z]|$)/i.test(contents)) isotopes.push('2H');
          if (isotopes.length > 0) {
            const uniform = /U-/i.test(contents) ? 'U-' : '';
            labels.push(`${uniform}${isotopes.join(', ')}`);
          }
        }
      }
      if (labels.length > 0) labelling = [...new Set(labels)].join('; ');
    }

    // BMRB ID
    let bmrb_id: string | null = null;
    const related = entry.pdbx_database_related;
    if (Array.isArray(related)) {
      for (const rel of related) {
        if (rel.db_name === 'BMRB') {
          bmrb_id = rel.db_id || null;
          break;
        }
      }
    }

    return { spectrometers, experiments, conditions, labelling, bmrb_id, ensemble };
  } catch {
    return null;
  }
}

/**
 * 온도 → Celsius 변환
 * PDB는 대부분 Kelvin (273+), 일부 Celsius로 기록.
 * 단위가 K인데 값이 < 200이면 PDB 오류 (Celsius 값을 K로 잘못 표기).
 * NMR 실험 온도는 실질적으로 -10°C ~ 80°C 범위.
 */
function toTemperatureCelsius(temp: number | null, units: string | null): number | null {
  if (temp == null) return null;

  let celsius: number;
  if (units === 'K' || (!units && temp > 200)) {
    // K 단위이지만 값이 < 200이면 PDB 오류 → Celsius로 간주
    if (temp < 200) {
      celsius = temp; // 이미 Celsius인데 K로 잘못 표기된 경우
    } else {
      celsius = temp - 273.15;
    }
  } else {
    celsius = temp;
  }

  // Sanity check: NMR 실험 범위 밖이면 NULL
  if (celsius < -20 || celsius > 100) return null;

  return Math.round(celsius * 10) / 10;
}

// ── 메인 ──

async function main() {
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

  if (backfill) {
    await runBackfill(limit, dryRun);
    return;
  }

  // 1. NMR 구조 목록 조회 (페이지네이션)
  const PAGE_SIZE = 1000;
  const structures: StructureRow[] = [];
  for (let off = startOffset; ; off += PAGE_SIZE) {
    const { data, error: structErr } = await supabase
      .from('kbsi_structure')
      .select('id, construct_id, pdb_id, reference_id')
      .eq('method', 'NMR')
      .not('pdb_id', 'is', null)
      .order('id', { ascending: true })
      .range(off, off + PAGE_SIZE - 1);

    if (structErr) {
      console.error('Failed to load structures:', structErr.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    structures.push(...(data as StructureRow[]));
    if (data.length < PAGE_SIZE) break;
    if (limit < Infinity && structures.length >= limit) break;
  }

  if (structures.length === 0) {
    console.log('No NMR structures found.');
    return;
  }
  console.log(`Loaded ${structures.length} NMR structures from DB`);

  // 이미 존재하는 source_id 확인 (중복 방지)
  const pdbIds = structures.map((s: any) => s.pdb_id);
  const existingSourceIds = new Set<string>();
  for (let i = 0; i < pdbIds.length; i += 500) {
    const chunk = pdbIds.slice(i, i + 500);
    const { data: existing } = await supabase
      .from('kbsi_nmr_experiment')
      .select('source_id')
      .in('source_id', chunk);
    existing?.forEach((r: any) => existingSourceIds.add(r.source_id));
  }

  const toProcess = structures.filter((s: any) => !existingSourceIds.has(s.pdb_id));
  console.log(`Structures: ${structures.length} total, ${existingSourceIds.size} already imported, ${toProcess.length} to process`);

  if (toProcess.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // 통계
  const stats = {
    processed: 0,
    apiSuccess: 0,
    apiFail: 0,
    inserted: 0,
    spectraInserted: 0,
    noSpectrometer: 0,
    noConditions: 0,
    noExperiments: 0,
    temperatureDistribution: {} as Record<string, number>,
    fieldStrengthDistribution: {} as Record<string, number>,
    spectrumTypeDistribution: {} as Record<string, number>,
    labellingCount: 0,
    bmrbCount: 0,
    phCount: 0,
    ionicStrengthCount: 0,
    ensembleCount: 0,
    phDistribution: {} as Record<string, number>,
    conformerDistribution: {} as Record<string, number>,
  };

  const processLimit = Math.min(toProcess.length, limit === Infinity ? toProcess.length : limit);
  console.log(`Processing ${processLimit} entries...\n`);

  for (let i = 0; i < processLimit; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, Math.min(i + BATCH_SIZE, processLimit));

    for (const structure of batch) {
      stats.processed++;
      const pdbId = structure.pdb_id;

      const nmrData = await fetchNmrData(pdbId);
      if (!nmrData) {
        stats.apiFail++;
        continue;
      }
      stats.apiSuccess++;

      // 통계 수집
      if (nmrData.spectrometers.length === 0) stats.noSpectrometer++;
      if (nmrData.conditions.length === 0) stats.noConditions++;
      if (nmrData.experiments.length === 0) stats.noExperiments++;
      if (nmrData.labelling) stats.labellingCount++;
      if (nmrData.bmrb_id) stats.bmrbCount++;

      // Sample conditions 통계
      const cond0 = nmrData.conditions[0];
      if (cond0?.ph && cond0.ph !== '0') {
        stats.phCount++;
        const phVal = parseFloat(cond0.ph);
        if (!isNaN(phVal)) {
          const bucket = `${(Math.round(phVal * 2) / 2).toFixed(1)}`;
          stats.phDistribution[bucket] = (stats.phDistribution[bucket] || 0) + 1;
        }
      }
      if (cond0?.ionic_strength) stats.ionicStrengthCount++;

      // Ensemble 통계
      if (nmrData.ensemble) {
        stats.ensembleCount++;
        const sub = nmrData.ensemble.conformers_submitted;
        if (sub != null) {
          const bucket = sub <= 1 ? '1' : sub <= 10 ? '2-10' : sub <= 20 ? '11-20' : sub <= 50 ? '21-50' : '51+';
          stats.conformerDistribution[bucket] = (stats.conformerDistribution[bucket] || 0) + 1;
        }
      }

      // Field strength 분포
      for (const spec of nmrData.spectrometers) {
        if (spec.field_strength) {
          const bucket = `${Math.round(spec.field_strength)} MHz`;
          stats.fieldStrengthDistribution[bucket] = (stats.fieldStrengthDistribution[bucket] || 0) + 1;
        }
      }

      // Spectrum type 분포
      for (const exp of nmrData.experiments) {
        const t = exp.type || 'unknown';
        stats.spectrumTypeDistribution[t] = (stats.spectrumTypeDistribution[t] || 0) + 1;
      }

      // 온도 (조건 1번 기준)
      const cond = nmrData.conditions[0];
      const tempC = cond ? toTemperatureCelsius(cond.temperature, cond.temperature_units) : null;
      if (tempC != null) {
        const bucket = `${Math.round(tempC / 5) * 5}°C`;
        stats.temperatureDistribution[bucket] = (stats.temperatureDistribution[bucket] || 0) + 1;
      }

      if (validateOnly) continue;

      // 주 spectrometer 선택 (가장 높은 field_strength)
      const mainSpec = nmrData.spectrometers
        .sort((a, b) => (b.field_strength || 0) - (a.field_strength || 0))[0];

      // Sample conditions (pH, ionic_strength, pressure)
      const samplePh = cond?.ph && cond.ph !== '0' ? parseFloat(cond.ph) : null;

      const record: NmrExperimentRecord = {
        construct_id: structure.construct_id,
        source_type: 'database',
        source_db: 'PDB',
        source_id: pdbId,
        spectrometer: mainSpec?.type || null,
        magnetic_field: mainSpec?.field_strength || null,
        temperature: tempC,
        labelling: nmrData.labelling,
        bmrb_id: nmrData.bmrb_id,
        sample_ph: samplePh != null && !isNaN(samplePh) ? samplePh : null,
        ionic_strength: cond?.ionic_strength || null,
        pressure: cond?.pressure || null,
        conformers_calculated: nmrData.ensemble?.conformers_calculated ?? null,
        conformers_submitted: nmrData.ensemble?.conformers_submitted ?? null,
        reference_id: structure.reference_id,
        is_validated: false,
        notes: nmrData.spectrometers.length > 1
          ? `${nmrData.spectrometers.length} spectrometers used: ${nmrData.spectrometers.map(s => `${s.field_strength || '?'} MHz`).join(', ')}`
          : null,
      };

      if (dryRun) {
        if (stats.processed <= 5) {
          console.log(`[DRY] ${pdbId}:`, JSON.stringify(record, null, 2));
          if (nmrData.experiments.length > 0) {
            console.log(`  Spectra: ${nmrData.experiments.map(e => e.type).join(', ')}`);
          }
        }
        stats.inserted++;
        stats.spectraInserted += nmrData.experiments.length;
        continue;
      }

      // DB 삽입: experiment
      const { data: inserted, error: insErr } = await supabase
        .from('kbsi_nmr_experiment')
        .insert(record)
        .select('id')
        .single();

      if (insErr) {
        console.error(`  [ERR] ${pdbId}: ${insErr.message}`);
        continue;
      }

      stats.inserted++;

      // DB 삽입: spectra
      if (nmrData.experiments.length > 0 && inserted) {
        const spectra: NmrSpectrumRecord[] = nmrData.experiments.map((e) => ({
          nmr_experiment_id: inserted.id,
          spectrum_type: e.type,
        }));

        const { error: specErr } = await supabase
          .from('kbsi_nmr_spectrum')
          .insert(spectra);

        if (specErr) {
          console.error(`  [ERR] spectra ${pdbId}: ${specErr.message}`);
        } else {
          stats.spectraInserted += spectra.length;
        }
      }
    }

    // 진행률 출력
    const pct = Math.round(Math.min(i + batch.length, processLimit) / processLimit * 100);
    process.stdout.write(`\r  Progress: ${Math.min(i + batch.length, processLimit)}/${processLimit} (${pct}%) | inserted=${stats.inserted} spectra=${stats.spectraInserted} apiFail=${stats.apiFail}`);

    if (i + BATCH_SIZE < processLimit) await sleep(API_DELAY_MS);
  }

  console.log('\n');

  // ── 검증 리포트 ──
  console.log('=== RESULTS ===');
  console.log(`  Processed:       ${stats.processed}`);
  console.log(`  API success:     ${stats.apiSuccess}`);
  console.log(`  API fail:        ${stats.apiFail}`);
  console.log(`  Experiments:     ${stats.inserted}`);
  console.log(`  Spectra:         ${stats.spectraInserted}`);
  console.log();
  console.log('=== DATA QUALITY ===');
  console.log(`  No spectrometer: ${stats.noSpectrometer} (${pct(stats.noSpectrometer, stats.apiSuccess)})`);
  console.log(`  No conditions:   ${stats.noConditions} (${pct(stats.noConditions, stats.apiSuccess)})`);
  console.log(`  No experiments:  ${stats.noExperiments} (${pct(stats.noExperiments, stats.apiSuccess)})`);
  console.log(`  Has labelling:   ${stats.labellingCount} (${pct(stats.labellingCount, stats.apiSuccess)})`);
  console.log(`  Has BMRB ID:     ${stats.bmrbCount} (${pct(stats.bmrbCount, stats.apiSuccess)})`);
  console.log(`  Has pH:          ${stats.phCount} (${pct(stats.phCount, stats.apiSuccess)})`);
  console.log(`  Has ionic str:   ${stats.ionicStrengthCount} (${pct(stats.ionicStrengthCount, stats.apiSuccess)})`);
  console.log(`  Has ensemble:    ${stats.ensembleCount} (${pct(stats.ensembleCount, stats.apiSuccess)})`);
  console.log();

  if (Object.keys(stats.fieldStrengthDistribution).length > 0) {
    console.log('=== FIELD STRENGTH DISTRIBUTION ===');
    const sorted = Object.entries(stats.fieldStrengthDistribution).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of sorted.slice(0, 15)) {
      console.log(`  ${k.padEnd(12)} ${v}`);
    }
    console.log();
  }

  if (Object.keys(stats.temperatureDistribution).length > 0) {
    console.log('=== TEMPERATURE DISTRIBUTION (Celsius) ===');
    const sorted = Object.entries(stats.temperatureDistribution).sort((a, b) => {
      const na = parseInt(a[0]), nb = parseInt(b[0]);
      return na - nb;
    });
    for (const [k, v] of sorted) {
      console.log(`  ${k.padEnd(10)} ${v}`);
    }
    console.log();
  }

  if (Object.keys(stats.spectrumTypeDistribution).length > 0) {
    console.log('=== TOP SPECTRUM TYPES ===');
    const sorted = Object.entries(stats.spectrumTypeDistribution).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of sorted.slice(0, 20)) {
      console.log(`  ${k.padEnd(40)} ${v}`);
    }
    console.log();
  }

  if (Object.keys(stats.phDistribution).length > 0) {
    console.log('=== pH DISTRIBUTION ===');
    const sorted = Object.entries(stats.phDistribution).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
    for (const [k, v] of sorted) {
      console.log(`  pH ${k.padEnd(6)} ${v}`);
    }
    console.log();
  }

  if (Object.keys(stats.conformerDistribution).length > 0) {
    console.log('=== CONFORMER COUNT DISTRIBUTION ===');
    const order = ['1', '2-10', '11-20', '21-50', '51+'];
    for (const k of order) {
      if (stats.conformerDistribution[k]) {
        console.log(`  ${k.padEnd(10)} ${stats.conformerDistribution[k]}`);
      }
    }
  }
}

// ── Backfill: 기존 레코드에 새 필드(pH, ionic_strength, conformers) 채우기 ──

async function runBackfill(limit: number, dryRun: boolean) {
  console.log(`Backfill mode: update existing records with pH, ionic_strength, pressure, conformers`);
  if (dryRun) console.log('  (DRY RUN — no DB updates)');

  // sample_ph가 NULL인 기존 레코드 조회
  const PAGE_SIZE = 1000;
  const records: { id: number; source_id: string }[] = [];
  for (let off = 0; ; off += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('kbsi_nmr_experiment')
      .select('id, source_id')
      .is('sample_ph', null)
      .is('conformers_submitted', null)
      .not('source_id', 'is', null)
      .order('id', { ascending: true })
      .range(off, off + PAGE_SIZE - 1);

    if (error) { console.error('Query error:', error.message); return; }
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

      // 전부 NULL이면 스킵
      if (samplePh == null && ionicStrength == null && conformersSub == null) {
        skipped++;
        continue;
      }

      if (dryRun) {
        if (updated < 5) {
          console.log(`[DRY] ${rec.source_id}: pH=${samplePh}, ionic=${ionicStrength}, pressure=${pressure}, conf_calc=${conformersCalc}, conf_sub=${conformersSub}`);
        }
        updated++;
        continue;
      }

      const { error: upErr } = await supabase
        .from('kbsi_nmr_experiment')
        .update({
          sample_ph: samplePh,
          ionic_strength: ionicStrength,
          pressure: pressure,
          conformers_calculated: conformersCalc,
          conformers_submitted: conformersSub,
        })
        .eq('id', rec.id);

      if (upErr) {
        console.error(`  [ERR] ${rec.source_id}: ${upErr.message}`);
      } else {
        updated++;
      }
    }

    const pctDone = Math.round(Math.min(i + batch.length, processLimit) / processLimit * 100);
    process.stdout.write(`\r  Progress: ${Math.min(i + batch.length, processLimit)}/${processLimit} (${pctDone}%) | updated=${updated} skipped=${skipped} apiFail=${apiFail}`);

    if (i + BATCH_SIZE < processLimit) await sleep(API_DELAY_MS);
  }

  console.log('\n');
  console.log('=== BACKFILL RESULTS ===');
  console.log(`  Processed: ${processLimit}`);
  console.log(`  Updated:   ${updated}`);
  console.log(`  Skipped:   ${skipped} (all new fields NULL)`);
  console.log(`  API fail:  ${apiFail}`);
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round(n / total * 100)}%`;
}

main().catch(console.error);
