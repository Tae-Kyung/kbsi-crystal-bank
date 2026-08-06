import { describe, it, expect } from 'vitest';

// UniProt API는 외부 서비스이므로 함수 시그니처와 타입만 검증
// 실제 네트워크 호출 테스트는 integration 테스트에서 수행

describe('UniProt Client', () => {
  it('module exports fetchUniProtEntry', async () => {
    const mod = await import('@/lib/external/uniprot');
    expect(typeof mod.fetchUniProtEntry).toBe('function');
  });

  it('module exports searchUniProt', async () => {
    const mod = await import('@/lib/external/uniprot');
    expect(typeof mod.searchUniProt).toBe('function');
  });
});
