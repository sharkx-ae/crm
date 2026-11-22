import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../../src/app.ts';
import { errorBody } from '../../src/contracts/index.ts';
import { getContext } from '../../src/lib/context/index.ts';
import { AppError } from '../../src/lib/errors/index.ts';
import { httpPlugin, serverOptions } from '../../src/lib/http/plugin.ts';
import {
  defineRoute,
  type ResolvedSession,
  type RouteSpec,
  routeSpecs,
} from '../../src/lib/http/route.ts';
import { INTERNAL_TOKEN, testEnv } from '../helpers/env.ts';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const session = (over: Partial<ResolvedSession>): ResolvedSession => ({
  userId: '33333333-3333-4333-8333-333333333333',
  role: 'manager',
  projectIds: [],
  locale: 'en',
  stage: 'active',
  sessionId: '44444444-4444-4444-8444-444444444444',
  name: 'Test',
  email: 'test@test.local',
  ...over,
});
const sessions: Record<string, ResolvedSession> = {
  'manager-token': session({}),
  'super-token': session({ role: 'super_admin' }),
  'client-token': session({ role: 'client', projectIds: [P1] }),
  'pending-token': session({ stage: 'pending_2fa' }),
};
const resolveSession = async (raw: string) => sessions[raw] ?? null;

const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((a) => a.close()));
});

async function appWith(
  routes: (app: FastifyInstance) => void,
  onUnexpected?: (err: Error, route: string) => void,
): Promise<FastifyInstance> {
  const app = Fastify(serverOptions(testEnv()));
  open.push(app);
  await app.register(httpPlugin, { env: testEnv(), resolveSession, onUnexpected });
  routes(app);
  await app.ready();
  return app;
}

const withToken = (extra: Record<string, string> = {}) => ({
  'x-internal-token': INTERNAL_TOKEN,
  ...extra,
});
const ok = z.object({ ok: z.literal(true) });
const echoIp = z.object({ ip: z.string() });

describe('registration rules', () => {
  it('refuses a route registered without defineRoute', async () => {
    const app = Fastify(serverOptions(testEnv()));
    open.push(app);
    await app.register(httpPlugin, { env: testEnv(), resolveSession });
    expect(() => app.get('/sneaky', async () => ({ ok: true }))).toThrow(/defineRoute/);
  });

  it('refuses a session route without an action and a mutating route without audit', async () => {
    const app = Fastify(serverOptions(testEnv()));
    open.push(app);
    await app.register(httpPlugin, { env: testEnv(), resolveSession });
    expect(() =>
      defineRoute(app, { method: 'GET', url: '/a', access: 'session', response: ok }, async () => ({
        ok: true as const,
      })),
    ).toThrow(/action/);
    expect(() =>
      defineRoute(app, { method: 'POST', url: '/b', access: 'anon', response: ok }, async () => ({
        ok: true as const,
      })),
    ).toThrow(/audit/);
    expect(() =>
      defineRoute(
        app,
        { method: 'GET', url: '/c', access: 'anon', action: 'lead.read', response: ok },
        async () => ({ ok: true as const }),
      ),
    ).toThrow(/session routes/);
  });
});

describe('internal token', () => {
  const routes = (app: FastifyInstance) => {
    defineRoute(
      app,
      { method: 'GET', url: '/open', access: 'public', response: echoIp },
      async (c) => ({
        ip: c.ip,
      }),
    );
    defineRoute(
      app,
      { method: 'GET', url: '/anon', access: 'anon', response: echoIp },
      async (c) => ({
        ip: c.ip,
      }),
    );
  };

  it('missing or wrong token on a non-public route looks like no such route', async () => {
    const app = await appWith(routes);
    for (const headers of [{}, { 'x-internal-token': 'nope' }, { 'x-internal-token': '' }]) {
      const res = await app.inject({ method: 'GET', url: '/anon', headers });
      expect(res.statusCode).toBe(404);
      expect(errorBody.parse(res.json()).error.code).toBe('NOT_FOUND');
    }
  });

  it('public routes need no token', async () => {
    const app = await appWith(routes);
    expect((await app.inject({ method: 'GET', url: '/open' })).statusCode).toBe(200);
  });

  it('x-client-ip is trusted only after the token check, and only when it is an address', async () => {
    const app = await appWith(routes);
    const trusted = await app.inject({
      method: 'GET',
      url: '/anon',
      headers: withToken({ 'x-client-ip': '203.0.113.9' }),
    });
    expect(trusted.json()).toEqual({ ip: '203.0.113.9' });
    const junk = await app.inject({
      method: 'GET',
      url: '/anon',
      headers: withToken({ 'x-client-ip': 'not-an-ip' }),
    });
    expect(junk.json().ip).not.toBe('not-an-ip');
    const spoofedPublic = await app.inject({
      method: 'GET',
      url: '/open',
      headers: { 'x-client-ip': '203.0.113.9' },
    });
    expect(spoofedPublic.json().ip).not.toBe('203.0.113.9');
  });
});

