/**
 * Technical Report Auto-Updater (v2: Lab PostgreSQL)
 * Lab PG 직접 쿼리로 수치 업데이트 + Supabase에서 불가능했던 고급 통계 추가
 *
 * npx tsx scripts/update-technical-report.ts
 * npx tsx scripts/update-technical-report.ts --dry-run
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

const pgClient = new pg.Client({
  host: '203.255.78.89',
  port: 15432,
  database: 'kbsi_crystal_bank',
  user: 'kbsi_app',
  password: 'SMmQhkEIeXivl5P0yrHWW1JhpwCcmWQg',
  ssl: { rejectUnauthorized: false },
});

const ROOT = resolve(__dirname, '..');
const REPORT_PATH = resolve(ROOT, 'data', 'technical_report.md');
const dryRun = process.argv.includes('--dry-run');

async function scalar<T = number>(sql: string): Promise<T> {
  const res = await pgClient.query(sql);
  return Object.values(res.rows[0])[0] as T;
}

function fmt(n: number): string { return n.toLocaleString(); }
function pct(n: number, total: number): string {
  return total > 0 ? (n / total * 100).toFixed(1) : '0.0';
}

async function main() {
  await pgClient.connect();
  console.log('Connected to Lab PostgreSQL');
  console.log('Collecting latest metrics...\n');

  // --- Basic counts ---
  const metrics = {
    proteins: await scalar('SELECT COUNT(*) FROM kbsi_protein'),
    constructs: await scalar('SELECT COUNT(*) FROM kbsi_construct'),
    crystallization: await scalar('SELECT COUNT(*) FROM kbsi_crystallization'),
    structures: await scalar('SELECT COUNT(*) FROM kbsi_structure'),
    expression: await scalar('SELECT COUNT(*) FROM kbsi_expression'),
    purification: await scalar('SELECT COUNT(*) FROM kbsi_purification'),
    characterization: await scalar('SELECT COUNT(*) FROM kbsi_characterization'),
    diffraction: await scalar('SELECT COUNT(*) FROM kbsi_diffraction'),
    nmr_experiment: await scalar('SELECT COUNT(*) FROM kbsi_nmr_experiment'),
    chemical_shifts: await scalar('SELECT COUNT(*) FROM kbsi_nmr_chemical_shift'),
    ligands: await scalar('SELECT COUNT(*) FROM kbsi_ligand'),
    bindings: await scalar('SELECT COUNT(*) FROM kbsi_construct_ligand'),
    mutations: await scalar('SELECT COUNT(*) FROM kbsi_mutation'),
    embeddings: await scalar('SELECT COUNT(*) FROM kbsi_embedding'),
    references: await scalar('SELECT COUNT(*) FROM kbsi_reference'),
    gene_names: await scalar("SELECT COUNT(*) FROM kbsi_protein WHERE gene_name IS NOT NULL"),
    uniprot: await scalar("SELECT COUNT(*) FROM kbsi_database_id WHERE db_name = 'UniProt'"),
  };

  // --- Advanced stats (previously impossible on Supabase due to timeout) ---

  // Coverage: pH, temperature, precipitant
  const coveragePh = await scalar(
    "SELECT COUNT(*) FROM kbsi_crystallization WHERE ph IS NOT NULL"
  );
  const coverageTemp = await scalar(
    "SELECT COUNT(*) FROM kbsi_crystallization WHERE temperature IS NOT NULL"
  );
  const coveragePrecip = await scalar(
    "SELECT COUNT(*) FROM kbsi_crystallization WHERE precipitant_type IS NOT NULL"
  );

  // Outcome distribution
  const outcomeRows = (await pgClient.query(
    "SELECT outcome, COUNT(*) as cnt FROM kbsi_crystallization WHERE outcome IS NOT NULL GROUP BY outcome ORDER BY cnt DESC"
  )).rows;

  // Source distribution
  const sourceRows = (await pgClient.query(
    "SELECT source_db, COUNT(*) as cnt FROM kbsi_crystallization GROUP BY source_db ORDER BY cnt DESC"
  )).rows;

  // Top organisms
  const organismRows = (await pgClient.query(
    "SELECT p.organism, COUNT(DISTINCT c.id) as constructs, COUNT(cr.id) as crystals FROM kbsi_protein p JOIN kbsi_construct c ON c.protein_id = p.id JOIN kbsi_crystallization cr ON cr.construct_id = c.id GROUP BY p.organism ORDER BY crystals DESC LIMIT 10"
  )).rows;

  // Top precipitants
  const precipRows = (await pgClient.query(
    "SELECT precipitant_type, COUNT(*) as cnt, ROUND(AVG(precipitant_conc)::numeric, 2) as avg_conc FROM kbsi_crystallization WHERE precipitant_type IS NOT NULL GROUP BY precipitant_type ORDER BY cnt DESC LIMIT 10"
  )).rows;

  // Construct dedup check
  const dupCount = await scalar(
    "SELECT COUNT(*) FROM kbsi_construct c WHERE EXISTS (SELECT 1 FROM kbsi_construct c2 WHERE c2.name = c.name AND c2.protein_id = c.protein_id AND c2.id < c.id)"
  );

  // Structure method distribution
  const methodRows = (await pgClient.query(
    "SELECT method, COUNT(*) as cnt FROM kbsi_structure GROUP BY method ORDER BY cnt DESC"
  )).rows;

  // Embedding coverage
  const embCoverage = metrics.embeddings > 0
    ? `${fmt(metrics.embeddings)} (${pct(Number(metrics.embeddings), Number(metrics.constructs))}%)`
    : '0';

  const date = new Date().toISOString().slice(0, 10);

  // Print summary
  console.log('Basic counts:');
  for (const [k, v] of Object.entries(metrics)) {
    console.log(`  ${k.padEnd(20)} ${fmt(Number(v))}`);
  }
  console.log(`\nCoverage (of ${fmt(Number(metrics.crystallization))} crystallizations):`);
  console.log(`  pH:            ${pct(Number(coveragePh), Number(metrics.crystallization))}%`);
  console.log(`  Temperature:   ${pct(Number(coverageTemp), Number(metrics.crystallization))}%`);
  console.log(`  Precipitant:   ${pct(Number(coveragePrecip), Number(metrics.crystallization))}%`);
  console.log(`  Duplicates:    ${fmt(Number(dupCount))} constructs`);

  // Generate summary block
  const summary = `## DB 최신 수치 (${date}, 자동 생성)

| 엔티티 | 건수 |
|--------|------|
| Proteins | ${fmt(Number(metrics.proteins))} |
| Constructs | ${fmt(Number(metrics.constructs))} |
| Structures | ${fmt(Number(metrics.structures))} |
| Crystallization | ${fmt(Number(metrics.crystallization))} |
| Expression | ${fmt(Number(metrics.expression))} |
| Purification | ${fmt(Number(metrics.purification))} |
| Characterization | ${fmt(Number(metrics.characterization))} |
| Diffraction | ${fmt(Number(metrics.diffraction))} |
| NMR Experiments | ${fmt(Number(metrics.nmr_experiment))} |
| NMR Chemical Shifts | ${fmt(Number(metrics.chemical_shifts))} |
| Ligands | ${fmt(Number(metrics.ligands))} |
| Bindings | ${fmt(Number(metrics.bindings))} |
| Mutations | ${fmt(Number(metrics.mutations))} |
| ESM-2 Embeddings | ${embCoverage} |
| References | ${fmt(Number(metrics.references))} |
| Gene Names | ${fmt(Number(metrics.gene_names))} (${pct(Number(metrics.gene_names), Number(metrics.proteins))}%) |
| UniProt Mappings | ${fmt(Number(metrics.uniprot))} (${pct(Number(metrics.uniprot), Number(metrics.proteins))}%) |

### 데이터 커버리지

| 필드 | 커버리지 |
|------|----------|
| pH | ${pct(Number(coveragePh), Number(metrics.crystallization))}% (${fmt(Number(coveragePh))}) |
| Temperature | ${pct(Number(coverageTemp), Number(metrics.crystallization))}% (${fmt(Number(coverageTemp))}) |
| Precipitant | ${pct(Number(coveragePrecip), Number(metrics.crystallization))}% (${fmt(Number(coveragePrecip))}) |
| Construct 중복 | ${fmt(Number(dupCount))}건 |

### 결정화 Outcome 분포

| Outcome | 건수 | 비율 |
|---------|------|------|
${outcomeRows.map(r => `| ${r.outcome} | ${fmt(Number(r.cnt))} | ${pct(Number(r.cnt), Number(metrics.crystallization))}% |`).join('\n')}

### 데이터 출처 분포

| Source | 건수 |
|--------|------|
${sourceRows.map(r => `| ${r.source_db || 'unknown'} | ${fmt(Number(r.cnt))} |`).join('\n')}

### 구조결정 방법 분포

| Method | 건수 |
|--------|------|
${methodRows.map(r => `| ${r.method} | ${fmt(Number(r.cnt))} |`).join('\n')}

### Top 10 생물종 (결정화 기준)

| Organism | Constructs | Crystallizations |
|----------|-----------|-----------------|
${organismRows.map(r => `| ${r.organism || 'unknown'} | ${fmt(Number(r.constructs))} | ${fmt(Number(r.crystals))} |`).join('\n')}

### Top 10 침전제

| Precipitant | 건수 | 평균 농도 |
|-------------|------|----------|
${precipRows.map(r => `| ${r.precipitant_type} | ${fmt(Number(r.cnt))} | ${r.avg_conc ?? '-'} |`).join('\n')}
`;

  if (!existsSync(REPORT_PATH)) {
    console.log(`\ntechnical_report.md not found at ${REPORT_PATH}`);
    const reportPath = resolve(ROOT, 'data', 'latest-metrics.md');
    if (!dryRun) {
      writeFileSync(reportPath, `# KBSI-CrystalBank Latest Metrics\n\n${summary}`);
      console.log(`Written to: ${reportPath}`);
    } else {
      console.log('\n[DRY RUN] Would write:');
      console.log(summary);
    }
  } else {
    let content = readFileSync(REPORT_PATH, 'utf-8');
    const oldMarkerRegex = new RegExp('## DB 최신 수치.*?\\n(?=## [^D]|\\n---|$)', 's');

    if (oldMarkerRegex.test(content)) {
      content = content.replace(oldMarkerRegex, summary + '\n');
      console.log('\nReplaced existing metrics section.');
    } else {
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

  await pgClient.end();
}

main().catch(e => { console.error(e); process.exit(1); });
