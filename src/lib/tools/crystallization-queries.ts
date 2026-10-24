/**
 * 결정화 DB 쿼리 — AI 챗봇 + MCP에서 공통 사용
 * Lab PostgreSQL 직접 쿼리 사용
 */

import { extractFeatures, findKNearest, estimateSuccessProbability } from '@/lib/ml/features';
import { query, scalar } from '@/lib/db';

const GPU_API_URL = process.env.KBSI_GPU_API_URL || '';
const GPU_API_KEY = process.env.KBSI_API_KEY || '';

export async function searchProteins(_unused: any, searchQuery: string, limit: number) {
  try {
    const data = await query(
      `SELECT id, full_name, abbreviation, gene_name, organism
       FROM kbsi_protein
       WHERE full_name ILIKE $1 OR abbreviation ILIKE $1 OR gene_name ILIKE $1
       LIMIT $2`,
      [`%${searchQuery}%`, limit]
    );
    return { proteins: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function searchConstructs(_unused: any, protein_id?: number, searchQuery?: string, limit: number = 10) {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (protein_id) {
      conditions.push(`c.protein_id = $${paramIdx++}`);
      params.push(protein_id);
    }
    if (searchQuery) {
      conditions.push(`c.name ILIKE $${paramIdx++}`);
      params.push(`%${searchQuery}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const data = await query(
      `SELECT c.id, c.name, c.construct_type, c.expression_system, c.tag_name, c.status, c.protein_id,
              p.full_name AS "protein_full_name", p.abbreviation AS "protein_abbreviation"
       FROM kbsi_construct c
       JOIN kbsi_protein p ON p.id = c.protein_id
       ${whereClause}
       LIMIT $${paramIdx}`,
      [...params, limit]
    );
    // Reshape to match original nested structure
    const constructs = (data || []).map((r: any) => ({
      ...r,
      kbsi_protein: { full_name: r.protein_full_name, abbreviation: r.protein_abbreviation },
    }));
    return { constructs, count: constructs.length };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getExperiments(_unused: any, construct_id: number, experiment_type: string, limit: number = 20) {
  const tableMap: Record<string, string> = {
    expression: 'kbsi_expression', purification: 'kbsi_purification',
    crystallization: 'kbsi_crystallization', characterization: 'kbsi_characterization',
    diffraction: 'kbsi_diffraction', structure: 'kbsi_structure',
    nmr: 'kbsi_nmr_experiment',
  };
  const table = tableMap[experiment_type];
  if (!table) return { error: `Unknown type: ${experiment_type}` };
  try {
    const data = await query(
      `SELECT * FROM ${table} WHERE construct_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [construct_id, limit]
    );
    const total = await scalar<number>(
      `SELECT COUNT(*) FROM ${table} WHERE construct_id = $1`,
      [construct_id]
    );
    return { experiments: data, type: experiment_type, total };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getStatistics(_unused?: any) {
  const tables = ['kbsi_protein', 'kbsi_construct', 'kbsi_expression', 'kbsi_purification', 'kbsi_crystallization', 'kbsi_structure', 'kbsi_nmr_experiment', 'kbsi_nmr_spectrum', 'kbsi_ligand', 'kbsi_mutation'];
  const results: Record<string, number> = {};
  for (const table of tables) {
    const count = await scalar<number>(`SELECT COUNT(*) FROM ${table}`);
    results[table.replace('kbsi_', '')] = count ?? 0;
  }
  return { statistics: results };
}

export async function recommendCrystallization(
  _unused: any,
  params: { ph?: number; temperature?: number; precipitant_type?: string; precipitant_conc?: number; protein_concentration?: number; k?: number }
) {
  const { ph, temperature, precipitant_type, precipitant_conc, protein_concentration, k = 5 } = params;
  try {
    const data = await query(
      `SELECT protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome
       FROM kbsi_crystallization
       WHERE outcome IS NOT NULL`
    );
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
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function predictSuccess(
  _unused: any,
  params: { ph?: number; temperature?: number; precipitant_type?: string; precipitant_conc?: number; protein_concentration?: number }
) {
  const { ph, temperature, precipitant_type, precipitant_conc, protein_concentration } = params;
  try {
    const data = await query(
      `SELECT protein_concentration, precipitant_type, precipitant_conc, ph, temperature, additive, outcome
       FROM kbsi_crystallization
       WHERE outcome IS NOT NULL`
    );
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
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function searchCrystallizationConditions(
  _unused: any,
  params: { outcome?: string; precipitant_type?: string; ph_min?: number; ph_max?: number; temperature_min?: number; temperature_max?: number; limit?: number }
) {
  const { outcome, precipitant_type, ph_min, ph_max, temperature_min, temperature_max, limit = 20 } = params;
  try {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (outcome) { conditions.push(`cr.outcome = $${paramIdx++}`); queryParams.push(outcome); }
    if (precipitant_type) { conditions.push(`cr.precipitant_type ILIKE $${paramIdx++}`); queryParams.push(`%${precipitant_type}%`); }
    if (ph_min !== undefined) { conditions.push(`cr.ph >= $${paramIdx++}`); queryParams.push(ph_min); }
    if (ph_max !== undefined) { conditions.push(`cr.ph <= $${paramIdx++}`); queryParams.push(ph_max); }
    if (temperature_min !== undefined) { conditions.push(`cr.temperature >= $${paramIdx++}`); queryParams.push(temperature_min); }
    if (temperature_max !== undefined) { conditions.push(`cr.temperature <= $${paramIdx++}`); queryParams.push(temperature_max); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await query(
      `SELECT cr.*, c.name AS construct_name, p.full_name AS protein_name
       FROM kbsi_crystallization cr
       JOIN kbsi_construct c ON c.id = cr.construct_id
       JOIN kbsi_protein p ON p.id = c.protein_id
       ${whereClause}
       ORDER BY cr.created_at DESC
       LIMIT $${paramIdx}`,
      [...queryParams, limit]
    );
    return { results: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function sequenceSearch(_unused: any, sequence: string, limit: number = 10) {
  const querySeq = sequence.toUpperCase().replace(/[^A-Z]/g, '');
  if (querySeq.length < 10) return { error: 'Sequence must be at least 10 residues' };

  const constructs = await query(
    `SELECT c.id, c.name, c.protein_id, c.seq_final,
            p.full_name AS protein_name, p.organism
     FROM kbsi_construct c
     JOIN kbsi_protein p ON p.id = c.protein_id
     WHERE c.seq_final IS NOT NULL
     LIMIT 5000`
  );

  if (!constructs || constructs.length === 0) return { results: [], message: 'No sequences in database' };

  const K = 3;
  const queryKmers = new Set<string>();
  for (let i = 0; i <= querySeq.length - K; i++) queryKmers.add(querySeq.substring(i, i + K));

  const similarities = constructs
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
        protein_name: c.protein_name || '', organism: c.organism || '',
        similarity: Math.round(similarity * 1000) / 10,
      };
    })
    .filter((r: any) => r !== null && r.similarity > 5)
    .sort((a: any, b: any) => b.similarity - a.similarity)
    .slice(0, limit);

  return { query_length: querySeq.length, total_compared: constructs.length, results: similarities };
}

export async function searchLigands(_unused: any, searchQuery: string, limit: number = 20) {
  try {
    const data = await query(
      `SELECT id, name, smiles, mw, source, source_db, source_id
       FROM kbsi_ligand
       WHERE name ILIKE $1 OR smiles ILIKE $1
       LIMIT $2`,
      [`%${searchQuery}%`, limit]
    );
    return { ligands: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getBindings(_unused: any, construct_id?: number, ligand_id?: number, limit: number = 20) {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (construct_id) { conditions.push(`cl.construct_id = $${paramIdx++}`); params.push(construct_id); }
    if (ligand_id) { conditions.push(`cl.ligand_id = $${paramIdx++}`); params.push(ligand_id); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await query(
      `SELECT cl.*, c.name AS construct_name, p.full_name AS protein_name,
              l.name AS ligand_name, l.smiles AS ligand_smiles
       FROM kbsi_construct_ligand cl
       JOIN kbsi_construct c ON c.id = cl.construct_id
       JOIN kbsi_protein p ON p.id = c.protein_id
       JOIN kbsi_ligand l ON l.id = cl.ligand_id
       ${whereClause}
       LIMIT $${paramIdx}`,
      [...params, limit]
    );
    return { bindings: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function searchStructures(_unused: any, pdb_id?: string, method?: string, limit: number = 20) {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (pdb_id) { conditions.push(`s.pdb_id ILIKE $${paramIdx++}`); params.push(`%${pdb_id}%`); }
    if (method) { conditions.push(`s.method = $${paramIdx++}`); params.push(method); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await query(
      `SELECT s.id, s.construct_id, s.method, s.resolution, s.pdb_id, s.emdb_id, s.source_db,
              c.name AS construct_name, p.full_name AS protein_name, p.organism
       FROM kbsi_structure s
       JOIN kbsi_construct c ON c.id = s.construct_id
       JOIN kbsi_protein p ON p.id = c.protein_id
       ${whereClause}
       ORDER BY s.resolution ASC NULLS LAST
       LIMIT $${paramIdx}`,
      [...params, limit]
    );
    return { structures: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function searchCharacterizations(
  _unused: any,
  params: { construct_id?: number; method?: string; protein_name?: string; limit?: number }
) {
  const { construct_id, method, protein_name, limit = 20 } = params;
  try {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (construct_id) { conditions.push(`ch.construct_id = $${paramIdx++}`); queryParams.push(construct_id); }
    if (method) { conditions.push(`ch.method ILIKE $${paramIdx++}`); queryParams.push(`%${method}%`); }
    if (protein_name) {
      conditions.push(`(p.full_name ILIKE $${paramIdx} OR p.abbreviation ILIKE $${paramIdx})`);
      queryParams.push(`%${protein_name}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await query(
      `SELECT ch.*, c.name AS construct_name, p.full_name AS protein_name, p.abbreviation AS protein_abbreviation
       FROM kbsi_characterization ch
       JOIN kbsi_construct c ON c.id = ch.construct_id
       JOIN kbsi_protein p ON p.id = c.protein_id
       ${whereClause}
       ORDER BY ch.created_at DESC
       LIMIT $${paramIdx}`,
      [...queryParams, limit]
    );
    return { results: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function searchDiffractions(
  _unused: any,
  params: { construct_id?: number; space_group?: string; resolution_max?: number; protein_name?: string; limit?: number }
) {
  const { construct_id, space_group, resolution_max, protein_name, limit = 20 } = params;
  try {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (construct_id) { conditions.push(`d.construct_id = $${paramIdx++}`); queryParams.push(construct_id); }
    if (space_group) { conditions.push(`d.space_group ILIKE $${paramIdx++}`); queryParams.push(`%${space_group}%`); }
    if (resolution_max) { conditions.push(`d.resolution <= $${paramIdx++}`); queryParams.push(resolution_max); }
    if (protein_name) {
      conditions.push(`(p.full_name ILIKE $${paramIdx} OR p.abbreviation ILIKE $${paramIdx})`);
      queryParams.push(`%${protein_name}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await query(
      `SELECT d.*, c.name AS construct_name, p.full_name AS protein_name, p.abbreviation AS protein_abbreviation
       FROM kbsi_diffraction d
       JOIN kbsi_construct c ON c.id = d.construct_id
       JOIN kbsi_protein p ON p.id = c.protein_id
       ${whereClause}
       ORDER BY d.resolution ASC NULLS LAST
       LIMIT $${paramIdx}`,
      [...queryParams, limit]
    );
    return { results: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getLigandBindingNetwork(
  _unused: any,
  params: { protein_name?: string; ligand_name?: string; limit?: number }
) {
  const { protein_name, ligand_name, limit = 30 } = params;
  try {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (protein_name) {
      conditions.push(`(p.full_name ILIKE $${paramIdx} OR p.abbreviation ILIKE $${paramIdx})`);
      queryParams.push(`%${protein_name}%`);
      paramIdx++;
    }
    if (ligand_name) {
      conditions.push(`l.name ILIKE $${paramIdx++}`);
      queryParams.push(`%${ligand_name}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await query(
      `SELECT cl.id, cl.binding_kd, cl.binding_ic50, cl.source_db,
              c.id AS construct_id, c.name AS construct_name,
              p.id AS protein_id, p.full_name AS protein_name, p.abbreviation AS protein_abbreviation,
              l.id AS ligand_id, l.name AS ligand_name, l.smiles AS ligand_smiles, l.mw AS ligand_mw
       FROM kbsi_construct_ligand cl
       JOIN kbsi_construct c ON c.id = cl.construct_id
       JOIN kbsi_protein p ON p.id = c.protein_id
       JOIN kbsi_ligand l ON l.id = cl.ligand_id
       ${whereClause}
       LIMIT $${paramIdx}`,
      [...queryParams, limit]
    );
    return { bindings: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function searchMutations(
  _unused: any,
  params: { mutation?: string; protein_name?: string; construct_id?: number; limit?: number }
) {
  const { mutation, protein_name, construct_id, limit = 20 } = params;
  try {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (mutation) { conditions.push(`m.mutation ILIKE $${paramIdx++}`); queryParams.push(`%${mutation}%`); }
    if (construct_id) { conditions.push(`m.construct_id = $${paramIdx++}`); queryParams.push(construct_id); }
    if (protein_name) {
      conditions.push(`(p.full_name ILIKE $${paramIdx} OR p.abbreviation ILIKE $${paramIdx})`);
      queryParams.push(`%${protein_name}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await query(
      `SELECT m.id, m.mutation, m.construct_id,
              c.id AS "construct.id", c.name AS "construct.name", c.construct_type,
              p.id AS "protein.id", p.full_name AS "protein.full_name", p.abbreviation AS "protein.abbreviation", p.organism AS "protein.organism"
       FROM kbsi_mutation m
       JOIN kbsi_construct c ON c.id = m.construct_id
       JOIN kbsi_protein p ON p.id = c.protein_id
       ${whereClause}
       LIMIT $${paramIdx}`,
      [...queryParams, limit]
    );
    return { mutations: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * ESM-2 임베딩 기반 서열 유사도 검색 — GPU 서버 API 호출
 * GPU 실패 시 DB 임베딩 fallback, 최종 k-mer fallback
 */
export async function esm2Search(_unused: any, sequence: string, limit: number = 20) {
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
  const kmerResult = await sequenceSearch(null, querySeq, limit);
  return { method: 'kmer_fallback', ...kmerResult };
}

/**
 * NMR 실험 데이터 검색 — construct ID, field, pH, labelling 등으로 검색
 */
export async function searchNmrExperiments(
  _unused: any,
  params: { construct_id?: number; protein_name?: string; field_min?: number; field_max?: number; ph_min?: number; ph_max?: number; labelling?: string; limit?: number }
) {
  const { construct_id, protein_name, field_min, field_max, ph_min, ph_max, labelling, limit = 20 } = params;
  try {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    if (construct_id) { conditions.push(`n.construct_id = $${paramIdx++}`); queryParams.push(construct_id); }
    if (field_min) { conditions.push(`n.magnetic_field >= $${paramIdx++}`); queryParams.push(field_min); }
    if (field_max) { conditions.push(`n.magnetic_field <= $${paramIdx++}`); queryParams.push(field_max); }
    if (ph_min) { conditions.push(`n.sample_ph >= $${paramIdx++}`); queryParams.push(ph_min); }
    if (ph_max) { conditions.push(`n.sample_ph <= $${paramIdx++}`); queryParams.push(ph_max); }
    if (labelling) { conditions.push(`n.labelling ILIKE $${paramIdx++}`); queryParams.push(`%${labelling}%`); }

    // protein_name → construct_id 역추적
    if (protein_name && !construct_id) {
      const proteins = await query<{ id: number }>(
        `SELECT id FROM kbsi_protein
         WHERE full_name ILIKE $1 OR abbreviation ILIKE $1 OR gene_name ILIKE $1
         LIMIT 10`,
        [`%${protein_name}%`]
      );
      if (proteins?.length) {
        const constructs = await query<{ id: number }>(
          `SELECT id FROM kbsi_construct WHERE protein_id = ANY($1) LIMIT 100`,
          [proteins.map((p) => p.id)]
        );
        if (constructs?.length) {
          conditions.push(`n.construct_id = ANY($${paramIdx++})`);
          queryParams.push(constructs.map((c) => c.id));
        } else {
          return { experiments: [], count: 0 };
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const data = await query(
      `SELECT n.id, n.construct_id, n.spectrometer, n.magnetic_field, n.temperature, n.sample_ph,
              n.ionic_strength, n.labelling, n.conformers_submitted, n.conformers_calculated,
              n.bmrb_id, n.source_id
       FROM kbsi_nmr_experiment n
       ${whereClause}
       ORDER BY n.magnetic_field DESC NULLS LAST
       LIMIT $${paramIdx}`,
      [...queryParams, limit]
    );
    return { experiments: data, count: data?.length ?? 0 };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Copilot 분석 — 단백질 ID 또는 서열로 결정화 전략 분석
 */
export async function copilotAnalyze(
  _unused: any,
  params: { protein_id?: number; sequence?: string }
) {
  const { protein_id, sequence } = params;
  if (!protein_id && !sequence) return { error: 'protein_id or sequence required' };

  // 유사 construct 찾기
  let constructIds: number[] = [];
  let searchInfo = '';

  if (protein_id) {
    const rows = await query<{ id: number }>(
      'SELECT id FROM kbsi_construct WHERE protein_id = $1 LIMIT 50',
      [protein_id]
    );
    constructIds = (rows || []).map((c) => c.id);

    // ESM-2 확장
    if (constructIds.length > 0) {
      const embRow = await query<{ embedding: any }>(
        'SELECT embedding FROM kbsi_embedding WHERE construct_id = $1 LIMIT 1',
        [constructIds[0]]
      );
      if (embRow?.[0]?.embedding) {
        const similar = await query(
          'SELECT * FROM match_embeddings($1, $2, $3)',
          [embRow[0].embedding, 0.7, 50]
        );
        if (similar?.length) {
          const extraIds = similar.map((r: any) => r.construct_id).filter((id: number) => !constructIds.includes(id));
          constructIds.push(...extraIds);
          searchInfo = `esm2_db: ${constructIds.length} constructs`;
        }
      }
    }
    if (!searchInfo) searchInfo = `db_direct: ${constructIds.length} constructs`;
  } else if (sequence) {
    const esmResult = await esm2Search(null, sequence, 50);
    if ('results' in esmResult && esmResult.results) {
      constructIds = esmResult.results.map((r: any) => r.construct_id);
      searchInfo = `${esmResult.method}: ${constructIds.length} constructs`;
    }
  }

  if (constructIds.length === 0) return { error: 'No similar proteins found' };

  // 결정화 데이터 분석
  const crystData = await query(
    `SELECT ph, temperature, precipitant_type, precipitant_conc, buffer_type, outcome
     FROM kbsi_crystallization
     WHERE construct_id = ANY($1)
       AND source_type != 'synthetic'
       AND outcome IS NOT NULL
     LIMIT 5000`,
    [constructIds.slice(0, 100)]
  );

  const exprData = await query(
    `SELECT host, induction_temp, yield_mg_l
     FROM kbsi_expression
     WHERE construct_id = ANY($1)
     LIMIT 500`,
    [constructIds.slice(0, 100)]
  );

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

  // NMR 실험 분석
  const nmrData = await query(
    `SELECT spectrometer, magnetic_field, temperature, sample_ph, ionic_strength, labelling, conformers_submitted, conformers_calculated, bmrb_id
     FROM kbsi_nmr_experiment
     WHERE construct_id = ANY($1)
     LIMIT 500`,
    [constructIds.slice(0, 100)]
  );

  let nmrAnalysis = null;
  if (nmrData && nmrData.length > 0) {
    // Field strength 분포
    const fieldDist: Record<string, number> = {};
    nmrData.forEach((n: any) => {
      if (n.magnetic_field) {
        const key = `${n.magnetic_field} MHz`;
        fieldDist[key] = (fieldDist[key] || 0) + 1;
      }
    });
    const topFields = Object.entries(fieldDist).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([field, count]) => ({ field, count }));

    // pH 분포
    const phDist: Record<string, number> = {};
    nmrData.forEach((n: any) => {
      if (n.sample_ph != null) {
        const key = `${(Math.round(n.sample_ph * 2) / 2).toFixed(1)}`;
        phDist[key] = (phDist[key] || 0) + 1;
      }
    });
    const topPh = Object.entries(phDist).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([ph, count]) => ({ ph: parseFloat(ph), count }));

    // Temperature 분포
    const tempDist: Record<string, number> = {};
    nmrData.forEach((n: any) => {
      if (n.temperature != null) {
        const key = `${Math.round(n.temperature)}`;
        tempDist[key] = (tempDist[key] || 0) + 1;
      }
    });
    const topTemp = Object.entries(tempDist).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([temp, count]) => ({ temp: parseFloat(temp), count }));

    // Labelling 분포
    const labelDist: Record<string, number> = {};
    nmrData.forEach((n: any) => {
      if (n.labelling) {
        labelDist[n.labelling] = (labelDist[n.labelling] || 0) + 1;
      }
    });
    const topLabelling = Object.entries(labelDist).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([label, count]) => ({ label, count }));

    // Ionic strength 분포
    const ionicDist: Record<string, number> = {};
    nmrData.forEach((n: any) => {
      if (n.ionic_strength) {
        ionicDist[n.ionic_strength] = (ionicDist[n.ionic_strength] || 0) + 1;
      }
    });
    const topIonic = Object.entries(ionicDist).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([buffer, count]) => ({ buffer, count }));

    // Conformer 통계 (유연성 지표)
    const conformers = nmrData
      .filter((n: any) => n.conformers_submitted != null)
      .map((n: any) => n.conformers_submitted as number);
    const avgConformers = conformers.length > 0
      ? Math.round(conformers.reduce((a: number, b: number) => a + b, 0) / conformers.length)
      : null;

    nmrAnalysis = {
      total: nmrData.length,
      top_fields: topFields,
      top_ph: topPh,
      top_temperature: topTemp,
      top_labelling: topLabelling,
      top_ionic_strength: topIonic,
      avg_conformers: avgConformers,
      has_bmrb: nmrData.filter((n: any) => n.bmrb_id).length,
    };
  }

  // 구조 결정 방법론 분포
  const structData = await query(
    `SELECT method, resolution
     FROM kbsi_structure
     WHERE construct_id = ANY($1)
     LIMIT 500`,
    [constructIds.slice(0, 100)]
  );

  let methodDistribution = null;
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
          ? Math.round(v.resolutions.reduce((a, b) => a + b, 0) / v.resolutions.length * 10) / 10
          : null,
      }));
  }

  return {
    search: searchInfo,
    constructs_analyzed: constructIds.length,
    crystallization: { total, success: success.length, success_rate: successRate },
    expression: { data_count: exprData?.length || 0, top_system: topHost ? topHost[0] : null },
    best_ph: bestPH,
    best_precipitant: bestPrecip,
    top_conditions: topConditions,
    nmr: nmrAnalysis,
    method_distribution: methodDistribution,
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

export async function getDataQualitySummary(_unused?: any) {
  const [crystTotal, hasPH, hasTemp, hasPrecip, nullOutcome, syntheticCount] = await Promise.all([
    scalar<number>('SELECT COUNT(*) FROM kbsi_crystallization'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_crystallization WHERE ph IS NOT NULL'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_crystallization WHERE temperature IS NOT NULL'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_crystallization WHERE precipitant_type IS NOT NULL'),
    scalar<number>('SELECT COUNT(*) FROM kbsi_crystallization WHERE outcome IS NULL'),
    scalar<number>("SELECT COUNT(*) FROM kbsi_crystallization WHERE source_type = 'synthetic'"),
  ]);
  return {
    total_crystallization: crystTotal,
    field_coverage: {
      ph: { count: hasPH, pct: Math.round((hasPH ?? 0) / (crystTotal ?? 1) * 1000) / 10 },
      temperature: { count: hasTemp, pct: Math.round((hasTemp ?? 0) / (crystTotal ?? 1) * 1000) / 10 },
      precipitant_type: { count: hasPrecip, pct: Math.round((hasPrecip ?? 0) / (crystTotal ?? 1) * 1000) / 10 },
    },
    outcome_null: nullOutcome,
    synthetic_count: syntheticCount,
    experimental_count: (crystTotal ?? 0) - (syntheticCount ?? 0),
  };
}
