import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const RESULTS_DIR = resolve(process.cwd(), 'data', 'ai-scientist-results');

interface HypothesisResult {
  id: string;
  name: string;
  h0: string;
  h1: string;
  status: 'confirmed' | 'rejected' | 'inconclusive' | 'error';
  p_value: number | null;
  statistic: number | null;
  effect_size: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  sample_size: number;
  test_type: string;
  summary: string;
  data: Record<string, unknown>;
  timestamp: string;
  source: 'built-in' | 'discovered';
}

/**
 * GET /api/ai-scientist — List all latest hypothesis results
 * GET /api/ai-scientist?id=PH001 — Get specific hypothesis result
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!existsSync(RESULTS_DIR)) {
    return NextResponse.json({ results: [], message: 'No results yet. Run: npx tsx scripts/ai-scientist-v2.ts' });
  }

  // Load per-hypothesis latest files
  const files = readdirSync(RESULTS_DIR).filter(f => f.endsWith('-latest.json'));
  const results: HypothesisResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(resolve(RESULTS_DIR, file), 'utf-8');
      const result: HypothesisResult = JSON.parse(content);
      if (id && result.id !== id) continue;
      results.push(result);
    } catch {
      // skip malformed files
    }
  }

  // If no per-hypothesis files, try loading run files
  if (results.length === 0) {
    const runFiles = readdirSync(RESULTS_DIR)
      .filter(f => f.startsWith('run-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (runFiles.length > 0) {
      try {
        const content = readFileSync(resolve(RESULTS_DIR, runFiles[0]), 'utf-8');
        const parsed = JSON.parse(content);
        const items: HypothesisResult[] = Array.isArray(parsed) ? parsed : [parsed];
        for (const r of items) {
          if (id && r.id !== id) continue;
          results.push(r);
        }
      } catch {
        // skip
      }
    }
  }

  if (id) {
    const found = results.find(r => r.id === id);
    return found
      ? NextResponse.json(found)
      : NextResponse.json({ error: `Hypothesis ${id} not found` }, { status: 404 });
  }

  // Summary stats
  const confirmed = results.filter(r => r.status === 'confirmed').length;
  const rejected = results.filter(r => r.status === 'rejected').length;
  const inconclusive = results.filter(r => r.status === 'inconclusive').length;
  const errors = results.filter(r => r.status === 'error').length;

  return NextResponse.json({
    total: results.length,
    confirmed,
    rejected,
    inconclusive,
    errors,
    results: results.sort((a, b) => a.id.localeCompare(b.id)),
  });
}

/**
 * POST /api/ai-scientist — Run a specific hypothesis
 * Body: { id: 'PH001' } or { mode: 'discover' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, mode } = body as { id?: string; mode?: string };

    let cmd = 'npx tsx scripts/ai-scientist-v2.ts';
    if (mode === 'discover') {
      cmd += ' --discover';
    } else if (id) {
      cmd += ` --hypothesis ${id}`;
    }

    // Run asynchronously but return quickly with status
    try {
      execSync(cmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 120000, // 2 minute timeout
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return NextResponse.json({
        status: 'completed',
        message: mode === 'discover'
          ? 'Discovery completed'
          : id
          ? `Hypothesis ${id} completed`
          : 'All hypotheses completed',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { status: 'error', message: msg.substring(0, 500) },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Expected JSON with { id?: string, mode?: string }' },
      { status: 400 }
    );
  }
}
