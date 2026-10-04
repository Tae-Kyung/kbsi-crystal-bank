import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import crypto from 'crypto';

/**
 * API Key 발급/조회 시스템
 * GET  /api/api-keys — 내 API Key 목록 조회
 * POST /api/api-keys — 새 API Key 발급
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data: keys } = await service
    .from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, expires_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ keys: keys || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const name = body.name || 'Default';

  // API Key 생성
  const rawKey = `kbsi_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 12);

  const service = createServiceClient();
  const { data, error } = await service
    .from('api_keys')
    .insert({
      user_id: user.id,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1년
    })
    .select('id, name, key_prefix, created_at, expires_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // rawKey는 이 응답에서만 반환 — 다시 조회 불가
  return NextResponse.json({
    message: 'API Key created. Save this key — it will not be shown again.',
    api_key: rawKey,
    ...data,
  }, { status: 201 });
}
