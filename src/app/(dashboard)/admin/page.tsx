import { createServiceClient } from '@/lib/supabase/service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const SCRIPTS = [
  { name: 'bulk-pdb-sweep', type: '수집', target: 'protein, construct, cryst, structure', schedule: '주 1회', cmd: 'npx tsx scripts/bulk-pdb-sweep.ts --limit 50000' },
  { name: 'harvest-papers-extended', type: '수집', target: 'expr, purif, char, diffr', schedule: '주 1회', cmd: 'npx tsx scripts/harvest-papers-extended.ts --limit 50000' },
  { name: 'harvest-pdb-ligands', type: '수집', target: 'ligand, binding', schedule: '주 1회', cmd: 'npx tsx scripts/harvest-pdb-ligands.ts --limit 50000' },
  { name: 'harvest-diffraction-from-pdb', type: '수집', target: 'diffraction', schedule: '주 1회', cmd: 'npx tsx scripts/harvest-diffraction-from-pdb.ts --limit 286000' },
  { name: 'harvest-chembl-expanded', type: '수집', target: 'ligand, binding', schedule: '월 1회', cmd: 'npx tsx scripts/harvest-chembl-expanded.ts' },
  { name: 'bulk-enrich-conditions', type: '정제', target: 'crystallization (UPDATE)', schedule: '일 1회', cmd: 'npx tsx scripts/bulk-enrich-conditions.ts --limit 50000' },
  { name: 'backfill-protein-metadata', type: '정제', target: 'protein, construct', schedule: '주 1회', cmd: 'npx tsx scripts/backfill-protein-metadata.ts --limit 70000' },
  { name: 'backfill-theoretical-mw', type: '정제', target: 'construct MW/pI', schedule: '주 1회', cmd: 'npx tsx scripts/backfill-theoretical-mw.ts' },
  { name: 'backfill-space-group', type: '정제', target: 'diffraction', schedule: '주 1회', cmd: 'npx tsx scripts/backfill-space-group.ts' },
  { name: 'backfill-structure-metadata', type: '정제', target: 'structure date/EMDB', schedule: '주 1회', cmd: 'npx tsx scripts/backfill-structure-metadata.ts --limit 286000' },
  { name: 'backfill-references', type: '정제', target: 'reference + structure', schedule: '주 1회', cmd: 'npx tsx scripts/backfill-references.ts --limit 286000' },
  { name: 'backfill-ncbi-gene', type: '정제', target: 'gene_name, NCBI Gene', schedule: '월 1회', cmd: 'npx tsx scripts/backfill-ncbi-gene.ts' },
  { name: 'backfill-seq-hash', type: '정제', target: 'construct seq_hash', schedule: '주 1회', cmd: 'npx tsx scripts/backfill-seq-hash.ts' },
  { name: 'backfill-pdb-database-ids', type: '정제', target: 'database_id (PDB)', schedule: '주 1회', cmd: 'npx tsx scripts/backfill-pdb-database-ids.ts --limit 286000' },
  { name: 'backfill-uniprot-ids', type: '정제', target: 'database_id (UniProt)', schedule: '월 1회', cmd: 'npx tsx scripts/backfill-uniprot-ids.ts --limit 286000' },
  { name: 'dedupe-proteins', type: '정제', target: 'protein (중복 병합)', schedule: '월 1회', cmd: 'npx tsx scripts/dedupe-proteins.ts --dry-run' },
  { name: 'cleanup-data-quality', type: '검증', target: '오분류, 이상치, 정규화', schedule: '주 1회', cmd: 'npx tsx scripts/cleanup-data-quality.ts --dry-run' },
  { name: 'validate-llm-extraction', type: '검증', target: 'LLM 추출 정확도', schedule: '주 1회', cmd: 'npx tsx scripts/validate-llm-extraction.ts --dry-run' },
  { name: 'benchmark-prediction', type: 'ML', target: 'k-NN 벤치마크', schedule: '필요 시', cmd: 'npx tsx scripts/benchmark-prediction.ts --sample 5000 --k 3,5,10,15 --maxload 100000' },
  { name: 'ops-harness', type: '운영', target: '상태/헬스/품질', schedule: '일 1회', cmd: 'npx tsx scripts/ops-harness.ts status' },
];

