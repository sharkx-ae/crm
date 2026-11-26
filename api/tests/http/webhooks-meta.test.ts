import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { getPool } from '../../src/db/index.ts';
import { stopQueue } from '../../src/lib/queue/index.ts';
import { withSystem } from '../../src/lib/tenant/index.ts';
import { externalIdOf } from '../../src/modules/webhooks/index.ts';
import { webhookEvents } from '../../src/modules/webhooks/schema.ts';
import { rawClient } from '../helpers/db.ts';
import { testEnv } from '../helpers/env.ts';
import {
  freshBody,
  metaTestEnv,
  sign,
  TEST_VERIFY_TOKEN,
  webhookFixture,
} from '../helpers/whatsapp.ts';

type EnqueueArgs = [string, { webhookEventId: string }, { singletonKey?: string }?];
const enqueue = vi.fn<(...a: EnqueueArgs) => Promise<string | null>>(async () => 'job-1');

let app: FastifyInstance;
let off: FastifyInstance; // Meta not configured
const raw = rawClient();

beforeAll(async () => {
  await raw.connect();
  app = await buildApp(metaTestEnv(), { enqueue: enqueue as never });
  off = await buildApp(testEnv(), { enqueue: enqueue as never });
  await Promise.all([app.ready(), off.ready()]);
});
afterAll(async () => {
  await Promise.all([app.close(), off.close()]);
  await stopQueue();
  await raw.end();
  await getPool().end();
});

const rowsFor = (body: Buffer) =>
  withSystem(null, (tx) =>
    tx
      .select()
      .from(webhookEvents)
      .where(
        and(eq(webhookEvents.provider, 'meta'), eq(webhookEvents.externalId, externalIdOf(body))),
      ),
  );
const forget = (body: Buffer) =>
  withSystem(null, (tx) =>
    tx.delete(webhookEvents).where(eq(webhookEvents.externalId, externalIdOf(body))),
  );
const totalRows = async () =>
  Number(
    (await withSystem(null, (tx) => tx.select({ n: sql<number>`count(*)` }).from(webhookEvents)))[0]
      ?.n,
  );

const deliver = (a: FastifyInstance, body: Buffer, headers: Record<string, string> = {}) =>
  a.inject({
    method: 'POST',
    url: '/webhooks/meta',
    payload: body,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body), ...headers },
  });

describe('GET /webhooks/meta (handshake)', () => {
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const good = {
    'hub.mode': 'subscribe',
    'hub.verify_token': TEST_VERIFY_TOKEN,
    'hub.challenge': '1158201444',
  };
  const get = (a: FastifyInstance, o: Record<string, string>) =>
    a.inject({ method: 'GET', url: `/webhooks/meta?${q(o)}` });

  it('answers the challenge as text/plain, without the internal token', async () => {
    const res = await get(app, good);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.body).toBe('1158201444');
  });

  it('refuses a wrong verify token, a wrong mode and missing or odd parameters with 403', async () => {
    const bads: Record<string, string>[] = [
      { ...good, 'hub.verify_token': 'nope' },
      { ...good, 'hub.mode': 'unsubscribe' },
      { 'hub.mode': 'subscribe', 'hub.challenge': '1' },
      { 'hub.mode': 'subscribe', 'hub.verify_token': TEST_VERIFY_TOKEN },
      { ...good, 'hub.challenge': '<script>alert(1)</script>' },
      { ...good, 'hub.challenge': 'x'.repeat(257) },
    ];
    for (const bad of bads) {
      const res = await get(app, bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(403);
      expect(res.body).not.toContain(TEST_VERIFY_TOKEN);
    }
    expect((await app.inject({ method: 'GET', url: '/webhooks/meta' })).statusCode).toBe(403);
  });

  it('is 404 when Meta is not configured', async () => {
    expect((await get(off, good)).statusCode).toBe(404);
  });

  it('stores nothing', async () => {
    const before = await totalRows();
    await get(app, good);
    expect(await totalRows()).toBe(before);
  });
});

