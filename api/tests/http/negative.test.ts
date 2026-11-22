import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorBody } from '../../src/contracts/index.ts';
import { getPool } from '../../src/db/index.ts';
import { setEmailTransport } from '../../src/lib/email/index.ts';
import { routeSpecs } from '../../src/lib/http/route.ts';
import { asSession, buildTestApp, freshIp, internal, post, seedUser } from '../helpers/http.ts';

// F1c negative sweep (plan §9.5): every route, not just the ones with their own test.
let app: FastifyInstance;
let pending: string;
beforeAll(async () => {
  ({ app } = await buildTestApp());
  const u = await seedUser();
  const res = await post(
    app,
    '/auth/login',
    { email: u.email, password: u.password },
    internal({ 'x-client-ip': freshIp() }),
  );
  pending = res.json().sessionToken as string;
});
afterAll(async () => {
  await app.close();
  setEmailTransport(undefined);
  await getPool().end();
});

// `/users/:id/status` style paths get a syntactically valid id so the request reaches the guard.
const concrete = (url: string) => url.replace(':id', '99999999-9999-4999-8999-999999999999');
const nonPublic = () => [...routeSpecs.values()].filter((s) => s.access !== 'public');

describe('every non-public route', () => {
  it('answers 404 without the internal token (never 401, never a validation error)', async () => {
    expect(nonPublic().length).toBeGreaterThan(10);
    for (const s of nonPublic()) {
      for (const headers of [{}, { 'x-internal-token': 'wrong' }, { 'x-session-token': pending }]) {
        const res = await app.inject({
          method: s.method as 'GET',
          url: concrete(s.url),
          headers,
          payload: s.method === 'GET' ? undefined : {},
        });
        expect(res.statusCode, `${s.method} ${s.url}`).toBe(404);
      }
    }
  });

  it('is never cached', async () => {
    for (const s of nonPublic()) {
      const res = await app.inject({
        method: s.method as 'GET',
        url: concrete(s.url),
        headers: internal(),
        payload: s.method === 'GET' ? undefined : {},
      });
      expect(res.headers['cache-control'], `${s.method} ${s.url}`).toBe('no-store');
    }
  });
});

describe('a pending (code step) session', () => {
  it('is refused by every session route with 401 and its stage, and reaches nothing else', async () => {
    const sessionRoutes = [...routeSpecs.values()].filter((s) => s.access === 'session');
    expect(sessionRoutes.length).toBeGreaterThan(3);
    for (const s of sessionRoutes) {
      const res = await app.inject({
        method: s.method as 'GET',
        url: concrete(s.url),
        headers: asSession(pending),
        payload: s.method === 'GET' ? undefined : {},
      });
      expect(res.statusCode, `${s.method} ${s.url}`).toBe(401);
      expect(errorBody.parse(res.json()).error.details, `${s.method} ${s.url}`).toEqual({
        stage: 'pending_2fa',
      });
    }
  });

  it('GET /users and POST /users/invite specifically', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/users?kind=manager', headers: asSession(pending) }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await post(
          app,
          '/users/invite',
          { kind: 'manager', email: 'a@test.local', name: 'A' },
          asSession(pending),
        )
      ).statusCode,
    ).toBe(401);
  });
});

describe('no session at all', () => {
  it('every pending and session route answers 401 with the one errorBody shape', async () => {
    const guarded = [...routeSpecs.values()].filter(
      (s) => s.access === 'pending' || s.access === 'session',
    );
    for (const s of guarded) {
      const res = await app.inject({
        method: s.method as 'GET',
        url: concrete(s.url),
        headers: internal(),
        payload: s.method === 'GET' ? undefined : {},
      });
      expect(res.statusCode, `${s.method} ${s.url}`).toBe(401);
      expect(errorBody.parse(res.json()).error.code).toBe('UNAUTHENTICATED');
    }
  });
});
