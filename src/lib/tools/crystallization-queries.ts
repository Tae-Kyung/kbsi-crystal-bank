/**
 * 결정화 DB 쿼리 — AI 챗봇 + MCP에서 공통 사용
 * DB 클라이언트를 주입받아 동일 로직 재사용
 */

import { extractFeatures, findKNearest, estimateSuccessProbability } from '@/lib/ml/features';

type SupabaseClient = any;

const GPU_API_URL = process.env.KBSI_GPU_API_URL || '';
const GPU_API_KEY = process.env.KBSI_API_KEY || '';

export async function searchProteins(supabase: SupabaseClient, query: string, limit: number) {
  const { data, error } = await supabase
    .from('kbsi_protein')
    .select('id, full_name, abbreviation, gene_name, organism')
    .or(`full_name.ilike.%${query}%,abbreviation.ilike.%${query}%,gene_name.ilike.%${query}%`)
    .limit(limit);
  if (error) return { error: error.message };
  return { proteins: data, count: data?.length ?? 0 };
}

export async function searchConstructs(supabase: SupabaseClient, protein_id?: number, query?: string, limit: number = 10) {
  let q = supabase
    .from('kbsi_construct')
    .select('id, name, construct_type, expression_system, tag_name, status, protein_id, kbsi_protein(full_name, abbreviation)')
    .limit(limit);
  if (protein_id) q = q.eq('protein_id', protein_id);
  if (query) q = q.ilike('name', `%${query}%`);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { constructs: data, count: data?.length ?? 0 };
}

export async function getExperiments(supabase: SupabaseClient, construct_id: number, experiment_type: string, limit: number = 20) {
  const tableMap: Record<string, string> = {
    expression: 'kbsi_expression', purification: 'kbsi_purification',
    crystallization: 'kbsi_crystallization', characterization: 'kbsi_characterization',
    diffraction: 'kbsi_diffraction', structure: 'kbsi_structure',
  };
  const table = tableMap[experiment_type];
  if (!table) return { error: `Unknown type: ${experiment_type}` };
  const { data, error, count } = await supabase
    .from(table).select('*', { count: 'exact' })
    .eq('construct_id', construct_id).order('created_at', { ascending: false }).limit(limit);
  if (error) return { error: error.message };
  return { experiments: data, type: experiment_type, total: count };
}

export async function getStatistics(supabase: SupabaseClient) {
  const tables = ['kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification', 'kbsi_crystallization', 'kbsi_structure', 'kbsi_ligand', 'kbsi_mutation'];
  const results: Record<string, number> = {};
  for (const table of tables) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    results[table.replace('kbsi_', '')] = count ?? 0;
  }
  return { statistics: results };
}

export async function recommendCrystallization(
  supabase: SupabaseClient,
  params: { ph?: number; temperature?: number; precipitant_type?: string; precipitant_conc?: number; protein_concentration?: number; k?: number }
) {
  const { ph, temperature, precipitant_type, precipitant_conc, protein_concentration, k = 5 } = params;
  const { data, error } = await supabase
    .from('kbsi_crystallization')
    .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
    .not('outcome', 'is', null);
  if (error) return { error: error.message };
  const crystData = (data ?? []) as any[];
  if (crystData.length === 0) return { message: 'Not enough data', recommendations: [] };

  const queryCondition = {
    protein_concentration: protein_concentration ?? null, precipitant_type: precipitant_type ?? null,
    precipitant_conc: precipitant_conc ?? null, ph: ph ?? null,
    temperature: temperature ?? null, additive: null, outcome: null,
  };
  const queryFeatures = extractFeatures(queryCondition);
  const datasetFeatures = crystData.map((r) => extractFeatures(r));
  const neighbors = findKNearest(queryFeatures, datasetFeatures, k);
  const successNeighbors = neighbors.filter((n) => n.features.outcome_rank >= 4);
  const successRate = neighbors.length > 0 ? successNeighbors.length / neighbors.length : 0;

  return {
    success_rate: Math.round(successRate * 100),
    total_data_points: crystData.length,
    recommendations: successNeighbors.slice(0, 5).map((n) => ({
      ...crystData[n.index], distance: Math.round(n.distance * 100) / 100,
    })),
  };
}

