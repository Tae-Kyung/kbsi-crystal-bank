import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { query, queryOne } from '@/lib/db';

export const maxDuration = 60;

const GPU_API_URL = process.env.KBSI_GPU_API_URL || '';
const GPU_API_KEY = process.env.KBSI_API_KEY || '';

/**
 * HuggingFace Inference API로 ESM-2 임베딩 계산 (단일 서열, GPU 불필요)
 * 반환: 1280차원 mean-pooled 벡터
 */
/**
 * GPU 서버 /search API 호출 — 서열 → ESM-2 임베딩 → pgvector 유사 검색을 한번에 수행
 */
/**
 * GPU 서버 /predict API 호출 — 서열 + 조건 → XGBoost + ESM-2 성공 확률 예측
 */
async function gpuPredict(
  sequence: string,
  ph = 7.0,
  temperature = 18,
  precipitant_type = 'unknown',
  precipitant_conc = 0
): Promise<{ success_probability: number; confidence: string } | null> {
  if (!GPU_API_URL) return null;

  try {
    const res = await fetch(`${GPU_API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence, ph, temperature, precipitant_type, precipitant_conc, api_key: GPU_API_KEY }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { success_probability: data.success_probability, confidence: data.confidence };
  } catch {
    return null;
  }
}

async function gpuSearchSimilar(sequence: string, limit = 50, threshold = 0.5): Promise<{ results: any[] | null; debug?: string }> {
  if (!GPU_API_URL) return { results: null, debug: 'KBSI_GPU_API_URL not set' };

  const res = await fetch(`${GPU_API_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence, limit, threshold, api_key: GPU_API_KEY }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { results: null, debug: `GPU ${res.status}: ${errText.slice(0, 200)}` };
  }

  const data = await res.json();
  return { results: data.results || [], debug: `ok model=${data.model} len=${data.query_length}` };
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

  // 1. 유사 단백질 찾기
  let similarConstructs: any[] = [];
  let searchMethod: 'db' | 'esm2_db' | 'esm2' | 'kmer' = 'db';
  let searchedCount = 0;
  let hfDebug = '';

  if (protein_id) {
    // ── DB 검색 모드: 해당 단백질의 construct → 임베딩으로 유사 서열 확장 ──
    searchMethod = 'db';

    const directConstructs = await query(
      `SELECT c.id, c.name, c.protein_id, c.expression_system, c.theoretical_mw, c.theoretical_pi,
              p.full_name AS "kbsi_protein.full_name", p.abbreviation AS "kbsi_protein.abbreviation", p.organism AS "kbsi_protein.organism"
       FROM kbsi_construct c
       JOIN kbsi_protein p ON p.id = c.protein_id
       WHERE c.protein_id = $1
       LIMIT 50`,
      [protein_id]
    );

    similarConstructs = (directConstructs || []).map((c: any) => ({
      ...c,
      kbsi_protein: { full_name: c['kbsi_protein.full_name'], abbreviation: c['kbsi_protein.abbreviation'], organism: c['kbsi_protein.organism'] },
      similarity: 100,
    }));

    // 임베딩이 있으면 pgvector로 유사 서열 확장
    if (similarConstructs.length > 0) {
      const firstId = similarConstructs[0].id;
      const embRow = await queryOne<{ embedding: any }>(
        'SELECT embedding FROM kbsi_embedding WHERE construct_id = $1',
        [firstId]
      );

      if (embRow?.embedding) {
        searchMethod = 'esm2_db';
        const similar = await query(
          'SELECT * FROM match_embeddings($1, $2, $3)',
          [embRow.embedding, 0.7, 50]
        );

        if (similar?.length) {
          const existingIds = new Set(similarConstructs.map((c: any) => c.id));
          const newIds = similar
            .filter((r: any) => !existingIds.has(r.construct_id))
            .map((r: any) => r.construct_id);

          if (newIds.length > 0) {
            const extraConstructs = await query(
              `SELECT c.id, c.name, c.protein_id, c.expression_system, c.theoretical_mw, c.theoretical_pi,
                      p.full_name AS "kbsi_protein.full_name", p.abbreviation AS "kbsi_protein.abbreviation", p.organism AS "kbsi_protein.organism"
               FROM kbsi_construct c
               JOIN kbsi_protein p ON p.id = c.protein_id
               WHERE c.id = ANY($1)`,
              [newIds]
            );

            const simMap = new Map(similar.map((r: any) => [r.construct_id, Math.round(r.similarity * 1000) / 10]));
            if (extraConstructs) {
              similarConstructs.push(...extraConstructs.map((c: any) => ({
                ...c,
                kbsi_protein: { full_name: c['kbsi_protein.full_name'], abbreviation: c['kbsi_protein.abbreviation'], organism: c['kbsi_protein.organism'] },
                similarity: simMap.get(c.id) || 50,
              })));
            }
          }
          searchedCount = 284000;
        }
      }

      // fallback: 임베딩 없으면 같은 유기체에서 추가
      if (searchMethod === 'db' && similarConstructs.length > 0) {
        const sameOrg = await query(
          `SELECT c.id, c.name, c.protein_id, c.expression_system, c.theoretical_mw, c.theoretical_pi,
                  p.full_name AS "kbsi_protein.full_name", p.abbreviation AS "kbsi_protein.abbreviation", p.organism AS "kbsi_protein.organism"
           FROM kbsi_construct c
           JOIN kbsi_protein p ON p.id = c.protein_id
           WHERE c.protein_id != $1
           LIMIT 100`,
          [protein_id]
        );
        if (sameOrg) {
          similarConstructs.push(...sameOrg.map((c: any) => ({
            ...c,
            kbsi_protein: { full_name: c['kbsi_protein.full_name'], abbreviation: c['kbsi_protein.abbreviation'], organism: c['kbsi_protein.organism'] },
            similarity: 30,
          })));
        }
      }
    }
  } else if (sequence) {
    // ── 서열 입력 모드 ──
    const querySeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
    if (querySeq.length < 10) {
      return NextResponse.json({ error: '서열은 최소 10잔기 이상' }, { status: 400 });
    }

    // 1차: GPU 서버 API — ESM-2 임베딩 + pgvector 검색 한번에
    try {
      const gpuResult = await gpuSearchSimilar(querySeq, 50, 0.5);
      hfDebug = gpuResult.debug || '';
      if (gpuResult.results?.length) {
        searchMethod = 'esm2';
        searchedCount = 284000;
        const cIds = gpuResult.results.map((r: any) => r.construct_id);
        const constructs = await query(
          `SELECT c.id, c.name, c.protein_id, c.expression_system, c.theoretical_mw, c.theoretical_pi,
                  p.full_name AS "kbsi_protein.full_name", p.abbreviation AS "kbsi_protein.abbreviation", p.organism AS "kbsi_protein.organism"
           FROM kbsi_construct c
           JOIN kbsi_protein p ON p.id = c.protein_id
           WHERE c.id = ANY($1)`,
          [cIds]
        );

        const constructMap = new Map((constructs || []).map((c: any) => [c.id, c]));
        similarConstructs = gpuResult.results.map((r: any) => {
          const c = constructMap.get(r.construct_id) || {};
          return {
            ...c,
            kbsi_protein: { full_name: (c as any)['kbsi_protein.full_name'], abbreviation: (c as any)['kbsi_protein.abbreviation'], organism: (c as any)['kbsi_protein.organism'] },
            id: r.construct_id,
            similarity: Math.round(r.similarity * 1000) / 10,
          };
        });
      }
    } catch (e: any) {
      hfDebug = `exception: ${e?.message || e}`;
    }

    // 2차: k-mer fallback (HF 실패 또는 API key 없을 때)
    if (similarConstructs.length === 0) {
      searchMethod = 'kmer';
      const K = 3;
      const queryKmers = new Set<string>();
      for (let i = 0; i <= querySeq.length - K; i++) queryKmers.add(querySeq.substring(i, i + K));

      const allConstructs = await query(
        `SELECT c.id, c.name, c.protein_id, c.seq_final, c.expression_system, c.theoretical_mw, c.theoretical_pi,
                p.full_name AS "kbsi_protein.full_name", p.abbreviation AS "kbsi_protein.abbreviation", p.organism AS "kbsi_protein.organism"
         FROM kbsi_construct c
         JOIN kbsi_protein p ON p.id = c.protein_id
         WHERE c.seq_final IS NOT NULL
         LIMIT 50000`
      );

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
          return {
            ...c,
            kbsi_protein: { full_name: c['kbsi_protein.full_name'], abbreviation: c['kbsi_protein.abbreviation'], organism: c['kbsi_protein.organism'] },
            similarity: Math.round(similarity * 1000) / 10,
          };
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
  const crystData = await query(
    `SELECT construct_id, ph, temperature, precipitant_type, precipitant_conc, buffer_type, protein_concentration, outcome, source_type, additive
     FROM kbsi_crystallization
     WHERE construct_id = ANY($1)
       AND source_type != 'synthetic'
       AND outcome IS NOT NULL
     LIMIT 5000`,
    [constructIds.slice(0, 100)]
  );

  // 3. Expression 데이터 분석
  const exprData = await query(
    `SELECT construct_id, host, strain, induction_temp, yield_mg_l, result_level
     FROM kbsi_expression
     WHERE construct_id = ANY($1)
     LIMIT 500`,
    [constructIds.slice(0, 100)]
  );

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
  const precipCategories: Record<string, { success: number; total: number }> = {};
  (crystData || []).forEach((c: any) => {
    if (!c.precipitant_type) return;
    if (!precipBuckets[c.precipitant_type]) precipBuckets[c.precipitant_type] = { success: 0, total: 0 };
    precipBuckets[c.precipitant_type].total++;
    const isSuccess = c.outcome === 'single_crystal' || c.outcome === 'diffraction_quality';
    if (isSuccess) precipBuckets[c.precipitant_type].success++;

    // Category aggregation
    const pt = c.precipitant_type.toLowerCase();
    const cat = pt.includes('peg') ? 'PEG' : (pt.includes('sulfate') || pt.includes('chloride') || pt.includes('phosphate') || pt.includes('citrate') || pt.includes('acetate') || pt.includes('formate') || pt.includes('tartrate') || pt.includes('malonate')) ? 'Salt' : (pt.includes('mpd') || pt.includes('isopropanol') || pt.includes('ethanol') || pt.includes('glycerol') || pt.includes('dmso')) ? 'Organic' : 'Other';
    if (!precipCategories[cat]) precipCategories[cat] = { success: 0, total: 0 };
    precipCategories[cat].total++;
    if (isSuccess) precipCategories[cat].success++;
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

  // 5. NMR 실험 분석 + 방법론 분포
  const nmrData = await query(
    `SELECT spectrometer, magnetic_field, temperature, sample_ph, ionic_strength, labelling, conformers_submitted
     FROM kbsi_nmr_experiment
     WHERE construct_id = ANY($1)
     LIMIT 500`,
    [constructIds.slice(0, 100)]
  );

  const structData = await query(
    `SELECT method, resolution
     FROM kbsi_structure
     WHERE construct_id = ANY($1)
     LIMIT 500`,
    [constructIds.slice(0, 100)]
  );

  let nmrRecommendation: any = null;
  if (nmrData && nmrData.length > 0) {
    const fieldDist: Record<string, number> = {};
    const phDist: Record<string, number> = {};
    const tempDist: Record<string, number> = {};
    const labelDist: Record<string, number> = {};
    const ionicDist: Record<string, number> = {};
    const conformers: number[] = [];

    nmrData.forEach((n: any) => {
      if (n.magnetic_field) { const k = `${n.magnetic_field} MHz`; fieldDist[k] = (fieldDist[k] || 0) + 1; }
      if (n.sample_ph != null) { const k = `${(Math.round(n.sample_ph * 2) / 2).toFixed(1)}`; phDist[k] = (phDist[k] || 0) + 1; }
      if (n.temperature != null) { const k = `${Math.round(n.temperature)}°C`; tempDist[k] = (tempDist[k] || 0) + 1; }
      if (n.labelling) { labelDist[n.labelling] = (labelDist[n.labelling] || 0) + 1; }
      if (n.ionic_strength) { ionicDist[n.ionic_strength] = (ionicDist[n.ionic_strength] || 0) + 1; }
      if (n.conformers_submitted != null) conformers.push(n.conformers_submitted);
    });

    const topOf = (d: Record<string, number>, n: number) =>
      Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, count]) => ({ label, count }));

    nmrRecommendation = {
      total: nmrData.length,
      top_fields: topOf(fieldDist, 5),
      top_ph: topOf(phDist, 5),
      top_temperature: topOf(tempDist, 5),
      top_labelling: topOf(labelDist, 3),
      top_ionic_strength: topOf(ionicDist, 3),
      avg_conformers: conformers.length > 0 ? Math.round(conformers.reduce((a, b) => a + b, 0) / conformers.length) : null,
    };
  }

  let methodDistribution: any[] | null = null;
  if (structData && structData.length > 0) {
    const methods: Record<string, { count: number; resolutions: number[] }> = {};
    structData.forEach((s: any) => {
      const m = s.method || 'unknown';
      if (!methods[m]) methods[m] = { count: 0, resolutions: [] };
      methods[m].count++;
      if (s.resolution != null) methods[m].resolutions.push(s.resolution);
    });
    methodDistribution = Object.entries(methods)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([method, v]) => ({
        method,
        count: v.count,
        pct: Math.round(v.count / structData.length * 100),
        avg_resolution: v.resolutions.length > 0
          ? Math.round(v.resolutions.reduce((a, b) => a + b, 0) / v.resolutions.length * 10) / 10 : null,
      }));
  }

  // 6. 성공 확률 예측 (XGBoost + ESM-2)
  let prediction: { success_probability: number; confidence: string } | null = null;
  if (sequence) {
    const querySeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
    const topCond = topConditions[0];
    prediction = await gpuPredict(
      querySeq,
      topCond?.ph ?? 7.0,
      topCond?.temperature ?? 18,
      topCond?.precipitant ?? 'unknown',
      topCond?.conc ?? 0
    );
  }

  // 6. AI 실험 전략 요약
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
      prediction ? `XGBoost+ESM-2 성공 예측: ${prediction.success_probability}% (${prediction.confidence} confidence)` : '',
      nmrRecommendation ? `NMR 실험: ${nmrRecommendation.total}건 (${nmrRecommendation.top_fields.map((f: any) => f.label).join(', ')})${nmrRecommendation.avg_conformers ? `, 평균 conformer ${nmrRecommendation.avg_conformers}개` : ''}` : '',
      methodDistribution ? `구조결정 방법: ${methodDistribution.map((m: any) => `${m.method} ${m.pct}%`).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: `당신은 KBSI 결정화은행의 구조생물학 전문 AI입니다.
분석 데이터를 바탕으로 실험 전략을 JSON으로 반환하세요. 반드시 아래 형식만 출력하세요.

{"construct":"Construct 설계 추천 (1-2문장, 구체적 잔기 범위/태그/변이 포함)","expression":"발현 조건 추천 (1-2문장, 숙주/온도/유도 조건 포함)","crystallization":"결정화 전략 (2-3문장, 상위 조건 요약 + 핵심 파라미터)","nmr":"NMR 대안 전략 (NMR 데이터가 있으면 1-2문장, 없으면 null)","avoid":"피해야 할 조건 (1-2문장, 실패 패턴 기반)","summary":"한 줄 핵심 요약"}

규칙:
- 각 필드는 한국어, 구체적 수치를 포함
- nmr 필드: NMR 데이터가 컨텍스트에 없으면 반드시 null
- JSON만 출력, 다른 텍스트 없이`,
      prompt: ctx,
      maxTokens: 800,
    });

    // JSON 파싱 시도 — 실패 시 기존 텍스트 그대로 사용
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiStrategy = JSON.stringify(parsed);
      } else {
        aiStrategy = text;
      }
    } catch {
      aiStrategy = text;
    }
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
      hf_debug: hfDebug || undefined,
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
      precipitant_categories: Object.entries(precipCategories)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([cat, v]) => ({ category: cat, rate: v.total > 0 ? Math.round(v.success / v.total * 100) : 0, total: v.total })),
      top_conditions: topConditions,
    },
    avoid: failPatterns,
    similar_proteins_sample: dedupeByProtein(similarConstructs),
    nmr_recommendation: nmrRecommendation,
    method_distribution: methodDistribution,
    ai_strategy: aiStrategy,
    prediction: prediction ? {
      success_probability: prediction.success_probability,
      confidence: prediction.confidence,
      model: 'xgboost_esm2',
      condition_used: topConditions[0] ? {
        ph: topConditions[0].ph,
        temperature: topConditions[0].temperature,
        precipitant: topConditions[0].precipitant,
        conc: topConditions[0].conc,
      } : null,
    } : null,
  });
}

/** 단백질 단위 중복 제거 — protein_id별 최고 유사도 construct만 남김 */
function dedupeByProtein(constructs: any[]): any[] {
  const seen = new Map<number, any>();
  for (const c of constructs) {
    const pid = c.protein_id;
    if (!pid) continue;
    const existing = seen.get(pid);
    if (!existing || c.similarity > existing.similarity) {
      seen.set(pid, c);
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 15)
    .map((c: any) => ({
      name: c.kbsi_protein?.abbreviation || c.kbsi_protein?.full_name?.slice(0, 30),
      organism: c.kbsi_protein?.organism,
      similarity: c.similarity,
      mw: c.theoretical_mw ? Math.round(c.theoretical_mw / 1000 * 10) / 10 : null,
    }));
}
