import { NextRequest, NextResponse } from 'next/server';
import { designScreen } from '@/lib/screen-designer';

/**
 * Custom Crystallization Screen Designer API
 *
 * GET /api/screen-design?protein_id=6367
 * Returns: ScreenDesign object with 24 optimized conditions
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const proteinIdStr = searchParams.get('protein_id');

  if (!proteinIdStr) {
    return NextResponse.json(
      { error: 'protein_id query parameter is required' },
      { status: 400 }
    );
  }

  const proteinId = parseInt(proteinIdStr, 10);
  if (isNaN(proteinId) || proteinId <= 0) {
    return NextResponse.json(
      { error: 'protein_id must be a positive integer' },
      { status: 400 }
    );
  }

  try {
    const design = await designScreen(proteinId);
    return NextResponse.json(design);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('not found') || message.includes('Not enough') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
