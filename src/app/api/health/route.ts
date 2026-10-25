import { NextResponse } from 'next/server';
import { getDbStatus } from '@/lib/db';

export async function GET() {
  const status = await getDbStatus();

  return NextResponse.json({
    status: status.primary === 'active' ? 'healthy' : 'degraded',
    db: status,
    timestamp: new Date().toISOString(),
  }, {
    status: status.primary === 'active' ? 200 : 503,
  });
}
