import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Action, actionRoles } from '../../src/contracts/session.ts';
import { getPool } from '../../src/db/index.ts';
import { setEmailTransport } from '../../src/lib/email/index.ts';
import { routeSpecs } from '../../src/lib/http/route.ts';
import { buildTestApp } from '../helpers/http.ts';

// The services re-check can(), so a wrong route-level action would not show up in the behaviour tests. This pins
// the mapping itself: who may reach each staff-only route (found by the F1 independent review).
const P = '11111111-1111-4111-8111-111111111111';
let app: FastifyInstance;
beforeAll(async () => {
  ({ app } = await buildTestApp());
});
afterAll(async () => {
  await app.close();
  setEmailTransport(undefined);
  await getPool().end();
});

type Resolve = (i: unknown) => { action: Action; projectId?: string };
const spec = (key: string) => {
  const s = routeSpecs.get(key);
  if (!s) throw new Error(`route ${key} is not registered`);
  return s.action as Action | 'self' | Resolve;
};

describe('route-level can() mapping', () => {
  it('POST /users/invite: manager needs user.manage, client user needs clientuser.manage on its project', () => {
    const a = spec('POST /users/invite') as Resolve;
    expect(a({ body: { kind: 'manager' } })).toEqual({ action: 'user.manage' });
    expect(a({ body: { kind: 'client', projectId: P } })).toEqual({
      action: 'clientuser.manage',
      projectId: P,
    });
  });

  it('GET /users: same split as the invite', () => {
    const a = spec('GET /users') as Resolve;
    expect(a({ query: { kind: 'manager' } })).toEqual({ action: 'user.manage' });
    expect(a({ query: { kind: 'client', projectId: P } })).toEqual({
      action: 'clientuser.manage',
      projectId: P,
    });
  });

  it('POST /users/:id/status is staff-only and GET /audit is super-admin-only', () => {
    expect(spec('POST /users/:id/status')).toBe('clientuser.manage');
    expect(spec('GET /audit')).toBe('audit.read');
  });

  it('no mutating session route is open to the client role, except acting on oneself', () => {
    const open: string[] = [];
    for (const [key, s] of routeSpecs) {
      if (s.access !== 'session' || s.method === 'GET') continue;
      if (s.action === 'self') continue;
      if (
        typeof s.action === 'string' &&
        (actionRoles[s.action as Action] as readonly string[]).includes('client')
      )
        open.push(key);
    }
    expect(open, `client-reachable mutating routes: ${open}`).toEqual([]);
  });
});
