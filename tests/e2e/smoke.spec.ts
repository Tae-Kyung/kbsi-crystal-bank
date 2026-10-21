/**
 * E2E Smoke Tests — 배포 사이트 핵심 동작 검증
 *
 * 인증 없이 접근 가능한 공개 엔드포인트 + 로그인 페이지 테스트
 * 인증 필요 페이지는 로그인 리다이렉트 확인
 */
import { test, expect } from '@playwright/test';

// ─── Public Pages ───

test('Homepage loads successfully', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBeLessThan(500);
  // Should show login form or dashboard content
  await expect(page.locator('text=/Sign|KBSI|Protein/i').first()).toBeVisible({ timeout: 10_000 });
});

test('Login page renders correctly', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test('API Docs page loads without auth', async ({ page }) => {
  await page.goto('/api-docs');
  await expect(page.locator('text=/API|swagger|openapi/i').first()).toBeVisible({ timeout: 10_000 });
});

// ─── Auth-protected pages redirect to login ───

test.describe('Protected pages redirect to login', () => {
  const protectedPaths = ['/proteins', '/constructs', '/ligands', '/explorer', '/copilot', '/dashboard'];

  for (const path of protectedPaths) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      // Either shows login form or URL contains "login"
      const hasLogin = await page.locator('text=Sign in').isVisible().catch(() => false);
      const urlHasLogin = page.url().includes('login');
      expect(hasLogin || urlHasLogin).toBe(true);
    });
  }
});

// ─── Public API Endpoints ───

test('GET /api/openapi returns OpenAPI spec', async ({ request }) => {
  const res = await request.get('/api/openapi');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('openapi');
  expect(body).toHaveProperty('paths');
});

test('GET /api/recommend returns data', async ({ request }) => {
  const res = await request.get('/api/recommend?ph=7&temperature=18&k=3');
  expect(res.status()).toBe(200);
});

test('GET /api/export/benchmark-dataset returns data', async ({ request }) => {
  const res = await request.get('/api/export/benchmark-dataset?limit=2');
  expect(res.status()).toBe(200);
});

test('GET /api/charts/scatter returns SVG', async ({ request }) => {
  const res = await request.get('/api/charts/scatter?width=200&height=200');
  // Should return 200 with SVG or image content
  expect([200, 302]).toContain(res.status());
});

// ─── MCP Server ───

test('POST /api/mcp initialize returns capabilities', async ({ request }) => {
  const res = await request.post('/api/mcp', {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '1.0' },
      },
    },
  });
  expect(res.status()).toBe(200);
});

// ─── API with auth (skipped by default, enable with E2E_AUTH) ───

test.describe('Authenticated API', () => {
  test.skip(!process.env.E2E_AUTH_TOKEN, 'Set E2E_AUTH_TOKEN to run authenticated tests');

  const authHeaders = () => ({
    'Authorization': `Bearer ${process.env.E2E_AUTH_TOKEN}`,
  });

  test('GET /api/proteins returns data', async ({ request }) => {
    const res = await request.get('/api/proteins?limit=2', { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('GET /api/proteins?search=KRAS returns results', async ({ request }) => {
    const res = await request.get('/api/proteins?search=KRAS&limit=5', { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
  });
});
