/**
 * Supabase 클라이언트 Mock 헬퍼
 *
 * API 테스트에서 실제 DB 연결 없이 Supabase 쿼리를 시뮬레이션.
 * 체이닝 패턴(.from().select().eq().single())을 지원.
 */

import { vi } from 'vitest';

export interface MockQueryResult {
  data: any;
  error: any;
  count?: number;
}

export function createMockSupabaseClient(responses: Record<string, MockQueryResult> = {}) {
  const defaultResponse: MockQueryResult = { data: [], error: null, count: 0 };

  function createQueryBuilder(tableName: string) {
    const getResponse = () => responses[tableName] ?? defaultResponse;

    const builder: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        const r = getResponse();
        return Promise.resolve({
          data: Array.isArray(r.data) ? r.data[0] : r.data,
          error: r.error,
        });
      }),
      maybeSingle: vi.fn().mockImplementation(() => {
        const r = getResponse();
        return Promise.resolve({
          data: Array.isArray(r.data) ? r.data[0] ?? null : r.data,
          error: r.error,
        });
      }),
      // 체이닝 종료 시 자동으로 Promise 반환
      then: vi.fn().mockImplementation((resolve: any) => {
        const r = getResponse();
        return resolve(r);
      }),
    };

    // Promise-like 동작을 위해 then을 추가
    return new Proxy(builder, {
      get(target, prop) {
        if (prop === 'then') {
          return (resolve: any) => resolve(getResponse());
        }
        return target[prop] ?? vi.fn().mockReturnValue(target);
      },
    });
  }

  return {
    from: vi.fn((tableName: string) => createQueryBuilder(tableName)),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'test-user-id' } } }, error: null }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test' } }),
      })),
    },
  };
}

/**
 * Supabase 서버 클라이언트를 mock으로 교체
 */
export function mockSupabaseServer(responses: Record<string, MockQueryResult> = {}) {
  const mockClient = createMockSupabaseClient(responses);

  vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn().mockResolvedValue(mockClient),
  }));

  return mockClient;
}
