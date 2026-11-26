import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedWorld, type World } from '../../../tests/helpers/db.ts';
import {
  asSession,
  buildTestApp,
  seedUser,
  signIn,
  signInSuperAdmin,
} from '../../../tests/helpers/http.ts';
import { projectDetail, projectOptionsResponse } from '../../contracts/projects.ts';
import { getPool } from '../../db/index.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { colorFor, PROJECT_COLORS } from './colors.ts';
import { toDailyHours } from './hours.ts';
import { projects } from './schema.ts';

describe('toDailyHours', () => {
  it('turns the F1b shape into seven per-day entries', () => {
    const days = toDailyHours({ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' });
    expect(days).toHaveLength(7);
    expect(days.filter((d) => d.open).map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(days[5]).toEqual({ day: 6, open: false, from: '09:00', to: '18:00' });
  });

  it('passes the per-day array (after migration 0003) through unchanged', () => {
    const arr = toDailyHours({ days: [6], start: '10:00', end: '14:00' });
    expect(toDailyHours(arr)).toBe(arr);
  });
});

describe('colorFor', () => {
  it('keeps a stored colour', () => {
    expect(colorFor(randomUUID(), '#1c0f0f')).toBe('#1c0f0f');
  });

  it('picks a stable brand token when none is stored', () => {
    const id = randomUUID();
    expect(PROJECT_COLORS).toContain(colorFor(id, null));
    expect(colorFor(id, null)).toBe(colorFor(id, null));
  });

  it('uses only tokens.json colours', () => {
    const tokens = readFileSync(
      new URL('../../../../skills/sharkx-brand-guidelines/assets/tokens.json', import.meta.url),
      'utf8',
    ).toLowerCase();
    for (const c of PROJECT_COLORS) expect(tokens, c).toContain(`"${c}"`);
  });
});

describe('GET /projects/options and /projects/:id', () => {
  let app: FastifyInstance;
  let w: World;
  let superToken: string;
  let managerToken: string;
  let clientAToken: string;
  let mail: Awaited<ReturnType<typeof buildTestApp>>['mail'];

  beforeAll(async () => {
    const built = await buildTestApp();
    app = built.app;
    mail = built.mail;
    w = await seedWorld();
    superToken = (await signInSuperAdmin(app, built.mail)).token;
    const manager = await seedUser({ role: 'manager' });
    managerToken = (await signIn(app, built.mail, manager.email)).token;
    const clientA = await seedUser({ role: 'client', projectId: w.a.projectId });
    clientAToken = (await signIn(app, built.mail, clientA.email)).token;
    await withSystem(w.a.projectId, (tx) =>
      tx.update(projects).set({ color: '#f16767' }).where(eq(projects.id, w.a.projectId)),
    );
  });
  afterAll(async () => {
    await app.close();
    setEmailTransport(undefined);
    await getPool().end();
  });

  const get = (url: string, token: string) =>
    app.inject({ method: 'GET', url, headers: asSession(token) });
  const optionIds = async (token: string) => {
    const res = await get('/projects/options', token);
    expect(res.statusCode).toBe(200);
    return projectOptionsResponse.parse(res.json()).options.map((o) => o.id);
  };

  it('staff see every client in the switcher', async () => {
    for (const token of [superToken, managerToken]) {
      const ids = await optionIds(token);
      expect(ids).toContain(w.a.projectId);
      expect(ids).toContain(w.b.projectId);
    }
  });

  it('a client user sees only its own client', async () => {
    expect(await optionIds(clientAToken)).toEqual([w.a.projectId]);
  });

  it('a client user with no client gets an empty switcher and 404 on every project', async () => {
    const orphan = await seedUser({ role: 'client' });
    const token = (await signIn(app, mail, orphan.email)).token;
    expect(await optionIds(token)).toEqual([]);
    expect((await get(`/projects/${w.a.projectId}`, token)).statusCode).toBe(404);
  });

  it('options are sorted by name and every row has a brand colour', async () => {
    const res = await get('/projects/options', superToken);
    const { options } = projectOptionsResponse.parse(res.json());
    const names = options.map((o) => o.name.toLowerCase());
    expect(names).toEqual([...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    for (const o of options) expect(PROJECT_COLORS as readonly string[]).toContain(o.color);
  });

  it('detail: the own client answers with seven business-hours days, and no user data', async () => {
    const res = await get(`/projects/${w.a.projectId}`, clientAToken);
    expect(res.statusCode).toBe(200);
    const body = projectDetail.parse(res.json());
    expect(body).toMatchObject({ id: w.a.projectId, color: '#f16767', timezone: 'Asia/Dubai' });
    expect(body.businessHours).toHaveLength(7);
    expect(Object.keys(res.json()).sort()).toEqual(
      ['businessHours', 'city', 'color', 'id', 'industry', 'name', 'timezone'].sort(),
    );
  });

  it('detail: staff open any client', async () => {
    expect((await get(`/projects/${w.b.projectId}`, managerToken)).statusCode).toBe(200);
    expect((await get(`/projects/${w.b.projectId}`, superToken)).statusCode).toBe(200);
  });

  it('detail: another client’s project and an unknown id are both 404', async () => {
    expect((await get(`/projects/${w.b.projectId}`, clientAToken)).statusCode).toBe(404);
    expect((await get(`/projects/${randomUUID()}`, superToken)).statusCode).toBe(404);
    expect((await get(`/projects/${randomUUID()}`, clientAToken)).statusCode).toBe(404);
  });

  it('detail: a malformed id is a validation error for staff', async () => {
    expect((await get('/projects/not-a-uuid', managerToken)).statusCode).toBe(422);
  });

  it('both routes need an active session', async () => {
    expect((await get('/projects/options', 'bogus')).statusCode).toBe(401);
    expect((await get(`/projects/${w.a.projectId}`, 'bogus')).statusCode).toBe(401);
  });
});