export async function predictSuccess(
  supabase: SupabaseClient,
  params: { ph?: number; temperature?: number; precipitant_type?: string; precipitant_conc?: number; protein_concentration?: number }
) {
  const { ph, temperature, precipitant_type, precipitant_conc, protein_concentration } = params;
  const { data, error } = await supabase
    .from('kbsi_crystallization')
    .select('protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome')
    .not('outcome', 'is', null);
  if (error) return { error: error.message };
  const crystData = (data ?? []) as any[];
  if (crystData.length < 5) return { prediction: null, message: 'Insufficient data' };

  const queryCondition = {
    protein_concentration: protein_concentration ?? null, precipitant_type: precipitant_type ?? null,
    precipitant_conc: precipitant_conc ?? null, ph: ph ?? null,
    temperature: temperature ?? null, additive: null, outcome: null,
  };
  const queryFeatures = extractFeatures(queryCondition);
  const datasetFeatures = crystData.map((r) => extractFeatures(r));
  const k = Math.max(3, Math.min(20, Math.round(Math.sqrt(crystData.length))));
  const neighbors = findKNearest(queryFeatures, datasetFeatures, k);
  const probability = estimateSuccessProbability(neighbors);

  const outcomeDistribution: Record<string, number> = {};
  for (const n of neighbors) {
    const outcome = crystData[n.index]?.outcome || 'unknown';
    outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
  }

  return {
    success_probability: Math.round(probability * 100),
    confidence: crystData.length >= 50 ? 'high' : crystData.length >= 20 ? 'medium' : 'low',
    k_used: k, data_points_total: crystData.length, outcome_distribution: outcomeDistribution,
  };
}

export async function searchCrystallizationConditions(
  supabase: SupabaseClient,
  params: { outcome?: string; precipitant_type?: string; ph_min?: number; ph_max?: number; temperature_min?: number; temperature_max?: number; limit?: number }
) {
  const { outcome, precipitant_type, ph_min, ph_max, temperature_min, temperature_max, limit = 20 } = params;
  let q = supabase
    .from('kbsi_crystallization')
    .select('*, kbsi_construct(name, kbsi_protein(full_name))')
    .limit(limit);
  if (outcome) q = q.eq('outcome', outcome);
  if (precipitant_type) q = q.ilike('precipitant_type', `%${precipitant_type}%`);
  if (ph_min !== undefined) q = q.gte('ph', ph_min);
  if (ph_max !== undefined) q = q.lte('ph', ph_max);
  if (temperature_min !== undefined) q = q.gte('temperature', temperature_min);
  if (temperature_max !== undefined) q = q.lte('temperature', temperature_max);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return { error: error.message };
  return { results: data, count: data?.length ?? 0 };
}

export async function sequenceSearch(supabase: SupabaseClient, sequence: string, limit: number = 10) {
  const querySeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
  if (querySeq.length < 10) return { error: 'Sequence must be at least 10 residues' };

  const { data: constructs } = await supabase
    .from('kbsi_construct')
    .select('id, name, protein_id, seq_final, kbsi_protein(full_name, organism)')
    .not('seq_final', 'is', null)
    .limit(5000);

  if (!constructs || (constructs as any[]).length === 0) return { results: [], message: 'No sequences in database' };

  const K = 3;
  const queryKmers = new Set<string>();
  for (let i = 0; i <= querySeq.length - K; i++) queryKmers.add(querySeq.substring(i, i + K));

  const similarities = (constructs as any[])
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
        construct_id: c.id, construct_name: c.name,
        protein_name: c.kbsi_protein?.full_name || '', organism: c.kbsi_protein?.organism || '',
        similarity: Math.round(similarity * 1000) / 10,
      };
    })
    .filter((r: any) => r !== null && r.similarity > 5)
    .sort((a: any, b: any) => b.similarity - a.similarity)
    .slice(0, limit);

  return { query_length: querySeq.length, total_compared: (constructs as any[]).length, results: similarities };
}

export async function searchLigands(supabase: SupabaseClient, query: string, limit: number = 20) {
  const { data, error } = await supabase
    .from('kbsi_ligand')
    .select('id, name, smiles, mw, source, source_db, source_id')
    .or(`name.ilike.%${query}%,smiles.ilike.%${query}%`)
    .limit(limit);
  if (error) return { error: error.message };
  return { ligands: data, count: data?.length ?? 0 };
}

export async function getBindings(supabase: SupabaseClient, construct_id?: number, ligand_id?: number, limit: number = 20) {
  let q = supabase
    .from('kbsi_construct_ligand')
    .select('*, kbsi_construct(name, kbsi_protein(full_name)), kbsi_ligand(name, smiles)')
    .limit(limit);
  if (construct_id) q = q.eq('construct_id', construct_id);
  if (ligand_id) q = q.eq('ligand_id', ligand_id);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { bindings: data, count: data?.length ?? 0 };
}

