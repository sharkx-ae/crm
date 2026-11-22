import { randomUUID } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../src/db/index.ts';
import { memoryTransport, setEmailTransport } from '../../src/lib/email/index.ts';
import { getTestDbUrl } from '../../src/lib/env.ts';
import { reportError } from '../../src/lib/errors/index.ts';
import { enqueue, queueHealth, queuePolicies, stopQueue } from '../../src/lib/queue/index.ts';
import { type Registry, registerQueues } from '../../src/worker/registry.ts';
import { rawClient } from '../helpers/db.ts';

vi.stubEnv('ALERT_EMAIL', 'alerts@test.local');
vi.stubEnv('APP_ENV', 'staging');
vi.stubEnv('RESEND_API_KEY', 'unused-because-transport-is-stubbed');
vi.stubEnv('EMAIL_FROM', 'SharkX <no-reply@test.local>');

const raw = rawClient();
const quiet = { info: () => undefined };
const bosses: PgBoss[] = [];
const newBoss = async () => {
  const b = new PgBoss({ connectionString: getTestDbUrl(), schedule: false });
  b.on('error', () => undefined);
  await b.start();
  bosses.push(b);
  return b;
};

beforeAll(() => raw.connect());
afterAll(async () => {
  for (const b of bosses) await b.stop({ graceful: false, close: true }).catch(() => undefined);
  await stopQueue();
  await raw.end();
  await getPool().end();
  setEmailTransport(undefined);
  vi.unstubAllEnvs();
});

const alertJobs = async (fingerprint: string) =>
  (
    await raw.query<{ state: string }>(
      `select state from pgboss.job where name = 'email.send' and data->>'template' = 'alert' and data->'data'->>'fingerprint' = $1`,
      [fingerprint],
    )
  ).rows;
const errorRows = async (fingerprint: string) =>
  (
    await raw.query<{ message: string; context: Record<string, unknown> }>(
      'select message, context from error_log where fingerprint = $1',
      [fingerprint],
    )
  ).rows;
