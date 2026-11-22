import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryTransport, setEmailTransport } from '../lib/email/index.ts';
import { withSystem } from '../lib/tenant/index.ts';
import { users } from '../modules/auth/schema.ts';
import { getPool } from './index.ts';
import { seedSuperAdmin } from './seed-super-admin.ts';

const mail = memoryTransport();
beforeAll(() => setEmailTransport(mail));
afterAll(async () => {
  setEmailTransport(undefined);
  await getPool().end();
});

describe('auth:seed-admin', () => {
  it('creates one invited super admin and emails the invite; a second run is refused', async () => {
    // Other test files share this database and may already have created their own super admin.
    await withSystem(null, (tx) => tx.delete(users).where(eq(users.role, 'super_admin')));

    const first = await seedSuperAdmin({
      email: 'Boss@Test.Local',
      name: ' Boss ',
      appUrl: 'http://localhost:3000',
    });
    expect(first.link).toMatch(/^http:\/\/localhost:3000\/en\/accept-invite\/[A-Za-z0-9_-]{43}$/);
    const msg = mail.sent.find((m) => m.to === 'boss@test.local');
    expect(msg).toMatchObject({ template: 'invite' });
    expect(msg?.text).toContain(first.link);

    const [row] = await withSystem(null, (tx) =>
      tx.select().from(users).where(eq(users.id, first.userId)),
    );
    expect(row).toMatchObject({
      role: 'super_admin',
      status: 'invited',
      name: 'Boss',
      pwHash: null,
    });

    await expect(
      seedSuperAdmin({ email: 'other@test.local', name: 'Other', appUrl: 'http://localhost:3000' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const all = await withSystem(null, (tx) =>
      tx.select().from(users).where(eq(users.role, 'super_admin')),
    );
    expect(all).toHaveLength(1);
    expect(mail.sent.filter((m) => m.template === 'invite')).toHaveLength(1);

    // leave the shared test database as other files expect it: no super admin until they ask for one
    await withSystem(null, (tx) => tx.delete(users).where(eq(users.role, 'super_admin')));
  });

  it('the database itself allows only one, even if the check were skipped', async () => {
    await withSystem(null, (tx) => tx.delete(users).where(eq(users.role, 'super_admin')));
    await withSystem(null, async (tx) => {
      await tx.insert(users).values({ email: 'a@test.local', name: 'A', role: 'super_admin' });
    });
    await withSystem(null, async (tx) => {
      await expect(
        tx.insert(users).values({ email: 'b@test.local', name: 'B', role: 'super_admin' }),
      ).rejects.toThrow();
    });
    await withSystem(null, (tx) => tx.delete(users).where(eq(users.role, 'super_admin')));
  });

  it('rejects a bad email or an empty name', async () => {
    await expect(
      seedSuperAdmin({ email: 'nope', name: 'X', appUrl: 'http://x.test' }),
    ).rejects.toThrow();
    await expect(
      seedSuperAdmin({ email: 'a@test.local', name: '  ', appUrl: 'http://x.test' }),
    ).rejects.toThrow();
  });
});