describe('sessions and can()', () => {
  const routes = (app: FastifyInstance) => {
    const res = z.object({ who: z.string() });
    defineRoute(
      app,
      { method: 'GET', url: '/me', access: 'pending', response: res },
      async (c) => ({ who: c.session.stage }),
    );
    defineRoute(
      app,
      { method: 'GET', url: '/self', access: 'session', action: 'self', response: res },
      async (c) => ({ who: c.session.role }),
    );
    defineRoute(
      app,
      { method: 'GET', url: '/audit', access: 'session', action: 'audit.read', response: res },
      async (c) => ({ who: c.session.role }),
    );
    defineRoute(
      app,
      {
        method: 'GET',
        url: '/projects/:id',
        access: 'session',
        params: z.object({ id: z.uuid() }),
        action: ({ params }) => ({ action: 'lead.read', projectId: params.id }),
        response: res,
      },
      async (c) => ({ who: c.params.id }),
    );
  };
  const get = (app: FastifyInstance, url: string, token?: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: withToken(token ? { 'x-session-token': token } : {}),
    });

  it('no session or an unknown one → 401', async () => {
    const app = await appWith(routes);
    expect((await get(app, '/self')).statusCode).toBe(401);
    expect((await get(app, '/self', 'bogus')).statusCode).toBe(401);
  });

  it('a pending session reaches pending routes only; session routes answer 401 with the stage', async () => {
    const app = await appWith(routes);
    expect((await get(app, '/me', 'pending-token')).json()).toEqual({ who: 'pending_2fa' });
    const res = await get(app, '/self', 'pending-token');
    expect(res.statusCode).toBe(401);
    expect(errorBody.parse(res.json()).error.details).toEqual({ stage: 'pending_2fa' });
  });

  it('can() decides: 403 for the wrong role, 200 for the right one', async () => {
    const app = await appWith(routes);
    expect((await get(app, '/audit', 'manager-token')).statusCode).toBe(403);
    expect((await get(app, '/audit', 'client-token')).statusCode).toBe(403);
    expect((await get(app, '/audit', 'super-token')).statusCode).toBe(200);
  });

  it('a client asking about another client’s project gets 404, not 403', async () => {
    const app = await appWith(routes);
    expect((await get(app, `/projects/${P2}`, 'client-token')).statusCode).toBe(404);
    expect((await get(app, `/projects/${P1}`, 'client-token')).statusCode).toBe(200);
    expect((await get(app, `/projects/${P2}`, 'manager-token')).statusCode).toBe(200);
  });

  it('authentication is checked before the input is, so an anonymous caller learns nothing about it', async () => {
    const app = await appWith(routes);
    expect((await get(app, '/projects/not-a-uuid')).statusCode).toBe(401);
    expect((await get(app, '/projects/not-a-uuid', 'manager-token')).statusCode).toBe(422);
  });
});

describe('validation and errors', () => {
  const routes = (app: FastifyInstance) => {
    defineRoute(
      app,
      {
        method: 'POST',
        url: '/login',
        access: 'anon',
        body: z.object({ email: z.email(), password: z.string().min(12) }),
        response: ok,
        audit: 'none',
      },
      async () => ({ ok: true as const }),
    );
    defineRoute(app, { method: 'GET', url: '/limited', access: 'anon', response: ok }, async () => {
      throw new AppError('RATE_LIMITED', { retryAfterSec: 42, details: { scope: 'login' } });
    });
    defineRoute(app, { method: 'GET', url: '/boom', access: 'anon', response: ok }, async () => {
      throw new Error('duplicate key value violates unique constraint (email)=(a@b.c)');
    });
    defineRoute(
      app,
      { method: 'GET', url: '/leaky', access: 'anon', response: ok },
      async () => ({ ok: true as const, passwordHash: 'secret' }) as never,
    );
  };

  it('a Zod failure is a 422 VALIDATION with field paths and no submitted values', async () => {
    const app = await appWith(routes);
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      headers: withToken(),
      payload: { email: 'not-an-email', password: 'short-pw' },
    });
    expect(res.statusCode).toBe(422);
    const body = errorBody.parse(res.json());
    expect(body.error.code).toBe('VALIDATION');
    expect(JSON.stringify(body)).toContain('email');
    expect(JSON.stringify(body)).toContain('password');
    expect(res.body).not.toContain('short-pw');
    expect(res.body).not.toContain('not-an-email');
  });

  it('malformed JSON is a 422 too', async () => {
    const app = await appWith(routes);
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      headers: withToken({ 'content-type': 'application/json' }),
      payload: '{"email":',
    });
    expect(res.statusCode).toBe(422);
    expect(errorBody.parse(res.json()).error.code).toBe('VALIDATION');
  });

  it('an AppError becomes errorBody with its status, details and Retry-After', async () => {
    const app = await appWith(routes);
    const res = await app.inject({ method: 'GET', url: '/limited', headers: withToken() });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('42');
    expect(errorBody.parse(res.json())).toEqual({
      error: { code: 'RATE_LIMITED', details: { scope: 'login' }, retryAfterSec: 42 },
    });
  });

  it('an unexpected error is a generic 500 that echoes nothing, and is reported once', async () => {
    const seen = vi.fn();
    const app = await appWith(routes, seen);
    const res = await app.inject({ method: 'GET', url: '/boom', headers: withToken() });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL' } });
    expect(res.body).not.toContain('a@b.c');
    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0]?.[1]).toBe('/boom');
  });

  it('the response is parsed, so fields outside the contract never leave', async () => {
    const app = await appWith(routes);
    const res = await app.inject({ method: 'GET', url: '/leaky', headers: withToken() });
    expect(res.json()).toEqual({ ok: true });
  });

  it('unknown paths are a plain 404', async () => {
    const app = await appWith(routes);
    const res = await app.inject({ method: 'GET', url: '/nope', headers: withToken() });
    expect(res.statusCode).toBe(404);
    expect(errorBody.parse(res.json()).error.code).toBe('NOT_FOUND');
  });
});