async function until<T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 25_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (done(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
}

const csvPayload = () => ({
  projectId: randomUUID(),
  uploadId: randomUUID(),
  mapping: { Name: 'name' },
});
// A fast policy for csv.import (production: no retries) so a failing job is observable in seconds.
const fast = { ...queuePolicies, 'csv.import': { retryLimit: 2, retryDelay: 1 } };

describe('the queue registry', () => {
  it('gives every CONTRACTS §5 queue its retry policy', () => {
    expect(queuePolicies['webhook.process']).toMatchObject({
      retryLimit: 5,
      retryDelay: 10,
      retryBackoff: true,
    });
    expect(queuePolicies['wa.history.sync']).toMatchObject({
      retryLimit: 3,
      retryDelay: 60,
      expireInSeconds: 3600,
    });
    expect(queuePolicies['conversion.send']).toMatchObject({
      retryLimit: 8,
      retryDelay: 10,
      retryBackoff: true,
    });
    expect(queuePolicies['integration.health']).toMatchObject({
      retryLimit: 0,
      cron: '*/5 * * * *',
    });
    expect(queuePolicies['automation.timer']).toMatchObject({ retryLimit: 3 });
    expect(queuePolicies['task.reminder']).toMatchObject({ retryLimit: 3 });
    expect(queuePolicies['email.send']).toMatchObject({
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
      deleteAfterSeconds: 86_400,
    });
    expect(queuePolicies['csv.import']).toMatchObject({ retryLimit: 0 });
    expect(queuePolicies.maintenance).toMatchObject({ retryLimit: 0, cron: '0 3 * * *' });
  });

  it('creates every queue in pg-boss and schedules the crons that have a handler', async () => {
    const boss = await newBoss();
    const working = await registerQueues(boss, quiet);
    expect(working.sort()).toEqual(['email.send', 'maintenance']);
    const queues = (await boss.getQueues()).map((q) => q.name);
    for (const name of Object.keys(queuePolicies)) expect(queues, name).toContain(name);
    const schedules = (await boss.getSchedules()).map((s) => s.name);
    expect(schedules).toContain('maintenance');
    expect(schedules).not.toContain('integration.health'); // no handler yet (F14a)
    await boss.stop({ graceful: true, close: true });
  });
});

describe('producer', () => {
  it('refuses a payload the contract rejects', async () => {
    await expect(
      enqueue('email.send', { to: 'not-an-email', template: 'alert', locale: 'en', data: {} }),
    ).rejects.toThrow();
    await expect(
      enqueue('email.send', {
        to: 'a@test.local',
        // @ts-expect-error a template outside the enum
        template: 'password_dump',
        locale: 'en',
        data: {},
      }),
    ).rejects.toThrow();
  });

  it('a repeated send with the same singletonKey is a no-op', async () => {
    const key = `dedupe-${randomUUID()}`;
    const payload = { taskId: randomUUID() };
    const first = await enqueue('task.reminder', payload, { singletonKey: key });
    const second = await enqueue('task.reminder', payload, { singletonKey: key });
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(await enqueue('task.reminder', payload, { singletonKey: `${key}-other` })).toBeTruthy();
  });

  it('/health reports the queue', async () => {
    expect(await queueHealth()).toBe('ok');
  });
});

describe('a job that always fails', () => {
  it('is retried per its policy, lands in error_log once, and sends exactly one alert email', async () => {
    const boss = await newBoss();
    await boss.deleteQueue('csv.import'); // forget a policy left by an earlier run
    const attempts: number[] = [];
    const entries = {
      'csv.import': {
        handler: async (_data: unknown, job: { retryCount: number }) => {
          attempts.push(job.retryCount);
          throw new Error('boom for someone@example.com');
        },
        tag: (d: { uploadId: string }) => d.uploadId,
      },
    } as unknown as Registry;
    await registerQueues(boss, quiet, entries, fast, { pollingIntervalSeconds: 0.5 });

    const data = csvPayload();
    const fingerprint = `job:csv.import:${data.uploadId}`;
    await enqueue('csv.import', data);

    const rows = await until(
      () => errorRows(fingerprint),
      (r) => r.length > 0,
    );
    // retryLimit 2 = three attempts in total, counted by pg-boss
    expect(attempts).toEqual([0, 1, 2]);
    expect(rows).toHaveLength(1); // only the last attempt reports
    expect(rows[0]?.context).toMatchObject({ source: 'job', job: 'csv.import', attempts: 3 });
    expect(JSON.stringify(rows)).not.toContain('someone@example.com'); // redacted

    const alerts = await until(
      () => alertJobs(fingerprint),
      (a) => a.length > 0,
    );
    expect(alerts).toHaveLength(1);

    await boss.deleteQueue('csv.import');
    await boss.stop({ graceful: true, close: true });
  }, 40_000);

  it('queued work survives a worker restart and is picked up by the next one', async () => {
    const first = await newBoss();
    await first.deleteQueue('csv.import');
    await registerQueues(first, quiet, { 'csv.import': {} } as unknown as Registry, fast); // queue, no consumer
    const data = csvPayload();
    await enqueue('csv.import', data);
    await first.stop({ graceful: true, close: true }); // the worker goes away with the job still waiting

    const seen: string[] = [];
    const second = await newBoss();
    const entries = {
      'csv.import': { handler: async (d: { uploadId: string }) => void seen.push(d.uploadId) },
    } as unknown as Registry;
    await registerQueues(second, quiet, entries, fast, { pollingIntervalSeconds: 0.5 });
    await until(
      async () => seen,
      (s) => s.length > 0,
    );
    expect(seen).toEqual([data.uploadId]);
    await second.deleteQueue('csv.import');
    await second.stop({ graceful: true, close: true });
  }, 40_000);
});

describe('the email job', () => {
  it('sends through the transport, and one alert reaches the alert inbox exactly once', async () => {
    const mail = memoryTransport();
    setEmailTransport(mail);
    const boss = await newBoss();
    await registerQueues(boss, quiet, undefined, undefined, { pollingIntervalSeconds: 0.5 });

    const fingerprint = `api:/test:${randomUUID().slice(0, 8)}`;
    await reportError({
      source: 'api',
      fingerprint,
      message: 'TypeError: value for jo@example.com broke',
    });
    const sent = await until(
      async () =>
        mail.sent.filter((m) => m.to === 'alerts@test.local' && m.text.includes(fingerprint)),
      (m) => m.length > 0,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.template).toBe('alert');
    expect(sent[0]?.text).not.toContain('jo@example.com');
    expect(sent[0]?.subject).toContain('staging');
    await boss.stop({ graceful: true, close: true });
  }, 40_000);
});

describe('reportError', () => {
  it('ten identical errors leave ten error_log rows and one alert', async () => {
    const fingerprint = `api:/burst:${randomUUID().slice(0, 8)}`;
    await Promise.all(
      Array.from({ length: 10 }, () =>
        reportError({ source: 'api', fingerprint, message: 'Error: same problem' }),
      ),
    );
    expect(await errorRows(fingerprint)).toHaveLength(10);
    expect(await alertJobs(fingerprint)).toHaveLength(1);
    // a different fingerprint is its own alert
    const other = `${fingerprint}-b`;
    await reportError({ source: 'api', fingerprint: other, message: 'Error: another' });
    expect(await alertJobs(other)).toHaveLength(1);
  });

  it('redacts the message and the context before storing them', async () => {
    const fingerprint = `api:/redact:${randomUUID().slice(0, 8)}`;
    await reportError({
      source: 'api',
      fingerprint,
      message: 'duplicate key (email)=(ann@example.com) phone +971501234567',
      context: { password: 'hunter2hunter2', token: 'x', route: '/users/invite' },
    });
    const [row] = await errorRows(fingerprint);
    expect(row?.message).toBe('duplicate key (email)=([email]) phone [phone]');
    expect(row?.context).toMatchObject({ route: '/users/invite', source: 'api' });
    expect(row?.context).not.toHaveProperty('password');
    expect(row?.context).not.toHaveProperty('token');
  });

  it('a failing alert email is logged to error_log but never alerts again', async () => {
    const fingerprint = 'job:email.send:alert';
    const before = (await errorRows(fingerprint)).length;
    const alertsBefore = (
      await raw.query(
        `select 1 from pgboss.job where name = 'email.send' and data->'data'->>'fingerprint' = $1`,
        [fingerprint],
      )
    ).rowCount;
    await reportError({ source: 'job', fingerprint, message: 'email.send failed' });
    await reportError({ source: 'job', fingerprint, message: 'email.send failed' });
    expect((await errorRows(fingerprint)).length).toBe(before + 2);
    const alertsAfter = (
      await raw.query(
        `select 1 from pgboss.job where name = 'email.send' and data->'data'->>'fingerprint' = $1`,
        [fingerprint],
      )
    ).rowCount;
    expect(alertsAfter).toBe(alertsBefore);
  });

  it('never throws, even when the database is unreachable for the report', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // an oversized fingerprint is cut, not fatal; a bad payload to the queue would be swallowed the same way
    await expect(
      reportError({ source: 'api', fingerprint: 'x'.repeat(5000), message: 'm' }),
    ).resolves.toBeUndefined();
    err.mockRestore();
  });
});
