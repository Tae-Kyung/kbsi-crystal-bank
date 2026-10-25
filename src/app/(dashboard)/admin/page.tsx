import { query, queryOne, scalar, getDbStatus } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Activity, RefreshCw, Shield } from 'lucide-react';

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
  { name: 'ops-harness', type: '운영', target: '상태/헬스/품질/트렌드', schedule: '일 1회', cmd: 'npm run ops' },
  { name: 'enrich-precipitant', type: '정제', target: 'precipitant_type 추출+정규화', schedule: '월 1회', cmd: 'npx tsx scripts/enrich-precipitant.ts' },
  { name: 'backfill-provenance', type: '정제', target: 'source_id + DOI', schedule: '월 1회', cmd: 'npx tsx scripts/backfill-provenance.ts' },
  { name: 'data-validation-loop', type: '검증', target: '10차원 품질 프레임워크', schedule: '주 1회', cmd: 'npm run validate' },
  { name: 'preflight-loop', type: '검증', target: 'typecheck+lint+test+build', schedule: 'PR 시', cmd: 'npm run preflight:loop' },
  { name: 'ai-scientist-runner', type: 'ML', target: '가설 자동 검증', schedule: '필요 시', cmd: 'npm run ai:run' },
  { name: 'export-ml-features', type: 'ML', target: 'ML 피처 데이터셋', schedule: '필요 시', cmd: 'npm run ml:export' },
  { name: 'update-technical-report', type: '운영', target: 'technical_report.md 수치', schedule: '월 1회', cmd: 'npm run report:update' },
];

