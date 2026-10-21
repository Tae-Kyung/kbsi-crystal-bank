/**
 * ML Feature Export — 예측 모델 학습용 확장 피처 데이터셋 생성
 *
 * 기존 피처 (pH, temp, precipitant, MW, pI, seq_length, organism)
 * + 확장 피처:
 *   - expression_host, tag_name, induction_temp (expression 데이터)
 *   - has_ligand, binding_count, best_kd (리간드 바인딩)
 *   - mutation_count (변이 수)
 *   - characterization_count (특성분석 수)
 *   - organism_category (human/bacteria/yeast/other)
 *   - precipitant_category (PEG/salt/organic/other)
 *
 * npx tsx scripts/export-ml-features.ts                 # JSON 출력
 * npx tsx scripts/export-ml-features.ts --csv            # CSV 출력
 * npx tsx scripts/export-ml-features.ts --limit 10000    # 샘플 수 제한
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'data', 'ml-features');
mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const csvMode = args.includes('--csv');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 50000;

function categorizePrecipitant(type: string | null): string {
  if (!type) return 'unknown';
  const t = type.toLowerCase();
  if (t.includes('peg')) return 'PEG';
  if (t.includes('sulfate') || t.includes('chloride') || t.includes('phosphate') || t.includes('citrate') || t.includes('formate') || t.includes('malonate') || t.includes('acetate') || t.includes('tartrate')) return 'salt';
  if (t.includes('mpd') || t.includes('isopropanol') || t.includes('ethanol') || t.includes('methanol') || t.includes('dmso') || t.includes('glycerol') || t.includes('dioxane')) return 'organic';
  return 'other';
}

function categorizeOrganism(org: string | null): string {
  if (!org) return 'unknown';
  const o = org.toLowerCase();
  if (o.includes('homo sapiens') || o.includes('human')) return 'human';
  if (o.includes('escherichia') || o.includes('e. coli')) return 'ecoli';
  if (o.includes('saccharomyces') || o.includes('yeast')) return 'yeast';
  if (o.includes('mus musculus') || o.includes('mouse')) return 'mouse';
  if (o.includes('thermus') || o.includes('thermococcus') || o.includes('pyrococcus') || o.includes('sulfolobus') || o.includes('thermotoga')) return 'thermophile';
  if (o.includes('staphylococcus') || o.includes('streptococcus') || o.includes('mycobacterium') || o.includes('bacillus') || o.includes('pseudomonas')) return 'bacteria';
  return 'other';
}

async function main() {
  console.log(`Exporting ML features (limit=${LIMIT})...`);

  // Fetch crystallization conditions with protein info
  const { data: records, error } = await supabase
    .from('kbsi_crystallization')
    .select(`
      id, ph, temperature, precipitant_type, outcome, source_type,
      construct_id
    `)
    .not('outcome', 'is', null)
    .not('ph', 'is', null)
    .limit(LIMIT);

  if (error || !records) {
    console.error('Query error:', error?.message);
    return;
  }

  console.log(`  Fetched ${records.length} crystallization records`);

  // Collect unique construct IDs
  const constructIds = [...new Set(records.map(r => r.construct_id))].filter(Boolean);
  console.log(`  Unique constructs: ${constructIds.length}`);

  // Batch fetch construct → protein data
  const constructProteinMap: Record<number, { protein_id: number; tag_name?: string }> = {};
  for (let i = 0; i < constructIds.length; i += 500) {
    const batch = constructIds.slice(i, i + 500);
    const { data: constructs } = await supabase
      .from('kbsi_construct')
      .select('id, protein_id, tag_name')
      .in('id', batch);
    for (const c of constructs || []) {
      constructProteinMap[c.id] = { protein_id: c.protein_id, tag_name: c.tag_name };
    }
  }

  // Batch fetch protein data
  const proteinIds = [...new Set(Object.values(constructProteinMap).map(c => c.protein_id))].filter(Boolean);
  const proteinMap: Record<number, any> = {};
  for (let i = 0; i < proteinIds.length; i += 500) {
    const batch = proteinIds.slice(i, i + 500);
    const { data: proteins } = await supabase
      .from('kbsi_protein')
      .select('id, theoretical_mw, theoretical_pi, organism, residues')
      .in('id', batch);
    for (const p of proteins || []) {
      proteinMap[p.id] = p;
    }
  }

  console.log(`  Proteins loaded: ${Object.keys(proteinMap).length}`);

  // Build feature rows
  const features = records.map(r => {
    const construct = constructProteinMap[r.construct_id] || {};
    const protein = proteinMap[construct.protein_id] || {};

    const isSuccess = ['single_crystal', 'diffraction_quality'].includes(r.outcome);

    return {
      // Target
      success: isSuccess ? 1 : 0,
      outcome: r.outcome,
      source_type: r.source_type,

      // Core features
      ph: r.ph,
      temperature: r.temperature,
      precipitant_type: r.precipitant_type || null,
      precipitant_category: categorizePrecipitant(r.precipitant_type),

      // Protein features
      mw: protein.theoretical_mw || null,
      pi: protein.theoretical_pi || null,
      residues: protein.residues || null,
      organism_category: categorizeOrganism(protein.organism),

      // Construct features
      tag_name: construct.tag_name || null,
    };
  });

  // Output
  const timestamp = new Date().toISOString().slice(0, 10);

  if (csvMode) {
    const headers = Object.keys(features[0]);
    const csv = [headers.join(','), ...features.map(f => headers.map(h => {
      const v = (f as any)[h];
      return v === null ? '' : typeof v === 'string' ? `"${v}"` : v;
    }).join(','))].join('\n');

    const path = resolve(OUT_DIR, `features-${timestamp}.csv`);
    writeFileSync(path, csv);
    console.log(`\n  CSV saved: ${path} (${features.length} rows, ${headers.length} columns)`);
  } else {
    const path = resolve(OUT_DIR, `features-${timestamp}.json`);
    writeFileSync(path, JSON.stringify({ metadata: { date: timestamp, count: features.length, columns: Object.keys(features[0]) }, data: features }, null, 2));
    console.log(`\n  JSON saved: ${path} (${features.length} rows)`);
  }

  // Stats
  const successCount = features.filter(f => f.success === 1).length;
  console.log(`  Success: ${successCount} (${(successCount/features.length*100).toFixed(1)}%)`);
  console.log(`  Failure: ${features.length - successCount}`);

  const precipCats: Record<string, number> = {};
  for (const f of features) { precipCats[f.precipitant_category] = (precipCats[f.precipitant_category] || 0) + 1; }
  console.log(`  Precipitant categories:`, precipCats);

  const orgCats: Record<string, number> = {};
  for (const f of features) { orgCats[f.organism_category] = (orgCats[f.organism_category] || 0) + 1; }
  console.log(`  Organism categories:`, orgCats);
}

main().catch(console.error);
