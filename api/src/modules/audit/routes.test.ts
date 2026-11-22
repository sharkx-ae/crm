import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawClient, seedWorld, type World } from '../../../tests/helpers/db.ts';
import {
  asSession,
  buildTestApp,
  internal,
  type Mail,
  seedUser,
  signIn,
  signInSuperAdmin,
} from '../../../tests/helpers/http.ts';
import { auditPage, errorBody } from '../../contracts/index.ts';
import { getPool } from '../../db/index.ts';
import { setEmailTransport } from '../../lib/email/index.ts';

let app: FastifyInstance;
let w: World;
let superToken: string;
let superId: string;
let managerToken: string;
let clientToken: string;
let managerId: string;
let mail: Mail;
const raw = rawClient();

beforeAll(async () => {
  const built = await buildTestApp();
  app = built.app;
  mail = built.mail;
  await raw.connect();
  w = await seedWorld();
  const sa = await signInSuperAdmin(app, built.mail);
  superToken = sa.token;
  superId = sa.id;
  const manager = await seedUser({ role: 'manager' });
  managerId = manager.id;
  managerToken = (await signIn(app, built.mail, manager.email)).token;
  const client = await seedUser({ role: 'client', projectId: w.a.projectId });
  clientToken = (await signIn(app, built.mail, client.email)).token;
});
afterAll(async () => {
  await app.close();
  await raw.end();
  setEmailTransport(undefined);
  await getPool().end();
});

const get = (qs: string, token = superToken) =>
  app.inject({ method: 'GET', url: `/audit${qs}`, headers: asSession(token) });
const pageOf = (res: { json(): unknown }) => auditPage.parse(res.json());

// A unique action per test keeps filters independent of whatever other test files wrote.
let n = 0;
const uniqueAction = () => `paging.t${String.fromCharCode(97 + n++)}`;

async function insertRows(
  rows: {
    action: string;
    at: string;
    actor?: string | null;
    project?: string | null;
    id?: string;
  }[],
) {
  for (const r of rows) {
    await raw.query(
      `insert into audit_log (id, at, actor_kind, actor_id, project_id, action, meta)
       values ($1, $2::timestamptz, 'user', $3, $4, $5, '{"k":1}')`,
      [r.id ?? randomUUID(), r.at, r.actor ?? null, r.project ?? null, r.action],
    );
  }
}

