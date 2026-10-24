/**
 * Lab PostgreSQL advanced utilities
 * Full-text search, COPY bulk import, statistics, construct hierarchy
 *
 * NOTE: bulkImportCSV requires `pg-copy-streams` package.
 *   Install with: npm install pg-copy-streams && npm install -D @types/pg-copy-streams
 */
import { query, queryOne, pool } from '@/lib/db';

// ---------------------------------------------------------------------------
// 1. Full-text search for proteins (uses tsvector GIN index)
// ---------------------------------------------------------------------------
export async function searchProteinsFTS(searchQuery: string, limit = 20) {
  return query<{
    id: number;
    full_name: string;
    abbreviation: string;
    gene_name: string;
    organism: string;
    rank: number;
  }>('SELECT * FROM search_proteins_fts($1, $2)', [searchQuery, limit]);
}

// ---------------------------------------------------------------------------
// 2. Get construct hierarchy (recursive CTE)
// ---------------------------------------------------------------------------
export async function getConstructHierarchy(rootConstructId: number) {
  return query<{
    id: number;
    name: string;
    parent_construct_id: number | null;
    construct_type: string;
    depth: number;
  }>('SELECT * FROM construct_hierarchy($1)', [rootConstructId]);
}

// ---------------------------------------------------------------------------
// 3. Protein success ranking (materialized view)
// ---------------------------------------------------------------------------
export async function getProteinSuccessRanking(limit = 50) {
  return query<{
    protein_id: number;
    full_name: string;
    organism: string;
    total_trials: number;
    successes: number;
    success_rate: number;
    rank: number;
  }>('SELECT * FROM mv_protein_success_ranking LIMIT $1', [limit]);
}

// ---------------------------------------------------------------------------
// 4. Precipitant pH profile (materialized view)
// ---------------------------------------------------------------------------
export async function getPrecipitantPhProfile(precipitantType: string) {
  return query<{
    precipitant_type: string;
    ph_bucket: number;
    trial_count: number;
    success_count: number;
    success_rate: number;
  }>(
    'SELECT * FROM mv_precipitant_ph_profile WHERE precipitant_type = $1 ORDER BY ph_bucket',
    [precipitantType],
  );
}

// ---------------------------------------------------------------------------
// 5. Statistical summary (median + IQR via SQL function)
// ---------------------------------------------------------------------------
interface IqrStats {
  q1: number;
  median: number;
  q3: number;
  iqr: number;
}

export async function getCrystallizationStats() {
  const [phStats, tempStats, concStats] = await Promise.all([
    queryOne<IqrStats>(
      "SELECT * FROM iqr_stats(ARRAY(SELECT ph::float8 FROM kbsi_crystallization WHERE ph IS NOT NULL))",
    ),
    queryOne<IqrStats>(
      "SELECT * FROM iqr_stats(ARRAY(SELECT temperature::float8 FROM kbsi_crystallization WHERE temperature IS NOT NULL))",
    ),
    queryOne<IqrStats>(
      "SELECT * FROM iqr_stats(ARRAY(SELECT precipitant_conc::float8 FROM kbsi_crystallization WHERE precipitant_conc IS NOT NULL))",
    ),
  ]);

  return {
    ph: phStats,
    temperature: tempStats,
    precipitant_conc: concStats,
  };
}

// ---------------------------------------------------------------------------
// 6. Bulk import using COPY protocol (streaming)
//    Requires: npm install pg-copy-streams @types/pg-copy-streams
// ---------------------------------------------------------------------------
export async function bulkImportCSV(
  tableName: string,
  columns: string[],
  csvStream: NodeJS.ReadableStream,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { from: copyFrom } = require('pg-copy-streams') as {
    from: (query: string) => NodeJS.WritableStream;
  };

  const client = await pool.connect();
  try {
    const copyQuery = `COPY ${tableName} (${columns.join(',')}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')`;
    // pg-copy-streams returns a writable stream from client.query;
    // cast via unknown because pg's TS overloads don't cover COPY streams.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pgStream = (client as any).query(copyFrom(copyQuery)) as NodeJS.WritableStream;

    return new Promise<number>((resolve, reject) => {
      let rows = 0;

      pgStream.on('error', reject);
      pgStream.on('finish', () => resolve(rows));

      csvStream.on('data', (chunk: Buffer) => {
        // Approximate row count by counting newlines
        rows += chunk.toString().split('\n').length - 1;
      });

      csvStream.pipe(pgStream);
    });
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// 7. Refresh all materialized views
// ---------------------------------------------------------------------------
export async function refreshMaterializedViews() {
  await query('SELECT refresh_materialized_views()');
}

// ---------------------------------------------------------------------------
// 8. Data quality report
// ---------------------------------------------------------------------------
export async function getDataQualityReport() {
  return query<{
    check_name: string;
    status: string;
    count: number;
    detail: string;
  }>('SELECT * FROM data_quality_report()');
}