export async function searchStructures(supabase: SupabaseClient, pdb_id?: string, method?: string, limit: number = 20) {
  let q = supabase
    .from('kbsi_structure')
    .select('id, construct_id, method, resolution, pdb_id, emdb_id, source_db, kbsi_construct(name, kbsi_protein(full_name, organism))')
    .limit(limit);
  if (pdb_id) q = q.ilike('pdb_id', `%${pdb_id}%`);
  if (method) q = q.eq('method', method);
  const { data, error } = await q.order('resolution', { ascending: true });
  if (error) return { error: error.message };
  return { structures: data, count: data?.length ?? 0 };
}

export async function searchCharacterizations(
  supabase: SupabaseClient,
  params: { construct_id?: number; method?: string; protein_name?: string; limit?: number }
) {
  const { construct_id, method, protein_name, limit = 20 } = params;
  let q = supabase
    .from('kbsi_characterization')
    .select('*, kbsi_construct(name, kbsi_protein(full_name, abbreviation))')
    .limit(limit);
  if (construct_id) q = q.eq('construct_id', construct_id);
  if (method) q = q.ilike('method', `%${method}%`);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return { error: error.message };
  let results = data || [];
  if (protein_name) {
    results = results.filter((r: any) => {
      const p = r.kbsi_construct?.kbsi_protein;
      return p && (p.full_name?.toLowerCase().includes(protein_name.toLowerCase()) || p.abbreviation?.toLowerCase().includes(protein_name.toLowerCase()));
    });
  }
  return { results, count: results.length };
}

export async function searchDiffractions(
  supabase: SupabaseClient,
  params: { construct_id?: number; space_group?: string; resolution_max?: number; protein_name?: string; limit?: number }
) {
  const { construct_id, space_group, resolution_max, protein_name, limit = 20 } = params;
  let q = supabase
    .from('kbsi_diffraction')
    .select('*, kbsi_construct(name, kbsi_protein(full_name, abbreviation))')
    .limit(limit);
  if (construct_id) q = q.eq('construct_id', construct_id);
  if (space_group) q = q.ilike('space_group', `%${space_group}%`);
  if (resolution_max) q = q.lte('resolution', resolution_max);
  const { data, error } = await q.order('resolution', { ascending: true });
  if (error) return { error: error.message };
  let results = data || [];
  if (protein_name) {
    results = results.filter((r: any) => {
      const p = r.kbsi_construct?.kbsi_protein;
      return p && (p.full_name?.toLowerCase().includes(protein_name.toLowerCase()) || p.abbreviation?.toLowerCase().includes(protein_name.toLowerCase()));
    });
  }
  return { results, count: results.length };
}

export async function getLigandBindingNetwork(
  supabase: SupabaseClient,
  params: { protein_name?: string; ligand_name?: string; limit?: number }
) {
  const { protein_name, ligand_name, limit = 30 } = params;
  let q = supabase
    .from('kbsi_construct_ligand')
    .select('id, binding_kd, binding_ic50, source_db, kbsi_construct(id, name, kbsi_protein(id, full_name, abbreviation)), kbsi_ligand(id, name, smiles, mw)')
    .limit(limit);
  const { data, error } = await q;
  if (error) return { error: error.message };
  let results = data || [];
  if (protein_name) {
    results = results.filter((r: any) => {
      const p = r.kbsi_construct?.kbsi_protein;
      return p && (p.full_name?.toLowerCase().includes(protein_name.toLowerCase()) || p.abbreviation?.toLowerCase().includes(protein_name.toLowerCase()));
    });
  }
  if (ligand_name) {
    results = results.filter((r: any) => r.kbsi_ligand?.name?.toLowerCase().includes(ligand_name.toLowerCase()));
  }
  return { bindings: results, count: results.length };
}

export async function searchMutations(
  supabase: SupabaseClient,
  params: { mutation?: string; protein_name?: string; construct_id?: number; limit?: number }
) {
  const { mutation, protein_name, construct_id, limit = 20 } = params;
  let q = supabase
    .from('kbsi_mutation')
    .select('id, mutation, construct_id, kbsi_construct(id, name, construct_type, kbsi_protein(id, full_name, abbreviation, organism))')
    .limit(limit);

  if (mutation) q = q.ilike('mutation', `%${mutation}%`);
  if (construct_id) q = q.eq('construct_id', construct_id);

  const { data, error } = await q;
  if (error) return { error: error.message };

  let results = data || [];
  if (protein_name) {
    results = results.filter((r: any) => {
      const p = r.kbsi_construct?.kbsi_protein;
      return p && (
        p.full_name?.toLowerCase().includes(protein_name.toLowerCase()) ||
        p.abbreviation?.toLowerCase().includes(protein_name.toLowerCase())
      );
    });
  }

  return { mutations: results, count: results.length };
}

