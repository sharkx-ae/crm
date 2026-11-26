import { describe, expect, it } from 'vitest';
import {
  buildCsp,
  classifyPath,
  clientIp,
  isMetaPath,
  isSameOrigin,
  sessionCookieName,
} from './security.ts';

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

  it('the default policy never mentions Facebook and has no frame-src', () => {
    for (const csp of [buildCsp('n', false), buildCsp('n', true), buildCsp('n', false, {})]) {
      expect(csp).not.toMatch(/facebook|fbcdn/);
      expect(csp).not.toContain('frame-src');
    }
    expect(buildCsp('n', false, { meta: false })).toBe(buildCsp('n', false));
  });

  it('the Meta variant adds only the SDK, frame, connect and image hosts and keeps every lock-down', () => {
    const csp = buildCsp('abc123', false, { meta: true });
    expect(csp).toContain(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' https://connect.facebook.net",
    );
    expect(csp).toContain(
      'frame-src https://www.facebook.com https://web.facebook.com https://staticxx.facebook.com',
    );
    expect(csp).toContain("connect-src 'self' https://*.facebook.com https://graph.facebook.com");
    expect(csp).toContain("img-src 'self' data: blob: https://*.facebook.com https://*.fbcdn.net");
    for (const d of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
    ]) {
      expect(csp).toContain(d);
    }
    expect(csp).not.toContain('unsafe-eval');
    // no wildcard host beyond the two Meta ones, and no bare scheme or star source
    expect(csp.match(/[^\s;]*\*[^\s;]*/g)).toEqual([
      'https://*.facebook.com',
      'https://*.fbcdn.net',
      'https://*.facebook.com',
    ]);
    expect(csp).not.toMatch(/ https?:( |;|$)/);
  });
});

describe('isMetaPath', () => {
  const locales = ['en', 'ar', 'fr'];
  it('is true for the integrations page of a project, with or without a locale or trailing slash', () => {
    for (const p of [
      '/en/p/123/integrations',
      '/ar/p/abc-1/integrations/',
      '/p/123/integrations',
    ]) {
      expect(isMetaPath(p, locales), p).toBe(true);
    }
  });

  it('is false for everything else, including other project pages and sub paths', () => {
    for (const p of [
      '/',
      '/en',
      '/en/login',
      '/en/clients',
      '/en/p/123/overview',
      '/en/p/123/leads',
      '/en/p/123/integrations/whatsapp',
      '/en/p/integrations',
      '/en/integrations',
      '/en/q/123/integrations',
      '/xx/p/123/integrations/extra/more',
      '/en/p//integrations',
    ]) {
      expect(isMetaPath(p, locales), p).toBe(false);
    }
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

describe('classifyPath', () => {
  const locales = ['en', 'ar', 'fr'];
  it('marks the sign-in, code, reset and invite pages as auth, with their locale', () => {
    for (const p of [
      '/en/login',
      '/ar/code',
      '/fr/reset',
      '/fr/reset/abc',
      '/en/accept-invite/tok',
    ]) {
      expect(classifyPath(p, locales).kind, p).toBe('auth');
    }
    expect(classifyPath('/ar/login', locales).locale).toBe('ar');
  });

  it('everything else needs a session, including the home page and unprefixed paths', () => {
    for (const p of ['/en', '/en/clients', '/en/p/123/overview', '/clients', '/', '/en/loginx']) {
      expect(classifyPath(p, locales).kind, p).toBe('protected');
    }
    expect(classifyPath('/clients', locales).locale).toBeNull();
  });
});
