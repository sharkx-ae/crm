import { NextRequest, NextResponse } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// next-intl's middleware imports 'next/server' in a way vitest cannot resolve; it only does locale routing, which this
// test is not about, so it is replaced by a pass-through. The CSP and referrer headers are set by our own proxy code.
vi.mock('next-intl/middleware', () => ({
  default: () => (req: NextRequest) => NextResponse.next({ request: req }),
}));

// F3a plan §7.2: the Facebook SDK is allowed on the integrations page only, and nothing may set a COOP header that
// would cut the Embedded Signup popup off from its opener.
const P = '11111111-1111-4111-8111-111111111111';

beforeAll(() => {
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('API_URL', 'http://localhost:4000');
  vi.stubEnv('INTERNAL_API_TOKEN', 'x'.repeat(32));
  vi.stubEnv('APP_ENV', 'local');
  vi.stubEnv('NODE_ENV', 'production');
});
afterAll(() => vi.unstubAllEnvs());

async function csp(path: string): Promise<{ csp: string | null; coop: string | null }> {
  const { default: proxy } = await import('./proxy.ts');
  const req = new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie: 'sharkx_session=abc' },
  });
  const res = proxy(req);
  return {
    csp: res.headers.get('content-security-policy'),
    coop: res.headers.get('cross-origin-opener-policy'),
  };
}

describe('proxy CSP', () => {
  it('adds the Facebook SDK hosts on /<locale>/p/<id>/integrations', async () => {
    for (const locale of ['en', 'ar', 'fr']) {
      const r = await csp(`/${locale}/p/${P}/integrations`);
      expect(r.csp, locale).toContain('https://connect.facebook.net');
      expect(r.csp, locale).toContain('frame-src https://www.facebook.com');
      expect(r.csp, locale).toContain("'strict-dynamic'");
    }
  });

  it('keeps the strict policy everywhere else', async () => {
    for (const path of [
      `/en/p/${P}/overview`,
      `/en/p/${P}/leads`,
      `/en/p/${P}/integrations/whatsapp`,
      '/en/clients',
      '/en/login',
      '/en',
    ]) {
      const r = await csp(path);
      expect(r.csp, path).toBeTruthy();
      expect(r.csp, path).not.toMatch(/facebook|fbcdn|frame-src/);
    }
  });

  it('the static headers in next.config set no Cross-Origin-Opener-Policy', async () => {
    const { default: config } = await import('../next.config.ts');
    const rules = (await config.headers?.()) ?? [];
    const keys = rules.flatMap((r) => r.headers.map((h) => h.key.toLowerCase()));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).not.toContain('cross-origin-opener-policy');
  });

  it('uses a different nonce per request and never sets Cross-Origin-Opener-Policy', async () => {
    const a = await csp(`/en/p/${P}/integrations`);
    const b = await csp(`/en/p/${P}/integrations`);
    expect(a.csp).not.toBe(b.csp);
    expect(a.coop).toBeNull();
    expect(b.coop).toBeNull();
  });
});
