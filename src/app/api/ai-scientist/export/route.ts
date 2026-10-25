import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const RESULTS_DIR = resolve(process.cwd(), 'data', 'ai-scientist-results');

/**
 * GET /api/ai-scientist/export
 *   ?format=sakana   — Sakana AI Scientist 입력 형식
 *   ?format=dataset   — 가설별 원본 데이터셋 (CSV)
 *   ?id=PH008         — 특정 가설만
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'sakana';
  const id = searchParams.get('id');

  // Load all results
  const results: any[] = [];
  if (existsSync(RESULTS_DIR)) {
    const files = readdirSync(RESULTS_DIR).filter(f => f.endsWith('-latest.json'));
    for (const file of files) {
      try {
        const content = JSON.parse(readFileSync(resolve(RESULTS_DIR, file), 'utf-8'));
        if (!id || content.id === id) results.push(content);
      } catch { /* skip */ }
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: 'No results found. Run: npx tsx scripts/ai-scientist-v2.ts' }, { status: 404 });
  }

  // --- Sakana AI Scientist format ---
  if (format === 'sakana') {
    const sakanaInput = {
      _meta: {
        format: 'sakana-ai-scientist',
        version: '1.0',
        generated_at: new Date().toISOString(),
        source: 'KBSI-CrystalBank AI Scientist v2',
        database: {
          proteins: 59349,
          crystallization_records: 1659500,
          ligands: 186856,
          bindings: 909197,
          embeddings: 214918,
        },
      },
      hypotheses: results.map(r => ({
        id: r.id,
        name: r.name,
        null_hypothesis: r.h0,
        alternative_hypothesis: r.h1,
        status: r.status,
        statistical_test: r.test_type,
        p_value: r.p_value,
        effect_size: r.effect_size,
        confidence_interval: r.ci_lower != null ? { lower: r.ci_lower, upper: r.ci_upper } : null,
        sample_size: r.sample_size,
        summary: r.summary,
        source: r.source || 'built-in',
        data: r.data?.raw_sample || null,
        sql_query: r.data?.sql || null,
        timestamp: r.timestamp,
      })),
      experiment_templates: results
        .filter(r => r.status === 'confirmed')
        .map(r => ({
          hypothesis_id: r.id,
          suggested_experiment: generateExperimentSuggestion(r),
        })),
      database_access: {
        web: 'https://kbsi-crystal-bank.vercel.app',
        api: 'https://kbsi-crystal-bank.vercel.app/api',
        mcp: 'https://kbsi-crystal-bank.vercel.app/api/mcp',
        tools: 18,
      },
    };

    return NextResponse.json(sakanaInput, {
      headers: {
        'Content-Disposition': `attachment; filename="kbsi-ai-scientist-sakana-input.json"`,
      },
    });
  }

  // --- Dataset format (CSV) ---
  if (format === 'dataset') {
    if (!id) {
      return NextResponse.json({ error: 'Specify ?id=PH001 for dataset export' }, { status: 400 });
    }

    const hypothesis = results[0];
    if (!hypothesis) {
      return NextResponse.json({ error: `Hypothesis ${id} not found` }, { status: 404 });
    }

    // Query raw data for this hypothesis
    const datasetQuery = getDatasetQuery(hypothesis.id);
    if (!datasetQuery) {
      return NextResponse.json({ error: `No dataset query for ${id}` }, { status: 400 });
    }

    const data = await query(datasetQuery);

    if (data.length === 0) {
      return NextResponse.json({ error: 'No data' }, { status: 404 });
    }

    // CSV
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map((row: any) =>
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(',')
      ),
    ];

    return new Response(csvRows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kbsi-ai-scientist-${id}-dataset.csv"`,
      },
    });
  }

  return NextResponse.json({ error: 'format must be "sakana" or "dataset"' }, { status: 400 });
}

