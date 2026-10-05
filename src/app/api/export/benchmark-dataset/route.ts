import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/export/benchmark-dataset
 * 벤치마크용 구조화된 결정화 데이터셋 Export
 * DOI 발급 및 논문 데이터셋 공개용
 *
 * ?format=csv|json (기본: json)
 * ?include_synthetic=true|false (기본: true)
 * ?limit=100000 (기본: 전량)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';
  const includeSynthetic = searchParams.get('include_synthetic') !== 'false';
  const limit = parseInt(searchParams.get('limit') || '999999');

  const supabase = createServiceClient();

  // pagination으로 전량 조회
  let allData: any[] = [];
  let offset = 0;
  const PAGE = 1000;

  while (allData.length < limit) {
    let query = supabase
      .from('kbsi_crystallization')
      .select(`
        id, construct_id, ph, temperature,
        precipitant_type, precipitant_conc, precipitant_unit,
        buffer_type, salt_type, salt_conc,
        protein_concentration, additive, outcome,
        source_type, source_db, source_id,
        kbsi_construct(name, protein_id, expression_system,
          kbsi_protein(full_name, organism))
      `)
      .not('outcome', 'is', null)
      .range(offset, offset + PAGE - 1);

    if (!includeSynthetic) {
      query = query.neq('source_type', 'synthetic');
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  allData = allData.slice(0, limit);

  // 플랫 구조로 변환
  const flatData = allData.map((r: any) => ({
    id: r.id,
    protein_name: r.kbsi_construct?.kbsi_protein?.full_name || null,
    organism: r.kbsi_construct?.kbsi_protein?.organism || null,
    construct_name: r.kbsi_construct?.name || null,
    expression_system: r.kbsi_construct?.expression_system || null,
    ph: r.ph,
    temperature: r.temperature,
    precipitant_type: r.precipitant_type,
    precipitant_conc: r.precipitant_conc,
    precipitant_unit: r.precipitant_unit,
    buffer_type: r.buffer_type,
    salt_type: r.salt_type,
    salt_conc: r.salt_conc,
    protein_concentration: r.protein_concentration,
    additive: r.additive,
    outcome: r.outcome,
    outcome_binary: ['single_crystal', 'diffraction_quality'].includes(r.outcome) ? 1 : 0,
    source_type: r.source_type,
    source_db: r.source_db,
    source_id: r.source_id,
  }));

  if (format === 'csv') {
    if (flatData.length === 0) return new NextResponse('No data', { status: 404 });
    const headers = Object.keys(flatData[0]);
    const csvRows = [
      headers.join(','),
      ...flatData.map((row: any) =>
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(',')
      ),
    ];

    return new NextResponse(csvRows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="kbsi_crystallization_benchmark.csv"',
      },
    });
  }

  return NextResponse.json({
    dataset: {
      name: 'KBSI Protein Crystallization Bank Benchmark Dataset',
      version: '1.0.0',
      date: new Date().toISOString().split('T')[0],
      total_records: flatData.length,
      outcome_distribution: flatData.reduce((acc: any, r: any) => {
        acc[r.outcome] = (acc[r.outcome] || 0) + 1;
        return acc;
      }, {}),
      source_distribution: flatData.reduce((acc: any, r: any) => {
        const src = r.source_db || r.source_type || 'unknown';
        acc[src] = (acc[src] || 0) + 1;
        return acc;
      }, {}),
      features: ['ph', 'temperature', 'precipitant_type', 'precipitant_conc', 'buffer_type', 'salt_type', 'protein_concentration', 'additive'],
      target: 'outcome (6-class) / outcome_binary (2-class)',
      license: 'CC-BY-4.0',
      citation: 'KBSI Protein Crystallization Bank (2026). https://kbsi-crystal-bank.vercel.app',
    },
    data: flatData,
  });
}