const TYPE_COLORS: Record<string, string> = {
  '수집': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  '정제': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  '검증': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'ML': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  '운영': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default async function AdminPage() {
  const supabase = createServiceClient();

  // 테이블별 건수
  const tables = [
    { name: 'kbsi_protein', label: 'Proteins' },
    { name: 'kbsi_construct', label: 'Constructs' },
    { name: 'kbsi_expression', label: 'Expression' },
    { name: 'kbsi_purification', label: 'Purification' },
    { name: 'kbsi_characterization', label: 'Characterization' },
    { name: 'kbsi_crystallization', label: 'Crystallization' },
    { name: 'kbsi_diffraction', label: 'Diffraction' },
    { name: 'kbsi_structure', label: 'Structure' },
    { name: 'kbsi_ligand', label: 'Ligands' },
    { name: 'kbsi_construct_ligand', label: 'Bindings' },
    { name: 'kbsi_reference', label: 'References' },
    { name: 'kbsi_database_id', label: 'Database IDs' },
  ];

  const counts = await Promise.all(
    tables.map(async t => {
      const { count } = await supabase.from(t.name).select('id', { count: 'exact', head: true });
      return { ...t, count: count ?? 0 };
    })
  );

  // 필드 커버리지
  const coverageChecks = [
    { table: 'kbsi_protein', field: 'gene_name', label: 'Protein gene_name' },
    { table: 'kbsi_protein', field: 'abbreviation', label: 'Protein abbreviation' },
    { table: 'kbsi_construct', field: 'expression_system', label: 'Construct expression_system' },
    { table: 'kbsi_construct', field: 'theoretical_mw', label: 'Construct MW' },
    { table: 'kbsi_construct', field: 'seq_hash', label: 'Construct seq_hash' },
    { table: 'kbsi_structure', field: 'performed_on', label: 'Structure date' },
    { table: 'kbsi_structure', field: 'reference_id', label: 'Structure reference' },
    { table: 'kbsi_diffraction', field: 'space_group', label: 'Diffraction space_group' },
    { table: 'kbsi_diffraction', field: 'beamline', label: 'Diffraction beamline' },
  ];

  const coverage = await Promise.all(
    coverageChecks.map(async c => {
      const [{ count: total }, { count: filled }] = await Promise.all([
        supabase.from(c.table).select('id', { count: 'exact', head: true }),
        supabase.from(c.table).select('id', { count: 'exact', head: true }).not(c.field, 'is', null),
      ]);
      const t = total ?? 0;
      const f = filled ?? 0;
      return { ...c, total: t, filled: f, pct: t > 0 ? Math.round(f / t * 1000) / 10 : 0 };
    })
  );

  // Enrichment 커버리지
  const [{ count: crystExp }, { count: hasPrecip }] = await Promise.all([
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).neq('source_type', 'synthetic'),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).neq('source_type', 'synthetic').not('precipitant_type', 'is', null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <p className="text-muted-foreground">데이터 현황, 필드 커버리지, 스크립트 관리</p>
      </div>

      {/* Table Counts */}
      <Card>
        <CardHeader><CardTitle className="text-base">테이블별 데이터 현황</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {counts.map(t => (
              <div key={t.name} className="rounded-lg border p-3 text-center">
                <div className="text-xl font-bold">{t.count.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">{t.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Field Coverage */}
      <Card>
        <CardHeader><CardTitle className="text-base">필드 커버리지</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {coverage.map(c => (
              <div key={c.label} className="flex items-center gap-3">
                <div className="w-44 text-xs text-muted-foreground truncate">{c.label}</div>
                <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                  <div
                    className={`h-full rounded-sm ${c.pct >= 90 ? 'bg-green-500' : c.pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(c.pct, 100)}%` }}
                  />
                </div>
                <div className="w-20 text-right text-xs font-mono">
                  {c.pct}% <span className="text-muted-foreground">({c.filled.toLocaleString()})</span>
                </div>
              </div>
            ))}
            {/* Enrichment */}
            <div className="flex items-center gap-3">
              <div className="w-44 text-xs text-muted-foreground">Enrichment (precipitant)</div>
              <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm bg-yellow-500"
                  style={{ width: `${Math.round((hasPrecip ?? 0) / (crystExp ?? 1) * 100)}%` }}
                />
              </div>
              <div className="w-20 text-right text-xs font-mono">
                {Math.round((hasPrecip ?? 0) / (crystExp ?? 1) * 100)}% <span className="text-muted-foreground">({(hasPrecip ?? 0).toLocaleString()})</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Benchmark */}
      <Card>
        <CardHeader><CardTitle className="text-base">ML 벤치마크</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">92.4%</div>
              <div className="text-[10px] text-muted-foreground">Accuracy (k=5)</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">92.5%</div>
              <div className="text-[10px] text-muted-foreground">Precision</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">91.2%</div>
              <div className="text-[10px] text-muted-foreground">F1 Score</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950">
              <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">v4</div>
              <div className="text-[10px] text-muted-foreground">Version (2026-10-08)</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Script Catalog */}
      <Card>
        <CardHeader><CardTitle className="text-base">스크립트 카탈로그 ({SCRIPTS.length}개)</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Script</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Target</th>
                  <th className="px-3 py-2 text-left font-medium">Schedule</th>
                  <th className="px-3 py-2 text-left font-medium">Command</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {SCRIPTS.map(s => (
                  <tr key={s.name} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs font-mono font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-xs">
                      <Badge className={`text-[10px] ${TYPE_COLORS[s.type] || ''}`}>{s.type}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.target}</td>
                    <td className="px-3 py-2 text-xs">{s.schedule}</td>
                    <td className="px-3 py-2">
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{s.cmd}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
