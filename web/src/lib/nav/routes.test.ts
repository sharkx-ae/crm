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

// Web plan §7 route-guard matrix: 'page' or 'not found' for each role. A = the client user's own project.
type Row = [RouteKey, string | undefined, superAdmin: boolean, manager: boolean, client: boolean];
const MATRIX: Row[] = [
  ['clients', undefined, true, true, false],
  ['team', undefined, true, false, false],
  ['audit', undefined, true, false, false],
  ['overview', A, true, true, true],
  ['leads', A, true, true, true],
  ['reports', A, true, true, true],
  ['inbox', A, true, true, true],
  ['integrations', A, true, true, true],
  ['overview', B, true, true, false],
  ['leads', B, true, true, false],
  ['contacts', A, true, true, false],
  ['pipeline', A, true, true, false],
  ['tasks', A, true, true, false],
  ['settings', A, true, true, false],
];

describe('canViewRoute', () => {
  it.each(MATRIX)('%s (project %s): super %s, manager %s, client %s', (key, p, sa, m, c) => {
    expect(canViewRoute(who('super_admin'), key, p)).toBe(sa);
    expect(canViewRoute(who('manager'), key, p)).toBe(m);
    expect(canViewRoute(who('client'), key, p)).toBe(c);
  });

  it('a pending (code step) session sees nothing', () => {
    for (const key of ROUTE_KEYS) {
      const p = key === 'clients' || key === 'team' || key === 'audit' ? undefined : A;
      expect(canViewRoute(who('super_admin', 'pending_2fa'), key, p)).toBe(false);
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

  it('shows ready items only (F2a: clients and overview)', () => {
    const keys = (role: Role, mode: 'agency' | 'project') =>
      visibleNav(role, mode).flatMap((g) => g.items.map((i) => i.key));
    expect(keys('super_admin', 'agency')).toEqual(['clients']);
    expect(keys('manager', 'agency')).toEqual(['clients']);
    expect(keys('client', 'agency')).toEqual([]);
    expect(keys('super_admin', 'project')).toEqual(['overview']);
    expect(keys('client', 'project')).toEqual(['overview']);
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
