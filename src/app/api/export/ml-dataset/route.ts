import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/export/ml-dataset — ML 학습용 결정화 조건 데이터셋 export
 *
 * Query params:
 *   format: json (default) | csv
 *   include_synthetic: true (default) | false
 *   outcome_binary: false (default) | true (success/failure 이진 분류)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';
  const includeSynthetic = searchParams.get('include_synthetic') !== 'false';
  const outcomeBinary = searchParams.get('outcome_binary') === 'true';

  const limit = Math.min(parseInt(searchParams.get('limit') || '50000'), 100000);
  const syntheticClause = includeSynthetic ? '' : "AND cr.source_type != 'synthetic'";

  const data = await query(
    `SELECT cr.id, cr.construct_id, cr.source_type, cr.outcome,
            cr.precipitant_type, cr.precipitant_conc, cr.precipitant_unit,
            cr.buffer_type, cr.ph, cr.temperature,
            cr.salt_type, cr.salt_conc,
            cr.protein_concentration, cr.additive, cr.drop_ratio,
            c.name AS construct_name, c.expression_system,
            p.full_name AS protein_name, p.organism
     FROM kbsi_crystallization cr
     JOIN kbsi_construct c ON c.id = cr.construct_id
     JOIN kbsi_protein p ON p.id = c.protein_id
     WHERE cr.outcome IS NOT NULL
     ${syntheticClause}
     ORDER BY cr.id
     LIMIT $1`,
    [limit]
  );

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No data found' }, { status: 404 });
  }

  // Flatten and transform
  const rows = data.map((r: any) => {
    const base: Record<string, any> = {
      id: r.id,
      protein_name: r.protein_name || '',
      organism: r.organism || '',
      expression_system: r.expression_system || '',
      source_type: r.source_type,
      precipitant_type: r.precipitant_type || '',
      precipitant_conc: r.precipitant_conc,
      precipitant_unit: r.precipitant_unit || '',
      buffer_type: r.buffer_type || '',
      ph: r.ph,
      temperature: r.temperature,
      salt_type: r.salt_type || '',
      salt_conc: r.salt_conc,
      protein_concentration: r.protein_concentration,
      additive: r.additive || '',
      drop_ratio: r.drop_ratio || '',
    };

    if (outcomeBinary) {
      base.outcome = ['single_crystal', 'diffraction_quality'].includes(r.outcome) ? 1 : 0;
      base.outcome_label = base.outcome === 1 ? 'success' : 'failure';
    } else {
      base.outcome = r.outcome;
      base.outcome_rank = {
        clear: 0, precipitate: 1, phase_separation: 2,
        microcrystal: 3, single_crystal: 4, diffraction_quality: 5,
      }[r.outcome as string] ?? -1;
    }

    return base;
  });

  // Stats summary
  const stats = {
    total: rows.length,
    real: rows.filter((r: any) => r.source_type !== 'synthetic').length,
    synthetic: rows.filter((r: any) => r.source_type === 'synthetic').length,
    success: rows.filter((r: any) =>
      outcomeBinary ? r.outcome === 1 : ['single_crystal', 'diffraction_quality'].includes(r.outcome)
    ).length,
    failure: rows.filter((r: any) =>
      outcomeBinary ? r.outcome === 0 : ['clear', 'precipitate'].includes(r.outcome)
    ).length,
  };

  if (format === 'csv') {
    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(','),
      ...rows.map((row: any) =>
        headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',')
      ),
    ];

    return new NextResponse(csvRows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="crystallization_ml_dataset.csv"',
      },
    });
  }

  return NextResponse.json({ stats, data: rows });
}
