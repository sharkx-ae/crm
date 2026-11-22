import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { type ApiDeps, callApi } from './client.ts';
import { ApiError } from './error.ts';

vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const asFetch = (f: unknown) => f as typeof fetch;

const deps = (fetchImpl: typeof fetch, over: Partial<ApiDeps> = {}): ApiDeps => ({
  apiUrl: 'http://api.test:4000',
  internalToken: 'internal-token-0123456789abcdef0123456789',
  fetch: fetchImpl,
  requestId: 'req-12345678',
  ...over,
});
const ok = z.object({ ok: z.literal(true) });

describe('callApi', () => {
  it('sends the internal token, request id, session and client address', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    await callApi(
      deps(asFetch(fetchMock), { sessionToken: 'S'.repeat(43), ip: '203.0.113.9' }),
      ok,
      '/auth/logout',
      { body: {} },
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://api.test:4000/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'x-internal-token': 'internal-token-0123456789abcdef0123456789',
      'x-request-id': 'req-12345678',
      'x-session-token': 'S'.repeat(43),
      'x-client-ip': '203.0.113.9',
      'content-type': 'application/json',
    });
    expect(init.body).toBe('{}');
  });

  it('sends no session or address header when there is none, and GET without a body', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    await callApi(deps(asFetch(fetchMock)), ok, '/me');
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe('GET');
    expect(init.headers).not.toHaveProperty('x-session-token');
    expect(init.headers).not.toHaveProperty('x-client-ip');
    expect(init.body).toBeUndefined();
  });

  it('parses the response with the schema', async () => {
    const out = await callApi(deps(asFetch(async () => json({ ok: true, extra: 1 }))), ok, '/x');
    expect(out).toEqual({ ok: true });
  });

  it('turns an api error body into a typed ApiError with details and retryAfterSec', async () => {
    const f = asFetch(async () =>
      json(
        { error: { code: 'RATE_LIMITED', details: { scope: 'login' }, retryAfterSec: 42 } },
        429,
      ),
    );
    const err = await callApi(deps(f), ok, '/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      details: { scope: 'login' },
      retryAfterSec: 42,
    });
  });

  it('a 422 keeps its details (attemptsLeft)', async () => {
    const f = asFetch(async () =>
      json({ error: { code: 'VALIDATION', details: { attemptsLeft: 3 } } }, 422),
    );
    const err = (await callApi(deps(f), ok, '/x').catch((e: unknown) => e)) as ApiError;
    expect(err.details).toEqual({ attemptsLeft: 3 });
  });

  it('an unreadable error, an unreachable api and a broken contract are all INTERNAL', async () => {
    const html = asFetch(async () => new Response('<html>bad gateway</html>', { status: 502 }));
    const down = asFetch(async () => {
      throw new TypeError('fetch failed');
    });
    const wrong = asFetch(async () => json({ nope: 1 }));
    for (const f of [html, down, wrong]) {
      const err = (await callApi(deps(f), ok, '/x').catch((e: unknown) => e)) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('INTERNAL');
    }
  });
});