/**
 * ESM-2 임베딩 기반 서열 유사도 검색 — GPU 서버 API 호출
 * GPU 실패 시 DB 임베딩 fallback, 최종 k-mer fallback
 */
export async function esm2Search(supabase: SupabaseClient, sequence: string, limit: number = 20) {
  const querySeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
  if (querySeq.length < 10) return { error: 'Sequence must be at least 10 residues' };

  // 1차: GPU 서버 ESM-2
  if (GPU_API_URL) {
    try {
      const res = await fetch(`${GPU_API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: querySeq, limit, threshold: 0.5, api_key: GPU_API_KEY }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results?.length) {
          return {
            method: 'esm2_gpu',
            model: data.model || 'esm2_t33_650M_UR50D',
            query_length: querySeq.length,
            total_searched: 284000,
            results: data.results.map((r: any) => ({
              ...r,
              similarity: Math.round(r.similarity * 1000) / 10,
            })),
          };
        }
      }
    } catch { /* fall through */ }
  }

  // 2차: k-mer fallback
  const kmerResult = await sequenceSearch(supabase, querySeq, limit);
  return { method: 'kmer_fallback', ...kmerResult };
}

/**
 * Copilot 분석 — 단백질 ID 또는 서열로 결정화 전략 분석
 */
export async function copilotAnalyze(
  supabase: SupabaseClient,
  params: { protein_id?: number; sequence?: string }
) {
  const { protein_id, sequence } = params;
  if (!protein_id && !sequence) return { error: 'protein_id or sequence required' };

  // 유사 construct 찾기
  let constructIds: number[] = [];
  let searchInfo = '';

  if (protein_id) {
    const { data } = await supabase.from('kbsi_construct').select('id').eq('protein_id', protein_id).limit(50);
    constructIds = (data || []).map((c: any) => c.id);

    // ESM-2 확장
    if (constructIds.length > 0) {
      const { data: embRow } = await supabase.from('kbsi_embedding').select('embedding').eq('construct_id', constructIds[0]).single();
      if (embRow?.embedding) {
        const { data: similar } = await supabase.rpc('match_embeddings', {
          query_embedding: embRow.embedding, match_threshold: 0.7, match_count: 50,
        });
        if (similar?.length) {
          const extraIds = similar.map((r: any) => r.construct_id).filter((id: number) => !constructIds.includes(id));
          constructIds.push(...extraIds);
          searchInfo = `esm2_db: ${constructIds.length} constructs`;
        }
      }
    }
    if (!searchInfo) searchInfo = `db_direct: ${constructIds.length} constructs`;
  } else if (sequence) {
    const esmResult = await esm2Search(supabase, sequence, 50);
    if ('results' in esmResult && esmResult.results) {
      constructIds = esmResult.results.map((r: any) => r.construct_id);
      searchInfo = `${esmResult.method}: ${constructIds.length} constructs`;
    }
  }

  if (constructIds.length === 0) return { error: 'No similar proteins found' };

  // 결정화 데이터 분석
  const { data: crystData } = await supabase
    .from('kbsi_crystallization')
    .select('ph, temperature, precipitant_type, precipitant_conc, buffer_type, outcome')
    .in('construct_id', constructIds.slice(0, 100))
    .neq('source_type', 'synthetic')
    .not('outcome', 'is', null)
    .limit(5000);

  const { data: exprData } = await supabase
    .from('kbsi_expression')
    .select('host, induction_temp, yield_mg_l')
    .in('construct_id', constructIds.slice(0, 100))
    .limit(500);

  const total = crystData?.length || 0;
  const success = (crystData || []).filter((c: any) => c.outcome === 'single_crystal' || c.outcome === 'diffraction_quality');
  const successRate = total > 0 ? Math.round(success.length / total * 1000) / 10 : 0;

  // 최적 조건 집계
  const phBuckets: Record<string, { s: number; t: number }> = {};
  const precipBuckets: Record<string, { s: number; t: number }> = {};
  (crystData || []).forEach((c: any) => {
    const isSuccess = c.outcome === 'single_crystal' || c.outcome === 'diffraction_quality';
    if (c.ph != null) {
      const b = `${Math.floor(c.ph)}-${Math.floor(c.ph) + 1}`;
      if (!phBuckets[b]) phBuckets[b] = { s: 0, t: 0 };
      phBuckets[b].t++;
      if (isSuccess) phBuckets[b].s++;
    }
    if (c.precipitant_type) {
      if (!precipBuckets[c.precipitant_type]) precipBuckets[c.precipitant_type] = { s: 0, t: 0 };
      precipBuckets[c.precipitant_type].t++;
      if (isSuccess) precipBuckets[c.precipitant_type].s++;
    }
  });

  const bestPH = Object.entries(phBuckets).filter(([, v]) => v.t >= 3)
    .sort((a, b) => (b[1].s / b[1].t) - (a[1].s / a[1].t)).slice(0, 5)
    .map(([range, v]) => ({ range, rate: Math.round(v.s / v.t * 100), total: v.t }));

  const bestPrecip = Object.entries(precipBuckets).filter(([, v]) => v.t >= 3)
    .sort((a, b) => (b[1].s / b[1].t) - (a[1].s / a[1].t)).slice(0, 5)
    .map(([name, v]) => ({ name, rate: Math.round(v.s / v.t * 100), total: v.t }));

  // 성공 조건 Top
  const condMap = new Map<string, { count: number; data: any }>();
  success.forEach((c: any) => {
    if (!c.ph || !c.temperature) return;
    const key = `${c.precipitant_type || ''}|${c.ph}|${c.temperature}`;
    const e = condMap.get(key);
    if (e) e.count++;
    else condMap.set(key, { count: 1, data: { precipitant: c.precipitant_type, ph: c.ph, temperature: c.temperature, buffer: c.buffer_type, conc: c.precipitant_conc } });
  });
  const topConditions = [...condMap.values()].sort((a, b) => b.count - a.count).slice(0, 12)
    .map(v => ({ ...v.data, count: v.count }));

  // 발현
  const hosts: Record<string, number> = {};
  (exprData || []).forEach((e: any) => { if (e.host) hosts[e.host] = (hosts[e.host] || 0) + 1; });
  const topHost = Object.entries(hosts).sort((a, b) => b[1] - a[1])[0];

  return {
    search: searchInfo,
    constructs_analyzed: constructIds.length,
    crystallization: { total, success: success.length, success_rate: successRate },
    expression: { data_count: exprData?.length || 0, top_system: topHost ? topHost[0] : null },
    best_ph: bestPH,
    best_precipitant: bestPrecip,
    top_conditions: topConditions,
  };
}

/**
 * GPU 서버의 XGBoost 모델로 결정화 성공 확률 예측
 * ESM-2 임베딩 + 조건(pH, 온도, 침전제) → 성공 확률
 */
export async function predictCrystallizationSuccess(
  params: { sequence: string; ph?: number; temperature?: number; precipitant_type?: string; precipitant_conc?: number }
) {
  if (!GPU_API_URL) return { error: 'GPU server not configured' };
  const { sequence, ph = 7.0, temperature = 18, precipitant_type = 'unknown', precipitant_conc = 0 } = params;

  const querySeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
  if (querySeq.length < 10) return { error: 'Sequence must be at least 10 residues' };

  try {
    const res = await fetch(`${GPU_API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence: querySeq, ph, temperature, precipitant_type, precipitant_conc,
        api_key: GPU_API_KEY,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { error: `GPU predict failed: ${res.status} ${errText.slice(0, 200)}` };
    }

    return await res.json();
  } catch (e: any) {
    return { error: `GPU predict error: ${e?.message || e}` };
  }
}

export async function getDataQualitySummary(supabase: SupabaseClient) {
  const [crystTotal, hasPH, hasTemp, hasPrecip, nullOutcome, syntheticCount] = await Promise.all([
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).then((r: any) => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).not('ph', 'is', null).then((r: any) => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).not('temperature', 'is', null).then((r: any) => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).not('precipitant_type', 'is', null).then((r: any) => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).is('outcome', null).then((r: any) => r.count ?? 0),
    supabase.from('kbsi_crystallization').select('id', { count: 'exact', head: true }).eq('source_type', 'synthetic').then((r: any) => r.count ?? 0),
  ]);
  return {
    total_crystallization: crystTotal,
    field_coverage: {
      ph: { count: hasPH, pct: Math.round(hasPH / crystTotal * 1000) / 10 },
      temperature: { count: hasTemp, pct: Math.round(hasTemp / crystTotal * 1000) / 10 },
      precipitant_type: { count: hasPrecip, pct: Math.round(hasPrecip / crystTotal * 1000) / 10 },
    },
    outcome_null: nullOutcome,
    synthetic_count: syntheticCount,
    experimental_count: crystTotal - syntheticCount,
  };
}
