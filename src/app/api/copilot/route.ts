import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * POST /api/copilot — Crystallization Copilot
 * 서열 또는 단백질 ID → 유사 단백질 분석 → 실험 전략 추천
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { sequence, protein_id } = body;

  if (!sequence && !protein_id) {
    return NextResponse.json({ error: 'sequence 또는 protein_id 필요' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. 유사 단백질 찾기
  let similarConstructs: any[] = [];
  let searchedCount = 0;

  if (sequence) {
    // 서열 기반 검색 (k-mer Jaccard)
    const querySeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
    if (querySeq.length < 10) {
      return NextResponse.json({ error: '서열은 최소 10잔기 이상' }, { status: 400 });
    }

    const K = 3;
    const queryKmers = new Set<string>();
    for (let i = 0; i <= querySeq.length - K; i++) queryKmers.add(querySeq.substring(i, i + K));

    // 서열 있는 construct 조회 (여러 페이지에서 샘플링)
    const allConstructs: any[] = [];
    for (let off = 0; off < 50000; off += 5000) {
      const { data } = await supabase
        .from('kbsi_construct')
        .select('id, name, protein_id, seq_final, expression_system, theoretical_mw, theoretical_pi, kbsi_protein(full_name, abbreviation, organism)')
        .not('seq_final', 'is', null)
        .range(off, off + 4999);
      if (!data || data.length === 0) break;
      allConstructs.push(...data);
    }

    searchedCount = allConstructs.length;
    if (allConstructs.length > 0) {
      const scored = allConstructs
        .map((c: any) => {
          const seq = (c.seq_final || '').toUpperCase();
          if (seq.length < 10) return null;
          const targetKmers = new Set<string>();
          for (let i = 0; i <= seq.length - K; i++) targetKmers.add(seq.substring(i, i + K));
          let intersection = 0;
          for (const kmer of queryKmers) { if (targetKmers.has(kmer)) intersection++; }
          const union = queryKmers.size + targetKmers.size - intersection;
          const similarity = union > 0 ? intersection / union : 0;
          return { ...c, similarity: Math.round(similarity * 1000) / 10 };
        })
        .filter((r: any) => r && r.similarity > 0)
        .sort((a: any, b: any) => b.similarity - a.similarity);

      // 상위 50개 사용 (유사도가 낮아도 최선의 매칭)
      similarConstructs = scored.slice(0, 50);
    }
  } else if (protein_id) {
    // 단백질 ID로 직접 construct 조회
    const { data } = await supabase
      .from('kbsi_construct')
      .select('id, name, protein_id, expression_system, theoretical_mw, theoretical_pi, kbsi_protein(full_name, abbreviation, organism)')
      .eq('protein_id', protein_id)
      .limit(50);
    similarConstructs = (data || []).map((c: any) => ({ ...c, similarity: 100 }));

    // 같은 유기체의 유사 단백질도 추가
    if (similarConstructs.length > 0) {
      const organism = similarConstructs[0].kbsi_protein?.organism;
      if (organism) {
        const { data: sameOrg } = await supabase
          .from('kbsi_construct')
          .select('id, name, protein_id, expression_system, theoretical_mw, theoretical_pi, kbsi_protein(full_name, abbreviation, organism)')
          .neq('protein_id', protein_id)
          .limit(100);
        if (sameOrg) {
          similarConstructs.push(...sameOrg.map((c: any) => ({ ...c, similarity: 30 })));
        }
      }
    }
  }

  const constructIds = similarConstructs.map((c: any) => c.id);
  if (constructIds.length === 0) {
    return NextResponse.json({ error: '유사 단백질을 찾을 수 없습니다. 서열을 확인해주세요.', recommendations: null });
  }

  const maxSimilarity = similarConstructs[0]?.similarity || 0;

  // 2. 결정화 데이터 분석
  const { data: crystData } = await supabase
    .from('kbsi_crystallization')
    .select('construct_id, ph, temperature, precipitant_type, precipitant_conc, buffer_type, outcome, source_type')
    .in('construct_id', constructIds.slice(0, 100))
    .neq('source_type', 'synthetic')
    .not('outcome', 'is', null)
    .limit(5000);

  // 3. Expression 데이터 분석
  const { data: exprData } = await supabase
    .from('kbsi_expression')
    .select('construct_id, host, strain, induction_temp, yield_mg_l, result_level')
    .in('construct_id', constructIds.slice(0, 100))
    .limit(500);

  // 4. 성공/실패 패턴 분석
  const success = (crystData || []).filter((c: any) => c.outcome === 'single_crystal' || c.outcome === 'diffraction_quality');
  const failure = (crystData || []).filter((c: any) => c.outcome === 'clear' || c.outcome === 'precipitate');
  const total = crystData?.length || 0;

  // pH 분석
  const phBuckets: Record<string, { success: number; total: number }> = {};
  (crystData || []).forEach((c: any) => {
    if (c.ph == null) return;
    const bucket = `${Math.floor(c.ph)}-${Math.floor(c.ph) + 1}`;
    if (!phBuckets[bucket]) phBuckets[bucket] = { success: 0, total: 0 };
    phBuckets[bucket].total++;
    if (c.outcome === 'single_crystal' || c.outcome === 'diffraction_quality') phBuckets[bucket].success++;
  });

  // Temperature 분석
  const tempBuckets: Record<string, { success: number; total: number }> = {};
  (crystData || []).forEach((c: any) => {
    if (c.temperature == null) return;
    const t = c.temperature;
    const label = t <= 4 ? '4°C' : t <= 18 ? '18°C' : t <= 20 ? '20°C' : '25°C+';
    if (!tempBuckets[label]) tempBuckets[label] = { success: 0, total: 0 };
    tempBuckets[label].total++;
    if (c.outcome === 'single_crystal' || c.outcome === 'diffraction_quality') tempBuckets[label].success++;
  });

  // Precipitant 분석
  const precipBuckets: Record<string, { success: number; total: number }> = {};
  (crystData || []).forEach((c: any) => {
    if (!c.precipitant_type) return;
    if (!precipBuckets[c.precipitant_type]) precipBuckets[c.precipitant_type] = { success: 0, total: 0 };
    precipBuckets[c.precipitant_type].total++;
    if (c.outcome === 'single_crystal' || c.outcome === 'diffraction_quality') precipBuckets[c.precipitant_type].success++;
  });

  // Expression 분석
  const exprHosts: Record<string, number> = {};
  const exprTemps: number[] = [];
  const exprYields: number[] = [];
  (exprData || []).forEach((e: any) => {
    if (e.host) exprHosts[e.host] = (exprHosts[e.host] || 0) + 1;
    if (e.induction_temp) exprTemps.push(e.induction_temp);
    if (e.yield_mg_l) exprYields.push(e.yield_mg_l);
  });

  // 상위 성공 조건 추출
  const topConditions = success
    .filter((c: any) => c.ph && c.temperature && c.precipitant_type)
    .slice(0, 20)
    .map((c: any) => ({
      precipitant: c.precipitant_type,
      conc: c.precipitant_conc,
      buffer: c.buffer_type,
      ph: c.ph,
      temperature: c.temperature,
    }));

  // 실패 패턴
  const failPatterns: string[] = [];
  Object.entries(phBuckets).forEach(([range, v]) => {
    if (v.total >= 5 && v.success === 0) failPatterns.push(`pH ${range}에서 ${v.total}건 모두 실패`);
  });
  Object.entries(precipBuckets).forEach(([precip, v]) => {
    const rate = v.total > 0 ? v.success / v.total : 0;
    if (v.total >= 5 && rate < 0.1) failPatterns.push(`${precip}: ${v.total}건 중 성공 ${v.success}건 (${Math.round(rate * 100)}%)`);
  });

  // 5. 추천 생성
  const bestPH = Object.entries(phBuckets)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].success / b[1].total) - (a[1].success / a[1].total))
    .slice(0, 3);

  const bestTemp = Object.entries(tempBuckets)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].success / b[1].total) - (a[1].success / a[1].total))
    .slice(0, 2);

  const bestPrecip = Object.entries(precipBuckets)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].success / b[1].total) - (a[1].success / a[1].total))
    .slice(0, 5);

  const topHost = Object.entries(exprHosts).sort((a, b) => b[1] - a[1])[0];
  const avgTemp = exprTemps.length > 0 ? Math.round(exprTemps.reduce((a, b) => a + b, 0) / exprTemps.length) : null;
  const avgYield = exprYields.length > 0 ? Math.round(exprYields.reduce((a, b) => a + b, 0) / exprYields.length * 10) / 10 : null;

  return NextResponse.json({
    analysis: {
      similar_proteins: similarConstructs.length,
      max_similarity: maxSimilarity,
      total_crystallization: total,
      success_count: success.length,
      failure_count: failure.length,
      success_rate: total > 0 ? Math.round(success.length / total * 1000) / 10 : 0,
      expression_data: exprData?.length || 0,
      searched_constructs: searchedCount || constructIds.length,
    },
    construct_recommendation: {
      expression_system: topHost ? topHost[0] : 'E. coli',
      induction_temp: avgTemp,
      expected_yield: avgYield,
      common_systems: exprHosts,
    },
    crystallization_recommendation: {
      best_ph: bestPH.map(([range, v]) => ({ range, rate: Math.round(v.success / v.total * 100), total: v.total })),
      best_temperature: bestTemp.map(([label, v]) => ({ label, rate: Math.round(v.success / v.total * 100), total: v.total })),
      best_precipitant: bestPrecip.map(([name, v]) => ({ name, rate: Math.round(v.success / v.total * 100), total: v.total })),
      top_conditions: topConditions,
    },
    avoid: failPatterns,
    similar_proteins_sample: similarConstructs.slice(0, 10).map((c: any) => ({
      name: c.kbsi_protein?.abbreviation || c.kbsi_protein?.full_name?.slice(0, 30),
      organism: c.kbsi_protein?.organism,
      similarity: c.similarity,
      mw: c.theoretical_mw ? Math.round(c.theoretical_mw / 1000 * 10) / 10 : null,
    })),
  });
}