function generateExperimentSuggestion(result: any): string {
  switch (result.id) {
    case 'PH001': return 'Test crystallization of small (<20kDa) vs large (>100kDa) proteins under identical conditions (PEG 3350, pH 7.0, 18°C) to verify MW effect on crystal quality.';
    case 'PH002': return 'Compare crystallization success across 5 organisms using standardized JCSG+ screen to verify organism-specific optimization.';
    case 'PH003': return 'Express the same protein in E. coli BL21(DE3) vs BL21-Gold vs insect cells, then crystallize under identical conditions.';
    case 'PH004': return 'Screen PEG 1000/3350/8000/20000 against proteins of varying MW (10/30/50/100 kDa) to map the PEG-protein MW correlation.';
    case 'PH005': return 'Crystallize 10 proteins with and without their known ligands to verify ligand stabilization effect.';
    case 'PH006': return 'Set up duplicate crystallization plates at 4°C and 18°C for 20 proteins to quantify temperature effect.';
    case 'PH007': return 'Screen PEG 3350 pH 5-9 and Ammonium Sulfate pH 5-9 in parallel to map optimal pH per precipitant.';
    case 'PH008': return 'Add glycerol, DTT, or MgCl2 to existing crystallization conditions that failed, to test if additives rescue crystallization.';
    case 'D001': return 'Compare crystallization of S. stipitis vs S. habrochaites proteins to understand organism-specific factors.';
    case 'D002': return 'Use 3-methyl-1,5-pentanediol as precipitant for proteins targeting sub-1Å resolution.';
    case 'D003': return 'Screen C. parasitica proteins at pH 4-5 (vs standard pH 7) to verify acidic pH preference.';
    case 'D004': return 'Crystallize B. diminuta proteins exclusively at 4°C to leverage its cold-preference.';
    case 'D005': return 'Optimize precipitant concentration in 15-35% range with fine grid (2% steps) for maximum success rate.';
    default: return 'Design a controlled experiment to validate this statistical finding.';
  }
}

function getDatasetQuery(id: string): string | null {
  const queries: Record<string, string> = {
    PH001: `SELECT c.theoretical_mw, cr.outcome, cr.ph, cr.temperature, cr.precipitant_type, cr.precipitant_conc, p.organism
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      JOIN kbsi_protein p ON p.id = c.protein_id
      WHERE c.theoretical_mw IS NOT NULL AND cr.outcome IS NOT NULL
      ORDER BY random() LIMIT 50000`,
    PH006: `SELECT cr.temperature, cr.outcome, cr.ph, cr.precipitant_type, p.organism
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      JOIN kbsi_protein p ON p.id = c.protein_id
      WHERE cr.temperature IN (4, 18) AND cr.outcome IS NOT NULL
      ORDER BY random() LIMIT 50000`,
    PH007: `SELECT cr.ph, cr.precipitant_type, cr.outcome, cr.temperature
      FROM kbsi_crystallization cr
      WHERE cr.precipitant_type IN ('PEG 3350', 'Ammonium Sulfate') AND cr.ph IS NOT NULL AND cr.outcome IS NOT NULL
      ORDER BY random() LIMIT 50000`,
    PH008: `SELECT cr.additive, cr.outcome, cr.ph, cr.temperature, cr.precipitant_type, cr.precipitant_conc
      FROM kbsi_crystallization cr
      WHERE cr.outcome IS NOT NULL
      ORDER BY random() LIMIT 50000`,
    D002: `SELECT cr.precipitant_type, d.resolution, cr.ph, cr.temperature, p.organism
      FROM kbsi_crystallization cr
      JOIN kbsi_construct c ON c.id = cr.construct_id
      JOIN kbsi_protein p ON p.id = c.protein_id
      JOIN kbsi_diffraction d ON d.construct_id = c.id
      WHERE cr.outcome IN ('single_crystal','diffraction_quality') AND d.resolution IS NOT NULL
      ORDER BY random() LIMIT 50000`,
    D005: `SELECT cr.precipitant_conc, cr.outcome, cr.precipitant_type, cr.ph, cr.temperature
      FROM kbsi_crystallization cr
      WHERE cr.precipitant_conc IS NOT NULL AND cr.outcome IS NOT NULL
      ORDER BY random() LIMIT 50000`,
  };
  return queries[id] || null;
}