describe('POST /webhooks/meta (receiver)', () => {
  it('a bad signature is 401, stores nothing and queues nothing', async () => {
    const body = freshBody();
    enqueue.mockClear();
    const before = await totalRows();
    for (const headers of [
      { 'x-hub-signature-256': sign(body, 'wrong-secret') },
      { 'x-hub-signature-256': 'sha256=' + 'a'.repeat(64) },
      { 'x-hub-signature-256': 'sha1=abc' },
      { 'x-hub-signature-256': '' },
    ]) {
      const res = await deliver(app, body, headers);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
    }
    // no header at all
    const noHeader = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      payload: body,
      headers: { 'content-type': 'application/json' },
    });
    expect(noHeader.statusCode).toBe(401);
    expect(await totalRows()).toBe(before);
    expect(await rowsFor(body)).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a body changed after signing is 401', async () => {
    const body = freshBody();
    const sig = sign(body);
    const tampered = Buffer.from(body.toString().replace('whatsapp_business_account', 'page'));
    expect((await deliver(app, tampered, { 'x-hub-signature-256': sig })).statusCode).toBe(401);
    expect(await rowsFor(tampered)).toHaveLength(0);
  });

  it('a valid delivery is 200, stored once (provider meta, hash key) and queued with the row id', async () => {
    const body = webhookFixture('messages-text');
    await forget(body);
    enqueue.mockClear();

    const res = await deliver(app, body);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const rows = await rowsFor(body);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.provider).toBe('meta');
    expect(row?.externalId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(row?.projectId).toBeNull();
    expect(row?.processedAt).toBeNull();
    expect(row?.payload).toEqual(JSON.parse(body.toString()));
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      'webhook.process',
      { webhookEventId: row?.id },
      { singletonKey: row?.id },
    );
  });

  it('stores escaped-unicode payloads and keeps the characters', async () => {
    const body = webhookFixture('messages-arabic');
    await forget(body);
    expect((await deliver(app, body)).statusCode).toBe(200);
    const [row] = await rowsFor(body);
    expect(JSON.stringify(row?.payload)).toContain('مرحبا');
  });

  it('accepts every fixture shape and does not look inside (batched, history, echoes, account_update)', async () => {
    for (const name of [
      'smb-message-echoes',
      'history',
      'account-update-partner-removed',
      'batched-two-changes',
    ]) {
      const body = webhookFixture(name);
      await forget(body);
      expect((await deliver(app, body)).statusCode, name).toBe(200);
      expect(await rowsFor(body), name).toHaveLength(1);
    }
  });

  it('idempotency: the same body twice is one row; each delivery is offered with the same singleton key', async () => {
    const body = freshBody();
    enqueue.mockClear();
    expect((await deliver(app, body)).statusCode).toBe(200);
    expect((await deliver(app, body)).statusCode).toBe(200);
    const rows = await rowsFor(body);
    expect(rows).toHaveLength(1);
    // not processed yet: the second delivery asks again; pg-boss's singletonKey makes that one job
    expect(enqueue).toHaveBeenCalledTimes(2);
    for (const call of enqueue.mock.calls) expect(call[2]).toEqual({ singletonKey: rows[0]?.id });
  });

  it('a duplicate that is already processed is acknowledged but not queued again', async () => {
    const body = freshBody();
    expect((await deliver(app, body)).statusCode).toBe(200);
    await withSystem(null, (tx) =>
      tx
        .update(webhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(webhookEvents.externalId, externalIdOf(body))),
    );
    enqueue.mockClear();
    expect((await deliver(app, body)).statusCode).toBe(200);
    expect(await rowsFor(body)).toHaveLength(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a different body is a different row', async () => {
    const a = freshBody();
    const b = freshBody();
    await deliver(app, a);
    await deliver(app, b);
    expect(await rowsFor(a)).toHaveLength(1);
    expect(await rowsFor(b)).toHaveLength(1);
  });

  it('if queueing fails the reply is 500 but the event is stored; the redelivery is 200 and queues it', async () => {
    const body = freshBody();
    enqueue.mockClear();
    enqueue.mockRejectedValueOnce(new Error('queue down'));
    const first = await deliver(app, body);
    expect(first.statusCode).toBe(500);
    expect(first.json()).toEqual({ error: { code: 'INTERNAL' } });
    expect(await rowsFor(body)).toHaveLength(1);

    const second = await deliver(app, body);
    expect(second.statusCode).toBe(200);
    expect(await rowsFor(body)).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[1]?.[1]).toEqual({ webhookEventId: (await rowsFor(body))[0]?.id });
  });

  it('a signed body that is not JSON is 422 and stores nothing', async () => {
    const body = Buffer.from('this is not json');
    const before = await totalRows();
    const res = await deliver(app, body);
    expect(res.statusCode).toBe(422);
    expect(await totalRows()).toBe(before);
  });

  it('a signed body with an unexpected envelope is still stored (Meta must not retry for 7 days)', async () => {
    const body = Buffer.from(JSON.stringify({ hello: randomUUID() }));
    const res = await deliver(app, body);
    expect(res.statusCode).toBe(200);
    expect(await rowsFor(body)).toHaveLength(1);
  });

  it('a non-JSON content type is 422 and stores nothing', async () => {
    const body = freshBody();
    const res = await deliver(app, body, { 'content-type': 'text/plain' });
    expect(res.statusCode).toBe(422);
    expect(await rowsFor(body)).toHaveLength(0);
  });

  it('a body over 5 MiB is refused and stores nothing', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0x20);
    const before = await totalRows();
    const res = await deliver(app, big);
    expect([413, 422]).toContain(res.statusCode);
    expect(await totalRows()).toBe(before);
  });

  it('is 404 when Meta is not configured, and stores nothing', async () => {
    const body = freshBody();
    const res = await deliver(off, body);
    expect(res.statusCode).toBe(404);
    expect(await rowsFor(body)).toHaveLength(0);
  });
});

describe('the raw-body parser does not leak to other routes', () => {
  it('/auth/login still parses JSON normally (a bad body is a validation error, not a buffer)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@test.local', password: 'wrong' },
      headers: { 'x-internal-token': 'test-internal-token-0123456789abcdef-test' },
    });
    // 422 (validation: password too short) or 401, but never a crash from a Buffer body
    expect([401, 422, 429]).toContain(res.statusCode);
  });
});

describe('queueing through the real producer', () => {
  it('one webhook.process job per event, even when delivered twice', async () => {
    const real = await buildApp(metaTestEnv());
    await real.ready();
    const body = freshBody();
    try {
      expect((await deliver(real, body)).statusCode).toBe(200);
      expect((await deliver(real, body)).statusCode).toBe(200);
      const [row] = await rowsFor(body);
      const jobs = await raw.query<{ n: string }>(
        `select count(*)::int as n from pgboss.job where name = 'webhook.process' and data->>'webhookEventId' = $1`,
        [row?.id],
      );
      expect(Number(jobs.rows[0]?.n)).toBe(1);
    } finally {
      await real.close();
    }
  });
});
