import { describe, expect, it, vi } from 'vitest';

// session.ts imports Next's request APIs; landingPath is pure, so those are stubbed.
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn() }));

const { landingPath } = await import('./session.ts');

const P = '11111111-1111-4111-8111-111111111111';

describe('landingPath', () => {
  it('sends super admin and manager to the clients list', () => {
    expect(landingPath({ role: 'super_admin', projectIds: [] }, 'en')).toBe('/en/clients');
    expect(landingPath({ role: 'manager', projectIds: [] }, 'ar')).toBe('/ar/clients');
  });

  it('sends a client user to its own overview', () => {
    expect(landingPath({ role: 'client', projectIds: [P] }, 'fr')).toBe(`/fr/p/${P}/overview`);
  });

  it('never invents a project: a client without one goes back to sign-in', () => {
    expect(landingPath({ role: 'client', projectIds: [] }, 'en')).toBe('/en/login');
  });
});
