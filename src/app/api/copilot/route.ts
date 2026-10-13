import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createServiceClient } from '@/lib/supabase/service';

export const maxDuration = 60;

const HF_API_TOKEN = process.env.HUGGINGFACE_API_KEY || '';
const ESM2_MODEL = 'facebook/esm2_t33_650M_UR50D';

/**
 * HuggingFace Inference API로 ESM-2 임베딩 계산 (단일 서열, GPU 불필요)
 * 반환: 1280차원 mean-pooled 벡터
 */
async function computeEsmEmbedding(sequence: string): Promise<number[] | null> {
  if (!HF_API_TOKEN) return null;

  const res = await fetch(
    `https://api-inference.huggingface.co/pipeline/feature-extraction/${ESM2_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: sequence.slice(0, 1022) }),
      signal: AbortSignal.timeout(60000),
    },
  );

  if (!res.ok) return null;

  // HF 반환: [[tok0, tok1, ..., tokN]] — 각 토큰은 1280차원 벡터
  // tok0 = BOS, tok1..tokN-1 = 서열, tokN = EOS → 서열 토큰만 mean pooling
  const data: number[][][] = await res.json();
  const tokens = data[0];
  if (!tokens || tokens.length < 3) return null;

  const seqTokens = tokens.slice(1, -1); // BOS/EOS 제외
  const dim = seqTokens[0].length;
  const mean = new Array(dim).fill(0);
  for (const tok of seqTokens) {
    for (let i = 0; i < dim; i++) mean[i] += tok[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= seqTokens.length;
  return mean;
}

/**
 * POST /api/copilot — Crystallization Copilot
 * 서열 또는 단백질 ID → 유사 단백질 분석 → 실험 전략 추천 + AI 요약
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
  let searchMethod: 'db' | 'esm2_db' | 'esm2' | 'kmer' = 'db';
  let searchedCount = 0;

  if (protein_id) {
    // ── DB 검색 모드: 해당 단백질의 construct → 임베딩으로 유사 서열 확장 ──
    searchMethod = 'db';

    const { data: directConstructs } = await supabase
      .from('kbsi_construct')
      .select('id, name, protein_id, expression_system, theoretical_mw, theoretical_pi, kbsi_protein(full_name, abbreviation, organism)')
      .eq('protein_id', protein_id)
      .limit(50);

    similarConstructs = (directConstructs || []).map((c: any) => ({ ...c, similarity: 100 }));

    // 임베딩이 있으면 pgvector로 유사 서열 확장
    if (similarConstructs.length > 0) {
      const firstId = similarConstructs[0].id;
      const { data: embRow } = await supabase
        .from('kbsi_embedding')
        .select('embedding')
        .eq('construct_id', firstId)
        .single();

      if (embRow?.embedding) {
        searchMethod = 'esm2_db';
        const { data: similar } = await supabase.rpc('match_embeddings', {
          query_embedding: embRow.embedding,
          match_threshold: 0.7,
          match_count: 50,
        });

        if (similar?.length) {
          const existingIds = new Set(similarConstructs.map((c: any) => c.id));
          const newIds = similar
            .filter((r: any) => !existingIds.has(r.construct_id))
            .map((r: any) => r.construct_id);

          if (newIds.length > 0) {
            const { data: extraConstructs } = await supabase
              .from('kbsi_construct')
              .select('id, name, protein_id, expression_system, theoretical_mw, theoretical_pi, kbsi_protein(full_name, abbreviation, organism)')
              .in('id', newIds);

            const simMap = new Map(similar.map((r: any) => [r.construct_id, Math.round(r.similarity * 1000) / 10]));
            if (extraConstructs) {
              similarConstructs.push(...extraConstructs.map((c: any) => ({
                ...c,
                similarity: simMap.get(c.id) || 50,
              })));
            }
          }
          searchedCount = 284000;
        }
      }

      // fallback: 임베딩 없으면 같은 유기체에서 추가
      if (searchMethod === 'db' && similarConstructs.length > 0) {
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
  } else if (sequence) {
    // ── 서열 입력 모드 ──
    const querySeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
    if (querySeq.length < 10) {
      return NextResponse.json({ error: '서열은 최소 10잔기 이상' }, { status: 400 });
    }

    // 1차: HuggingFace Inference API로 ESM-2 임베딩 → pgvector 검색
    try {
      const embedding = await computeEsmEmbedding(querySeq);
      if (embedding) {
        const { data: similar } = await supabase.rpc('match_embeddings', {
          query_embedding: embedding,
          match_threshold: 0.5,
          match_count: 50,
        });

        if (similar?.length) {
          searchMethod = 'esm2';
          searchedCount = 284000;
          const cIds = similar.map((r: any) => r.construct_id);
          const { data: constructs } = await supabase
            .from('kbsi_construct')
            .select('id, name, protein_id, expression_system, theoretical_mw, theoretical_pi, kbsi_protein(full_name, abbreviation, organism)')
            .in('id', cIds);

          const constructMap = new Map((constructs || []).map((c: any) => [c.id, c]));
          similarConstructs = similar.map((r: any) => ({
            ...(constructMap.get(r.construct_id) || {}),
            id: r.construct_id,
            similarity: Math.round(r.similarity * 1000) / 10,
          }));
        }
      }
    } catch {
      // HF API 실패 → k-mer fallback
    }

    // 2차: k-mer fallback (HF 실패 또는 API key 없을 때)
    if (similarConstructs.length === 0) {
      searchMethod = 'kmer';
      const K = 3;
      const queryKmers = new Set<string>();
      for (let i = 0; i <= querySeq.length - K; i++) queryKmers.add(querySeq.substring(i, i + K));

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

      similarConstructs = scored.slice(0, 50);
    }
  }

  const constructIds = similarConstructs.map((c: any) => c.id);
  if (constructIds.length === 0) {
    return NextResponse.json({ error: '유사 단백질을 찾을 수 없습니다. 서열을 확인해주세요.' });
  }

  const maxSimilarity = similarConstructs[0]?.similarity || 0;

  // 2. 결정화 데이터 분석
  const { data: crystData } = await supabase
    .from('kbsi_crystallization')
    .select('construct_id, ph, temperature, precipitant_type, precipitant_conc, buffer_type, protein_concentration, outcome, source_type, additive')
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

  // 4. 성공/실패 분석
  const success = (crystData || []).filter((c: any) => c.outcome === 'single_crystal' || c.outcome === 'diffraction_quality');
  const failure = (crystData || []).filter((c: any) => c.outcome === 'clear' || c.outcome === 'precipitate');
  const total = crystData?.length || 0;
  const successRate = total > 0 ? Math.round(success.length / total * 1000) / 10 : 0;

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

  // 성공 조건 (중복 제거 + 빈도 순)
  const conditionMap = new Map<string, { count: number; data: any }>();
  success.forEach((c: any) => {
    if (!c.ph || !c.temperature) return;
    const key = `${c.precipitant_type || ''}|${c.ph}|${c.temperature}|${c.buffer_type || ''}`;
    const existing = conditionMap.get(key);
    if (existing) { existing.count++; }
    else { conditionMap.set(key, { count: 1, data: { precipitant: c.precipitant_type, conc: c.precipitant_conc, buffer: c.buffer_type, ph: c.ph, temperature: c.temperature, protein_conc: c.protein_concentration } }); }
  });
  const topConditions = [...conditionMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((v) => ({ ...v.data, count: v.count }));

  // 실패 패턴
  const failPatterns: string[] = [];
  Object.entries(phBuckets).forEach(([range, v]) => {
    if (v.total >= 5 && v.success === 0) failPatterns.push(`pH ${range}에서 ${v.total}건 모두 실패`);
  });
  Object.entries(precipBuckets).forEach(([precip, v]) => {
    const rate = v.total > 0 ? v.success / v.total : 0;
    if (v.total >= 5 && rate < 0.1) failPatterns.push(`${precip}: ${v.total}건 중 성공 ${v.success}건 (${Math.round(rate * 100)}%)`);
  });

  // 추천 집계
  const bestPH = Object.entries(phBuckets)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].success / b[1].total) - (a[1].success / a[1].total))
    .slice(0, 5);

  const bestTemp = Object.entries(tempBuckets)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].success / b[1].total) - (a[1].success / a[1].total))
    .slice(0, 4);

  const bestPrecip = Object.entries(precipBuckets)
    .filter(([, v]) => v.total >= 3)
    .sort((a, b) => (b[1].success / b[1].total) - (a[1].success / a[1].total))
    .slice(0, 5);

  const topHost = Object.entries(exprHosts).sort((a, b) => b[1] - a[1])[0];
  const avgTemp = exprTemps.length > 0 ? Math.round(exprTemps.reduce((a, b) => a + b, 0) / exprTemps.length) : null;
  const avgYield = exprYields.length > 0 ? Math.round(exprYields.reduce((a, b) => a + b, 0) / exprYields.length * 10) / 10 : null;

  // 5. AI 실험 전략 요약
  const proteinName = similarConstructs[0]?.kbsi_protein?.full_name || 'Unknown';
  const organism = similarConstructs[0]?.kbsi_protein?.organism || '';

  let aiStrategy = '';
  try {
    const ctx = [
      `단백질: ${proteinName} (${organism})`,
      `검색: ${searchMethod === 'esm2_db' ? 'ESM-2 임베딩 (DB)' : searchMethod === 'esm2' ? 'ESM-2 임베딩 (서열)' : searchMethod === 'db' ? 'DB 직접' : 'k-mer'} | 유사 ${similarConstructs.length}개 (최고 ${maxSimilarity}%)`,
      `결정화: ${total}건 (성공 ${success.length}, 실패 ${failure.length}, 성공률 ${successRate}%)`,
      topHost ? `발현: ${topHost[0]} (${topHost[1]}건)${avgTemp ? `, ${avgTemp}°C` : ''}${avgYield ? `, ${avgYield} mg/L` : ''}` : '',
      bestPH.length ? `최적 pH: ${bestPH.map(([r, v]) => `${r}(${Math.round(v.success / v.total * 100)}%)`).join(', ')}` : '',
      bestTemp.length ? `최적 온도: ${bestTemp.map(([l, v]) => `${l}(${Math.round(v.success / v.total * 100)}%)`).join(', ')}` : '',
      bestPrecip.length ? `최적 침전제: ${bestPrecip.map(([n, v]) => `${n}(${Math.round(v.success / v.total * 100)}%)`).join(', ')}` : '',
      topConditions.length ? `상위 조건: ${topConditions.slice(0, 3).map((c, i) => `${i + 1}) ${c.precipitant || '-'}/pH${c.ph}/${c.temperature}°C(${c.count}건)`).join(' ')}` : '',
      failPatterns.length ? `실패패턴: ${failPatterns.join('; ')}` : '',
    ].filter(Boolean).join('\n');

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: `당신은 KBSI 결정화은행의 구조생물학 전문 AI입니다.
분석 데이터를 바탕으로 실험 전략을 한국어로 작성하세요.
구조: **1) Construct 설계** → **2) 발현 조건** → **3) 결정화 스크린 (상위 12조건)** → **4) 실패 시 대안**
구체적 수치를 포함하고, 실용적으로 작성하세요. Markdown 사용. 500자 이내.`,
      prompt: ctx,
      maxTokens: 600,
    });
    aiStrategy = text;
  } catch {
    // AI 요약 생성 실패 — 무시
  }

  return NextResponse.json({
    analysis: {
      similar_proteins: similarConstructs.length,
      max_similarity: maxSimilarity,
      total_crystallization: total,
      success_count: success.length,
      failure_count: failure.length,
      success_rate: successRate,
      expression_data: exprData?.length || 0,
      searched_constructs: searchedCount || constructIds.length,
      search_method: searchMethod,
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
    ai_strategy: aiStrategy,
  });
}
