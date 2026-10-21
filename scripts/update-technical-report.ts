/**
 * Technical Report Auto-Updater
 * ops snapshot 데이터를 기반으로 technical_report.md의 수치를 자동 업데이트
 *
 * npx tsx scripts/update-technical-report.ts
 * npx tsx scripts/update-technical-report.ts --dry-run
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ROOT = resolve(__dirname, '..');
const REPORT_PATH = resolve(ROOT, 'data', 'technical_report.md');
const dryRun = process.argv.includes('--dry-run');

async function cnt(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

function fmt(n: number): string { return n.toLocaleString(); }

async function main() {
  console.log('Collecting latest metrics...');

  const metrics = {
    proteins: await cnt('kbsi_protein'),
    constructs: await cnt('kbsi_construct'),
    crystallization: await cnt('kbsi_crystallization'),
    structures: await cnt('kbsi_structure'),
    expression: await cnt('kbsi_expression'),
    purification: await cnt('kbsi_purification'),
    characterization: await cnt('kbsi_characterization'),
    diffraction: await cnt('kbsi_diffraction'),
    nmr_experiment: await cnt('kbsi_nmr_experiment'),
    ligands: await cnt('kbsi_ligand'),
    bindings: await cnt('kbsi_construct_ligand'),
    mutations: await cnt('kbsi_mutation'),
    embeddings: await cnt('kbsi_embedding'),
    references: await cnt('kbsi_reference'),
    gene_names: await cnt('kbsi_protein', q => q.not('gene_name', 'is', null)),
    uniprot: await cnt('kbsi_database_id', q => q.eq('db_name', 'UniProt')),
  };

  const { count: csCount } = await supabase
    .from('kbsi_nmr_chemical_shift')
    .select('id', { count: 'exact', head: true });
  const chemShifts = csCount ?? 0;

  const date = new Date().toISOString().slice(0, 10);

  console.log('\nLatest metrics:');
  for (const [k, v] of Object.entries(metrics)) {
    console.log(`  ${k.padEnd(20)} ${fmt(v)}`);
  }
  console.log(`  ${'chemical_shifts'.padEnd(20)} ${fmt(chemShifts)}`);

  // Generate summary block
  const summary = `## DB 최신 수치 (${date}, 자동 생성)

| 엔티티 | 건수 |
|--------|------|
| Proteins | ${fmt(metrics.proteins)} |
| Constructs | ${fmt(metrics.constructs)} |
| Structures | ${fmt(metrics.structures)} |
| Crystallization | ${fmt(metrics.crystallization)} |
| Expression | ${fmt(metrics.expression)} |
| Purification | ${fmt(metrics.purification)} |
| Characterization | ${fmt(metrics.characterization)} |
| Diffraction | ${fmt(metrics.diffraction)} |
| NMR Experiments | ${fmt(metrics.nmr_experiment)} |
| NMR Chemical Shifts | ${fmt(chemShifts)} |
| Ligands | ${fmt(metrics.ligands)} |
| Bindings | ${fmt(metrics.bindings)} |
| Mutations | ${fmt(metrics.mutations)} |
| ESM-2 Embeddings | ${fmt(metrics.embeddings)} |
| References | ${fmt(metrics.references)} |
| Gene Names | ${fmt(metrics.gene_names)} (${(metrics.gene_names / metrics.proteins * 100).toFixed(1)}%) |
| UniProt Mappings | ${fmt(metrics.uniprot)} (${(metrics.uniprot / metrics.proteins * 100).toFixed(1)}%) |
`;

  if (!existsSync(REPORT_PATH)) {
    console.log(`\ntechnical_report.md not found at ${REPORT_PATH}`);
    console.log('Writing standalone metrics report...');
    const reportPath = resolve(ROOT, 'data', 'latest-metrics.md');
    if (!dryRun) {
      writeFileSync(reportPath, `# KBSI-CrystalBank Latest Metrics\n\n${summary}`);
      console.log(`Written to: ${reportPath}`);
    } else {
      console.log('\n[DRY RUN] Would write:');
      console.log(summary);
    }
    return;
  }

  // Update existing report
  let content = readFileSync(REPORT_PATH, 'utf-8');
  const marker = '## DB 최신 수치';
  const oldMarkerRegex = /## DB 최신 수치.*?\n(?=## |\n---|\Z)/s;

  if (oldMarkerRegex.test(content)) {
    content = content.replace(oldMarkerRegex, summary + '\n');
    console.log('\nReplaced existing metrics section.');
  } else {
    // Append after first heading
    const firstH2 = content.indexOf('\n## ');
    if (firstH2 > 0) {
      content = content.slice(0, firstH2) + '\n\n' + summary + content.slice(firstH2);
    } else {
      content += '\n\n' + summary;
    }
    console.log('\nInserted new metrics section.');
  }

  if (!dryRun) {
    writeFileSync(REPORT_PATH, content);
    console.log(`Updated: ${REPORT_PATH}`);
  } else {
    console.log('\n[DRY RUN] Would update technical_report.md');
    console.log(summary);
  }
}

main().catch(console.error);
