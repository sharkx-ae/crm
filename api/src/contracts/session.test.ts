import { describe, expect, it } from 'vitest';
import { type Action, actionRoles, can, type Role } from './index.ts';

const OWN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const roles: Role[] = ['super_admin', 'manager', 'client'];
const actions = Object.keys(actionRoles) as Action[];

const sessionOf = (role: Role, stage: 'active' | 'pending_2fa' = 'active') => ({
  role,
  stage,
  projectIds: role === 'client' ? [OWN] : [],
});

describe('can()', () => {
  it('covers the 21 actions', () => {
    expect(actions).toHaveLength(21);
  });

  describe.each(actions)('%s', (a) => {
    for (const r of roles) {
      const allowed = (actionRoles[a] as readonly Role[]).includes(r);

      it(`${r}: own project → ${allowed}`, () => {
        expect(can(sessionOf(r), a, OWN)).toBe(allowed);
      });

      it(`${r}: other project → ${allowed && r !== 'client'}`, () => {
        // Staff ignore projectId; a client is only ever allowed in its own project.
        expect(can(sessionOf(r), a, OTHER)).toBe(allowed && r !== 'client');
      });

      it(`${r}: no project → ${allowed && r !== 'client'}`, () => {
        expect(can(sessionOf(r), a)).toBe(allowed && r !== 'client');
      });

      it(`${r}: pending_2fa → false`, () => {
        expect(can(sessionOf(r, 'pending_2fa'), a, OWN)).toBe(false);
        expect(can(sessionOf(r, 'pending_2fa'), a)).toBe(false);
      });
    }
  });

  it('roles do not nest: a manager cannot do super-admin actions, a super admin has no client-only actions', () => {
    expect(can(sessionOf('manager'), 'user.manage')).toBe(false);
    expect(can(sessionOf('manager'), 'audit.read')).toBe(false);
    expect(can(sessionOf('manager'), 'project.create')).toBe(false);
    expect(can(sessionOf('manager'), 'clientuser.manage')).toBe(true);
  });

  it('a client is refused every staff-only action even inside its own project', () => {
    for (const a of actions) {
      const staffOnly = !(actionRoles[a] as readonly Role[]).includes('client');
      if (staffOnly) expect(can(sessionOf('client'), a, OWN)).toBe(false);
    }
  });
});
