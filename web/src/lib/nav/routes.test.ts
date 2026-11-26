import { describe, expect, it } from 'vitest';
import type { Role } from '../../contracts/common.ts';
import { NAV, visibleNav } from './config.ts';
import { canViewRoute, projectIdOf, ROUTE_KEYS, type RouteKey, routePath } from './routes.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const who = (role: Role, stage: 'active' | 'pending_2fa' = 'active') => ({
  role,
  stage,
  projectIds: role === 'client' ? [A] : [],
});

// Web plan §7 / F10a S1 route-guard matrix, complete: every route key × every role, and for project routes both
// the client user's own project (A) and a foreign one (B). true = the page, false = the not-found page.
// Agency routes take no project. Staff see every project (RLS and the api still apply).
type Expect = { superAdmin: boolean; manager: boolean; clientOwn: boolean };
const MATRIX: Record<RouteKey, Expect> = {
  clients: { superAdmin: true, manager: true, clientOwn: false },
  team: { superAdmin: true, manager: false, clientOwn: false },
  audit: { superAdmin: true, manager: false, clientOwn: false },
  overview: { superAdmin: true, manager: true, clientOwn: true },
  leads: { superAdmin: true, manager: true, clientOwn: true },
  inbox: { superAdmin: true, manager: true, clientOwn: true },
  reports: { superAdmin: true, manager: true, clientOwn: true },
  integrations: { superAdmin: true, manager: true, clientOwn: true },
  contacts: { superAdmin: true, manager: true, clientOwn: false },
  pipeline: { superAdmin: true, manager: true, clientOwn: false },
  tasks: { superAdmin: true, manager: true, clientOwn: false },
  settings: { superAdmin: true, manager: true, clientOwn: false },
};
const isProject = (key: RouteKey) => !['clients', 'team', 'audit'].includes(key);

describe('canViewRoute', () => {
  it('the matrix covers every route key', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...ROUTE_KEYS].sort());
  });

  it.each(ROUTE_KEYS)('%s: each role, own and foreign project', (key) => {
    const e = MATRIX[key];
    const p = isProject(key) ? A : undefined;
    expect(canViewRoute(who('super_admin'), key, p), 'super admin').toBe(e.superAdmin);
    expect(canViewRoute(who('manager'), key, p), 'manager').toBe(e.manager);
    expect(canViewRoute(who('client'), key, p), 'client, own').toBe(e.clientOwn);
    if (isProject(key)) {
      // A foreign project: staff unchanged, a client user always not-found (even on its own five areas).
      expect(canViewRoute(who('super_admin'), key, B), 'super admin, B').toBe(e.superAdmin);
      expect(canViewRoute(who('manager'), key, B), 'manager, B').toBe(e.manager);
      expect(canViewRoute(who('client'), key, B), 'client, foreign').toBe(false);
    }
  });

  it('a client user with no project sees nothing', () => {
    const orphan = { role: 'client' as const, stage: 'active' as const, projectIds: [] };
    for (const key of ROUTE_KEYS)
      expect(canViewRoute(orphan, key, isProject(key) ? A : undefined), key).toBe(false);
  });

  it('a pending (code step) session sees nothing', () => {
    for (const role of ['super_admin', 'manager', 'client'] as const)
      for (const key of ROUTE_KEYS) {
        const p = isProject(key) ? A : undefined;
        expect(canViewRoute(who(role, 'pending_2fa'), key, p), `${role} ${key}`).toBe(false);
      }
  });

  it('a project route needs a project and an agency route refuses one', () => {
    expect(canViewRoute(who('manager'), 'overview')).toBe(false);
    expect(canViewRoute(who('manager'), 'clients', A)).toBe(false);
  });
});

describe('paths', () => {
  it('builds agency and project paths', () => {
    expect(routePath('clients')).toBe('/clients');
    expect(routePath('leads', A)).toBe(`/p/${A}/leads`);
  });

  it('reads the open project from the path', () => {
    expect(projectIdOf(`/p/${A}/overview`)).toBe(A);
    expect(projectIdOf(`/p/${A}`)).toBe(A);
    expect(projectIdOf('/clients')).toBeNull();
    expect(projectIdOf('/p/not-a-uuid/overview')).toBeNull();
  });
});

describe('nav config', () => {
  it('every item is a route its role may open', () => {
    for (const [role, nav] of Object.entries(NAV) as [Role, (typeof NAV)[Role]][]) {
      for (const g of nav.agency)
        for (const i of g.items)
          expect(canViewRoute(who(role), i.key), `${role} ${i.key}`).toBe(true);
      for (const g of nav.project)
        for (const i of g.items)
          expect(canViewRoute(who(role), i.key, A), `${role} ${i.key}`).toBe(true);
    }
  });

  it('shows ready items only (F2a: clients, overview; F2b: team, settings; F4b: leads, contacts)', () => {
    const keys = (role: Role, mode: 'agency' | 'project') =>
      visibleNav(role, mode).flatMap((g) => g.items.map((i) => i.key));
    expect(keys('super_admin', 'agency')).toEqual(['clients', 'team']);
    expect(keys('manager', 'agency')).toEqual(['clients']);
    expect(keys('client', 'agency')).toEqual([]);
    expect(keys('super_admin', 'project')).toEqual(['overview', 'leads', 'contacts', 'settings']);
    expect(keys('manager', 'project')).toEqual(['overview', 'leads', 'contacts', 'settings']);
    expect(keys('client', 'project')).toEqual(['overview', 'leads']);
  });

  it('the client nav is its five areas with the client wording', () => {
    const items = NAV.client.project.flatMap((g) => g.items);
    expect(items.map((i) => i.key)).toEqual([
      'overview',
      'leads',
      'inbox',
      'reports',
      'integrations',
    ]);
    expect(items.find((i) => i.key === 'inbox')?.labelKey).toBe('navClient.inbox');
  });
});
