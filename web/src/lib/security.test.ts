import { describe, expect, it } from 'vitest';
import { buildCsp, clientIp, isSameOrigin, sessionCookieName } from './security.ts';

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe('clientIp', () => {
  it('takes the last valid x-forwarded-for hop: the one the Railway edge observed', () => {
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    // a client-supplied first entry must not win
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(h({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('ignores anything that is not an address, and falls back to x-real-ip', () => {
    expect(clientIp(h({ 'x-forwarded-for': 'not-an-ip, <script>' }))).toBeUndefined();
    expect(clientIp(h({ 'x-forwarded-for': 'junk', 'x-real-ip': '198.51.100.4' }))).toBe(
      '198.51.100.4',
    );
    expect(clientIp(h({ 'x-real-ip': 'junk' }))).toBeUndefined();
    expect(clientIp(h({}))).toBeUndefined();
  });
});

describe('buildCsp', () => {
  it('carries the nonce, strict-dynamic and the lock-down directives', () => {
    const csp = buildCsp('abc123', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    for (const d of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "connect-src 'self'",
    ]) {
      expect(csp).toContain(d);
    }
  });

  it('allows unsafe-eval in development only', () => {
    expect(buildCsp('n', true)).toContain("'unsafe-eval'");
    expect(buildCsp('n', false)).not.toContain("'unsafe-eval'");
  });
});

describe('isSameOrigin', () => {
  const app = 'https://crm.sharkx.ae';
  it('trusts Sec-Fetch-Site same-origin and none, refuses same-site and cross-site', () => {
    expect(isSameOrigin({ headers: h({ 'sec-fetch-site': 'same-origin' }) }, app)).toBe(true);
    expect(isSameOrigin({ headers: h({ 'sec-fetch-site': 'none' }) }, app)).toBe(true);
    expect(isSameOrigin({ headers: h({ 'sec-fetch-site': 'same-site' }) }, app)).toBe(false);
    expect(isSameOrigin({ headers: h({ 'sec-fetch-site': 'cross-site' }) }, app)).toBe(false);
  });

  it('falls back to the Origin header, and refuses when neither is there', () => {
    expect(isSameOrigin({ headers: h({ origin: app }) }, app)).toBe(true);
    expect(isSameOrigin({ headers: h({ origin: 'https://evil.example' }) }, app)).toBe(false);
    expect(isSameOrigin({ headers: h({}) }, app)).toBe(false);
  });
});

describe('sessionCookieName', () => {
  it('uses the __Host- prefix everywhere except plain-http local development', () => {
    expect(sessionCookieName('production')).toBe('__Host-sharkx_session');
    expect(sessionCookieName('staging')).toBe('__Host-sharkx_session');
    expect(sessionCookieName('local')).toBe('sharkx_session');
  });
});
