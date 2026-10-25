import { NextRequest, NextResponse } from 'next/server';
import { predict, type PredictionInput } from '@/lib/prediction-engine';

/**
 * POST /api/predict-v2
 *
 * Real-time crystallization success prediction using Lab PG statistics
 * and optional ESM-2 embedding similarity.
 *
 * Body:
 *   {
 *     protein_id?: number,
 *     construct_id?: number,
 *     ph: number,
 *     temperature: number,
 *     precipitant_type?: string,
 *     precipitant_conc?: number,
 *     protein_concentration?: number
 *   }
 *
 * Response:
 *   {
 *     success_probability: number,   // 0-100%
 *     confidence: 'high' | 'medium' | 'low',
 *     similar_conditions: [...],
 *     recommendation: string,
 *     method: string[],
 *     stats: { db_success_rate, db_total_trials, esm2_success_rate, esm2_similar_count }
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (body.ph == null || body.temperature == null) {
      return NextResponse.json(
        { error: 'Missing required fields: ph and temperature are required.' },
        { status: 400 }
      );
    }

    if (!body.protein_id && !body.construct_id) {
      return NextResponse.json(
        { error: 'At least one of protein_id or construct_id is required.' },
        { status: 400 }
      );
    }

    if (typeof body.ph !== 'number' || body.ph < 0 || body.ph > 14) {
      return NextResponse.json(
        { error: 'pH must be a number between 0 and 14.' },
        { status: 400 }
      );
    }

    if (typeof body.temperature !== 'number') {
      return NextResponse.json(
        { error: 'temperature must be a number.' },
        { status: 400 }
      );
    }

    const input: PredictionInput = {
      protein_id: body.protein_id ?? undefined,
      construct_id: body.construct_id ?? undefined,
      sequence: body.sequence ?? undefined,
      ph: body.ph,
      temperature: body.temperature,
      precipitant_type: body.precipitant_type ?? undefined,
      precipitant_conc: body.precipitant_conc ?? undefined,
      protein_concentration: body.protein_concentration ?? undefined,
    };

    const result = await predict(input);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[predict-v2] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