describe('headers and request id', () => {
  const routes = (app: FastifyInstance) => {
    defineRoute(app, { method: 'GET', url: '/open', access: 'public', response: ok }, async () => ({
      ok: true as const,
    }));
    defineRoute(app, { method: 'GET', url: '/anon', access: 'anon', response: ok }, async () => ({
      ok: true as const,
    }));
  };

  it('sets nosniff, no-referrer and HSTS everywhere, and no-store off the public routes', async () => {
    const app = await appWith(routes);
    const open = await app.inject({ method: 'GET', url: '/open' });
    const anon = await app.inject({ method: 'GET', url: '/anon', headers: withToken() });
    for (const res of [open, anon]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    }
    expect(open.headers['cache-control']).toBeUndefined();
    expect(anon.headers['cache-control']).toBe('no-store');
  });

  it('keeps a sane x-request-id and replaces anything else', async () => {
    const app = await appWith(routes);
    const kept = await app.inject({
      method: 'GET',
      url: '/open',
      headers: { 'x-request-id': 'req-abc12345' },
    });
    expect(kept.headers['x-request-id']).toBe('req-abc12345');
    const replaced = await app.inject({
      method: 'GET',
      url: '/open',
      headers: { 'x-request-id': 'bad id with spaces' },
    });
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('audit assertion (test mode)', () => {
  const routes = (app: FastifyInstance) => {
    const spec = (
      url: string,
      audit: 'one' | 'none',
    ): RouteSpec<'anon', undefined, undefined, undefined, typeof ok> => ({
      method: 'POST',
      url,
      access: 'anon',
      response: ok,
      audit,
    });
    defineRoute(app, spec('/forgets', 'one'), async () => ({ ok: true as const }));
    defineRoute(app, spec('/once', 'one'), async () => {
      getContext().auditCount += 1;
      return { ok: true as const };
    });
    defineRoute(app, spec('/twice', 'one'), async () => {
      getContext().auditCount += 2;
      return { ok: true as const };
    });
    defineRoute(app, spec('/none', 'none'), async () => ({ ok: true as const }));
  };

  it('fails a 2xx audited mutation that wrote zero or two rows, passes exactly one', async () => {
    const app = await appWith(routes);
    const post = (url: string) =>
      app.inject({ method: 'POST', url, headers: withToken(), payload: {} });
    expect((await post('/once')).statusCode).toBe(200);
    expect((await post('/none')).statusCode).toBe(200);
    expect((await post('/forgets')).statusCode).toBe(500);
    expect((await post('/twice')).statusCode).toBe(500);
  });
});

describe('every route of the real app (structure)', () => {
  it('has an access level; session routes an action; mutating routes an audit declaration', async () => {
    const app = await buildApp(testEnv());
    open.push(app);
    await app.ready();
    expect(routeSpecs.size).toBeGreaterThan(0);
    for (const [label, spec] of routeSpecs) {
      expect(['public', 'anon', 'pending', 'session'], label).toContain(spec.access);
      if (spec.access === 'session') expect(spec.action, label).toBeTruthy();
      if (spec.method !== 'GET') expect(['one', 'none'], label).toContain(spec.audit);
    }
  });
});