const TYPE_COLORS: Record<string, string> = {
  '수집': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  '정제': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  '검증': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'ML': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  '운영': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default async function AdminPage() {
  // DB 상태
  const [connStatus, dbHealth, syncStatus] = await Promise.all([
    getDbStatus(),
    queryOne<{
      db_size: string; total_tables: number; total_rows: string;
      total_indexes: number; cache_hit_ratio: string;
      active_connections: number; uptime: any;
    }>('SELECT * FROM db_health()').catch(() => null),
    queryOne<{
      total_pending: string; oldest_pending: string;
      by_table: Record<string, number> | null; by_action: Record<string, number> | null;
      last_synced: string;
    }>('SELECT * FROM sync_status()').catch(() => null),
  ]);

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
      const count = await scalar<number>(`SELECT COUNT(*) FROM ${t.name}`);
      return { ...t, count: Number(count) ?? 0 };
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
      const [total, filled] = await Promise.all([
        scalar<number>(`SELECT COUNT(*) FROM ${c.table}`),
        scalar<number>(`SELECT COUNT(*) FROM ${c.table} WHERE ${c.field} IS NOT NULL`),
      ]);
      const t = Number(total) ?? 0;
      const f = Number(filled) ?? 0;
      return { ...c, total: t, filled: f, pct: t > 0 ? Math.round(f / t * 1000) / 10 : 0 };
    })
  );

  // Enrichment 커버리지
  const [crystExp, hasPrecip] = await Promise.all([
    scalar<number>(`SELECT COUNT(*) FROM kbsi_crystallization WHERE source_type != 'synthetic'`),
    scalar<number>(`SELECT COUNT(*) FROM kbsi_crystallization WHERE source_type != 'synthetic' AND precipitant_type IS NOT NULL`),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <p className="text-muted-foreground">데이터 현황, 필드 커버리지, 스크립트 관리</p>
      </div>

      {/* DB Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database Connection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${connStatus.primary === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm font-medium">Lab PG (Primary)</span>
                </div>
                <div className="text-xs text-muted-foreground">203.255.78.89:15432</div>
                {dbHealth && (
                  <div className="mt-2 space-y-1 text-xs">
                    <div>Size: <span className="font-mono">{dbHealth.db_size}</span></div>
                    <div>Tables: <span className="font-mono">{dbHealth.total_tables}</span> / Indexes: <span className="font-mono">{dbHealth.total_indexes}</span></div>
                    <div>Rows: <span className="font-mono">{Number(dbHealth.total_rows).toLocaleString()}</span></div>
                    <div>Cache Hit: <span className="font-mono">{dbHealth.cache_hit_ratio}%</span></div>
                    <div>Connections: <span className="font-mono">{dbHealth.active_connections}</span></div>
                  </div>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${connStatus.fallback === 'available' ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                  <span className="text-sm font-medium">Supabase (Standby)</span>
                </div>
                <div className="text-xs text-muted-foreground">yjmeolkuhcjpxuxmtkts.supabase.co</div>
                <div className="mt-2 text-xs">
                  <Badge variant="outline" className="text-[10px]">
                    {connStatus.fallback === 'available' ? 'Ready for Failover' : 'Unavailable'}
                  </Badge>
                </div>
                {connStatus.failCount > 0 && (
                  <div className="mt-1 text-xs text-red-600">Fail count: {connStatus.failCount}/3</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync Status (CDC)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {syncStatus ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className="text-lg font-bold">{Number(syncStatus.total_pending).toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Pending Changes</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className="text-sm font-mono">{syncStatus.last_synced ? new Date(syncStatus.last_synced).toLocaleString('ko-KR', { hour12: false }) : '-'}</div>
                    <div className="text-[10px] text-muted-foreground">Last Synced</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <div className="text-sm font-mono">{syncStatus.oldest_pending ? new Date(syncStatus.oldest_pending).toLocaleString('ko-KR', { hour12: false }) : '-'}</div>
                    <div className="text-[10px] text-muted-foreground">Oldest Pending</div>
                  </div>
                </div>
                {syncStatus.by_table && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">By table:</span>{' '}
                    {Object.entries(syncStatus.by_table).map(([t, c]) => `${t.replace('kbsi_', '')}(${c})`).join(', ')}
                  </div>
                )}
                {syncStatus.by_action && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">By action:</span>{' '}
                    {Object.entries(syncStatus.by_action).map(([a, c]) => `${a}(${c})`).join(', ')}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  Sync command: <code className="bg-muted px-1 rounded">npm run sync:backup</code>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Sync status unavailable</div>
            )}
          </CardContent>
        </Card>
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
                  style={{ width: `${Math.round((Number(hasPrecip) ?? 0) / (Number(crystExp) || 1) * 100)}%` }}
                />
              </div>
              <div className="w-20 text-right text-xs font-mono">
                {Math.round((Number(hasPrecip) ?? 0) / (Number(crystExp) || 1) * 100)}% <span className="text-muted-foreground">({(Number(hasPrecip) ?? 0).toLocaleString()})</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 10-Dimension Quality Framework */}
      <Card>
        <CardHeader><CardTitle className="text-base">10-Dimension Data Quality</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { dim: 'Accuracy', grade: 'B', pct: 75, color: 'blue' },
              { dim: 'Consistency', grade: 'A', pct: 100, color: 'green' },
              { dim: 'Integrity', grade: 'A', pct: 90, color: 'green' },
              { dim: 'Deduplication', grade: 'A', pct: 95, color: 'green' },
              { dim: 'Extensibility', grade: 'B', pct: 80, color: 'blue' },
              { dim: 'Completeness', grade: 'B', pct: 75, color: 'blue' },
              { dim: 'Distribution', grade: 'A', pct: 100, color: 'green' },
              { dim: 'Provenance', grade: 'B', pct: 83, color: 'blue' },
              { dim: 'Timeliness', grade: 'B', pct: 80, color: 'blue' },
              { dim: 'Conformity', grade: 'B', pct: 83, color: 'blue' },
            ].map(d => (
              <div key={d.dim} className="rounded-lg border p-2 text-center">
                <div className={`text-lg font-bold ${d.color === 'green' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>{d.grade}</div>
                <div className="text-[10px] text-muted-foreground">{d.dim}</div>
                <div className="mt-1 h-1.5 bg-muted rounded overflow-hidden">
                  <div className={`h-full rounded ${d.color === 'green' ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${d.pct}%` }} />
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">{d.pct}%</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center">
            <span className="text-xs text-muted-foreground">Overall: </span>
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">B (84%)</span>
            <span className="text-xs text-muted-foreground"> — 67 checks across 10 dimensions</span>
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
