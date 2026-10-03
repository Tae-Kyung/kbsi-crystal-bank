import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service Role 클라이언트 — RLS 바이패스
 * MCP 엔드포인트 등 인증 없이 서버 사이드에서 데이터를 읽을 때 사용
 * 주의: 이 클라이언트는 절대 클라이언트 사이드에 노출하면 안 됨
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServiceClient(): ReturnType<typeof createSupabaseClient<any>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