describe('GET /audit', () => {
  it('only the super admin reads: a manager and a client user get 403, no session 401', async () => {
    for (const token of [managerToken, clientToken]) {
      const res = await get('', token);
      expect(res.statusCode).toBe(403);
      expect(errorBody.parse(res.json()).error.code).toBe('FORBIDDEN');
    }
    expect(
      (await app.inject({ method: 'GET', url: '/audit', headers: internal() })).statusCode,
    ).toBe(401);
  });

  it('returns the contract shape with actor and project names joined in', async () => {
    const action = 'shape.row';
    await insertRows([
      { action, at: '2026-03-01T10:00:00.000000Z', actor: managerId, project: w.a.projectId },
    ]);
    const res = await get(`?action=${action}&projectId=${w.a.projectId}`);
    expect(res.statusCode).toBe(200);
    const [entry] = pageOf(res).entries;
    expect(entry).toMatchObject({
      action,
      actorKind: 'user',
      actorId: managerId,
      actorName: 'Test User',
      actorRole: 'manager',
      projectId: w.a.projectId,
      meta: { k: 1 },
    });
    expect(entry?.projectName).toContain('Client');
    expect(entry?.at).toBe('2026-03-01T10:00:00.000Z');
  });

  it('filters by user, action, client and date range', async () => {
    const a = uniqueAction();
    const b = uniqueAction();
    await insertRows([
      { action: a, at: '2026-02-01T00:00:00Z', actor: managerId, project: w.a.projectId },
      { action: a, at: '2026-02-10T00:00:00Z', actor: superId, project: w.b.projectId },
      { action: b, at: '2026-02-20T00:00:00Z', actor: managerId, project: w.a.projectId },
    ]);
    const ids = async (qs: string) =>
      pageOf(await get(qs)).entries.map((e) => e.action + e.at.slice(0, 10));
    expect(await ids(`?action=${a}`)).toEqual([`${a}2026-02-10`, `${a}2026-02-01`]);
    expect(await ids(`?action=${a}&userId=${managerId}`)).toEqual([`${a}2026-02-01`]);
    expect(await ids(`?action=${a}&projectId=${w.b.projectId}`)).toEqual([`${a}2026-02-10`]);
    expect(await ids(`?action=${a}&from=2026-02-05T00:00:00Z`)).toEqual([`${a}2026-02-10`]);
    expect(await ids(`?action=${a}&to=2026-02-05T00:00:00Z`)).toEqual([`${a}2026-02-01`]);
    expect(await ids(`?action=${b}&userId=${superId}`)).toEqual([]);
  });

  it('pages with a keyset cursor: newest first, no gaps and no repeats, ties broken by id', async () => {
    const action = uniqueAction();
    const same = '2026-04-01T12:00:00.500000Z';
    await insertRows([
      { action, at: same },
      { action, at: same },
      { action, at: same },
      { action, at: same },
      { action, at: '2026-04-02T12:00:00Z' },
      { action, at: '2026-03-30T12:00:00Z' },
      { action, at: '2026-03-29T12:00:00Z' },
    ]);
    const seen: string[] = [];
    let cursor: string | null = null;
    const sizes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await get(`?action=${action}&limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      const page = pageOf(res);
      sizes.push(page.entries.length);
      seen.push(...page.entries.map((e) => e.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(sizes).toEqual([3, 3, 1]);
    expect(new Set(seen).size).toBe(7);
    const all = pageOf(await get(`?action=${action}&limit=100`)).entries;
    expect(all.map((e) => e.id)).toEqual(seen); // the same order, however it is paged
    const times = all.map((e) => e.at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('keeps microsecond precision in the cursor, so rows inside one millisecond are not skipped', async () => {
    const action = uniqueAction();
    await insertRows([
      { action, at: '2026-05-01T09:00:00.123900Z' },
      { action, at: '2026-05-01T09:00:00.123500Z' },
      { action, at: '2026-05-01T09:00:00.123100Z' },
    ]);
    const first = pageOf(await get(`?action=${action}&limit=1`));
    const second = pageOf(await get(`?action=${action}&limit=1&cursor=${first.nextCursor}`));
    const third = pageOf(await get(`?action=${action}&limit=1&cursor=${second.nextCursor}`));
    expect([first, second, third].map((p) => p.entries.length)).toEqual([1, 1, 1]);
    expect(third.nextCursor).toBeNull();
    expect(new Set([first, second, third].map((p) => p.entries[0]?.id)).size).toBe(3);
  });

  it('a malformed cursor is a 422, and so are bad filters and limits', async () => {
    for (const qs of [
      '?cursor=not-a-cursor',
      `?cursor=${Buffer.from('[1,2]').toString('base64url')}`,
      `?cursor=${Buffer.from('{"at":"x"}').toString('base64url')}`,
      '?userId=nope',
      '?action=NOT%20VALID',
      '?limit=0',
      '?limit=101',
      '?from=yesterday',
    ]) {
      const res = await get(qs);
      expect(res.statusCode, qs).toBe(422);
    }
  });

  it('a cursor never lets a caller read anything the filters would not', async () => {
    const action = uniqueAction();
    await insertRows([
      { action, at: '2026-06-01T00:00:00Z', project: w.a.projectId },
      { action, at: '2026-06-02T00:00:00Z', project: w.b.projectId },
    ]);
    const first = pageOf(await get(`?action=${action}&projectId=${w.b.projectId}&limit=1`));
    expect(first.nextCursor).toBeNull();
    expect(first.entries.every((e) => e.projectId === w.b.projectId)).toBe(true);
  });

  it('sees what the flows wrote: a sign-in is in the log with its actor', async () => {
    const u = await seedUser();
    await signIn(app, mail, u.email);
    const page = pageOf(await get(`?userId=${u.id}&limit=20`));
    const actions = page.entries.map((e) => e.action).sort();
    expect(actions).toEqual(['auth.code_verified', 'auth.login']);
    expect(page.entries.every((e) => e.actorName === 'Test User')).toBe(true);
  });
});
