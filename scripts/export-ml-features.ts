/**
 * ML Feature Export — 예측 모델 학습용 확장 피처 데이터셋 생성
 *
 * npx tsx scripts/export-ml-features.ts                 # JSON 출력
 * npx tsx scripts/export-ml-features.ts --csv            # CSV 출력
 * npx tsx scripts/export-ml-features.ts --limit 10000    # 샘플 수 제한
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const client = new pg.Client({
  host: '203.255.78.89', port: 15432, database: 'kbsi_crystal_bank',
  user: 'kbsi_app', password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

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
  await client.connect();
  try {
    console.log(`Exporting ML features (limit=${LIMIT})...`);

    const { rows: records } = await client.query(
      `SELECT id, ph, temperature, precipitant_type, outcome, source_type, construct_id
       FROM kbsi_crystallization
       WHERE outcome IS NOT NULL AND ph IS NOT NULL
       LIMIT $1`,
      [LIMIT]
    );

    if (!records || records.length === 0) {
      console.error('No records found');
      return;
    }

    console.log(`  Fetched ${records.length} crystallization records`);

    const constructIds = [...new Set(records.map(r => r.construct_id))].filter(Boolean);
    console.log(`  Unique constructs: ${constructIds.length}`);

    // Batch fetch construct -> protein data
    const constructProteinMap: Record<number, { protein_id: number; tag_name?: string }> = {};
    for (let i = 0; i < constructIds.length; i += 500) {
      const batch = constructIds.slice(i, i + 500);
      const { rows: constructs } = await client.query(
        'SELECT id, protein_id, tag_name FROM kbsi_construct WHERE id = ANY($1)',
        [batch]
      );
      for (const c of constructs || []) {
        constructProteinMap[c.id] = { protein_id: c.protein_id, tag_name: c.tag_name };
      }
    }

    // Batch fetch protein data
    const proteinIds = [...new Set(Object.values(constructProteinMap).map(c => c.protein_id))].filter(Boolean);
    const proteinMap: Record<number, any> = {};
    for (let i = 0; i < proteinIds.length; i += 500) {
      const batch = proteinIds.slice(i, i + 500);
      const { rows: proteins } = await client.query(
        'SELECT id, theoretical_mw, theoretical_pi, organism, residues FROM kbsi_protein WHERE id = ANY($1)',
        [batch]
      );
      for (const p of proteins || []) {
        proteinMap[p.id] = p;
      }
    }

    console.log(`  Proteins loaded: ${Object.keys(proteinMap).length}`);

    const features = records.map(r => {
      const construct = constructProteinMap[r.construct_id] || {};
      const protein = proteinMap[(construct as any).protein_id] || {};

      const isSuccess = ['single_crystal', 'diffraction_quality'].includes(r.outcome);

      return {
        success: isSuccess ? 1 : 0,
        outcome: r.outcome,
        source_type: r.source_type,
        ph: r.ph,
        temperature: r.temperature,
        precipitant_type: r.precipitant_type || null,
        precipitant_category: categorizePrecipitant(r.precipitant_type),
        mw: protein.theoretical_mw || null,
        pi: protein.theoretical_pi || null,
        residues: protein.residues || null,
        organism_category: categorizeOrganism(protein.organism),
        tag_name: (construct as any).tag_name || null,
      };
    });

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

    const successCount = features.filter(f => f.success === 1).length;
    console.log(`  Success: ${successCount} (${(successCount/features.length*100).toFixed(1)}%)`);
    console.log(`  Failure: ${features.length - successCount}`);

    const precipCats: Record<string, number> = {};
    for (const f of features) { precipCats[f.precipitant_category] = (precipCats[f.precipitant_category] || 0) + 1; }
    console.log(`  Precipitant categories:`, precipCats);

    const orgCats: Record<string, number> = {};
    for (const f of features) { orgCats[f.organism_category] = (orgCats[f.organism_category] || 0) + 1; }
    console.log(`  Organism categories:`, orgCats);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
