import { NextResponse } from 'next/server';
import { switchToPg, switchToSupabase, switchToAuto, getDbStatus } from '@/lib/db';

/**
 * POST /api/admin/switchover
 * Body: { "target": "pg" | "supabase" | "auto" }
 *
 * Manual DB switchover control
 */
export async function POST(request: Request) {
  const { target } = await request.json();

  switch (target) {
    case 'pg':
      switchToPg();
      break;
    case 'supabase':
      switchToSupabase();
      break;
    case 'auto':
      switchToAuto();
      break;
    default:
      return NextResponse.json({ error: 'target must be "pg", "supabase", or "auto"' }, { status: 400 });
  }

  const status = await getDbStatus();
  return NextResponse.json({
    message: `Switched to ${target}`,
    status,
  });
}

export async function GET() {
  const status = await getDbStatus();
  return NextResponse.json(status);
}
