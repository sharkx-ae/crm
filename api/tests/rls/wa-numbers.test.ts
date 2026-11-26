import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../../src/db/index.ts';
import * as s from '../../src/db/schema/index.ts';
import { withSystem, withTenant } from '../../src/lib/tenant/index.ts';
import { expectDenied, first, seedWorld, type World } from '../helpers/db.ts';

// F3a (plan §9.4): what the new routing keys and per-WABA token rows do under row-level security.
let w: World;
let bNumber: { phoneNumberId: string; wabaId: string; phoneE164: string };
beforeAll(async () => {
  w = await seedWorld();
  bNumber = first(
    await withSystem(w.b.projectId, (tx) =>
      tx
        .select({
          phoneNumberId: s.waNumbers.phoneNumberId,
          wabaId: s.waNumbers.wabaId,
          phoneE164: s.waNumbers.phoneE164,
        })
        .from(s.waNumbers),
    ),
  );
});
afterAll(() => getPool().end());

describe('wa_numbers routing keys', () => {
  it("a client reads its own numbers and none of another client's", async () => {
    const mine = await withTenant({ userId: w.clientA, role: 'client' }, (tx) =>
      tx.select({ id: s.waNumbers.id, project: s.waNumbers.projectId }).from(s.waNumbers),
    );
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.project === w.a.projectId)).toBe(true);
    const theirs = await withTenant({ userId: w.clientA, role: 'client' }, (tx) =>
      tx.select().from(s.waNumbers).where(eq(s.waNumbers.phoneNumberId, bNumber.phoneNumberId)),
    );
    expect(theirs).toEqual([]);
  });

  it("the system role for A cannot see B's numbers (no routing read before F3b's policy)", async () => {
    const seen = await withSystem(w.a.projectId, (tx) =>
      tx.select().from(s.waNumbers).where(eq(s.waNumbers.phoneNumberId, bNumber.phoneNumberId)),
    );
    expect(seen).toEqual([]);
    const none = await withSystem(null, (tx) => tx.select().from(s.waNumbers));
    expect(none).toEqual([]);
  });

  it("the unique constraint still rejects A's insert of B's phone_number_id, even though A cannot see the row", async () => {
    const attempt = withSystem(w.a.projectId, (tx) =>
      tx.insert(s.waNumbers).values({
        projectId: w.a.projectId,
        phoneE164: `+9715${Math.floor(1e7 + Math.random() * 9e7)}`,
        phoneNumberId: bNumber.phoneNumberId,
        wabaId: bNumber.wabaId,
      }),
    );
    await expect(attempt).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'wa_numbers_phone_number_id_unique' },
    });
  });

  it("the same holds for B's phone number in E.164 form", async () => {
    const attempt = withSystem(w.a.projectId, (tx) =>
      tx.insert(s.waNumbers).values({
        projectId: w.a.projectId,
        phoneE164: bNumber.phoneE164,
        phoneNumberId: `pn-${randomUUID()}`,
        wabaId: bNumber.wabaId,
      }),
    );
    await expect(attempt).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('a WABA can hold several numbers (waba_id is indexed, not unique)', async () => {
    const waba = `waba-${randomUUID()}`;
    await withSystem(w.a.projectId, async (tx) => {
      for (const n of [1, 2]) {
        await tx.insert(s.waNumbers).values({
          projectId: w.a.projectId,
          phoneE164: `+9716${Math.floor(1e7 + Math.random() * 9e7)}`,
          phoneNumberId: `pn-${randomUUID()}-${n}`,
          wabaId: waba,
        });
      }
    });
    const rows = await withSystem(w.a.projectId, (tx) =>
      tx.select().from(s.waNumbers).where(eq(s.waNumbers.wabaId, waba)),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.onboardedAt instanceof Date)).toBe(true);
  });
});

describe('integration_tokens', () => {
  it('app_user (staff and client) has no privilege on it at all', async () => {
    await expectDenied(
      withTenant({ userId: w.manager, role: 'manager' }, (tx) =>
        tx.select().from(s.integrationTokens),
      ),
    );
    await expectDenied(
      withTenant({ userId: w.clientA, role: 'client' }, (tx) =>
        tx.select().from(s.integrationTokens),
      ),
    );
  });

  it('one token row per (integration, account); a second account on the same integration is allowed', async () => {
    const integrationId = w.a.integrationId;
    const ref = `waba-${randomUUID()}`;
    const row = (accountRef: string) => ({
      projectId: w.a.projectId,
      integrationId,
      accountRef,
      encValue: 'enc',
      keyId: 'k1',
    });
    await withSystem(w.a.projectId, (tx) => tx.insert(s.integrationTokens).values(row(ref)));
    await withSystem(w.a.projectId, (tx) => tx.insert(s.integrationTokens).values(row(`${ref}-2`)));
    await expect(
      withSystem(w.a.projectId, (tx) => tx.insert(s.integrationTokens).values(row(ref))),
    ).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'integration_tokens_integration_account' },
    });
  });
});

describe('webhook_events', () => {
  it('app_user cannot read or write it', async () => {
    await expectDenied(
      withTenant({ userId: w.manager, role: 'manager' }, (tx) => tx.select().from(s.webhookEvents)),
    );
    await expectDenied(
      withTenant({ userId: w.clientA, role: 'client' }, (tx) =>
        tx
          .insert(s.webhookEvents)
          .values({ provider: 'meta', externalId: randomUUID(), payload: {} }),
      ),
    );
  });

  it('the system role (no project) stores and reads events', async () => {
    const externalId = randomUUID();
    await withSystem(null, (tx) =>
      tx.insert(s.webhookEvents).values({ provider: 'meta', externalId, payload: { a: 1 } }),
    );
    const rows = await withSystem(null, (tx) =>
      tx.select().from(s.webhookEvents).where(eq(s.webhookEvents.externalId, externalId)),
    );
    expect(rows).toHaveLength(1);
  });
});
