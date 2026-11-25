// A tiny stand-in for the api, for the `stubbed` Playwright project (web plan §2.15). It answers the same contract
// as the real api, and every response is parsed with the contract schema before it is sent, so a fixture that
// drifts from the contract fails here instead of passing silently. Nothing in src/ knows it exists.
// Run: node tests/e2e/support/fake-api.ts <port>
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { z } from 'zod';
import {
  activeSessionResponse,
  inviteRequest,
  listUsersQuery,
  listUsersResponse,
  meResponse,
  okResponse,
  pendingSessionResponse,
  setUserStatusRequest,
  type UserSummary,
  updateMeRequest,
  userSummary,
} from '../../../src/contracts/auth.ts';
import type { Locale } from '../../../src/contracts/common.ts';
import {
  createProjectRequest,
  createProjectResponse,
  projectDetail,
  projectOptionsResponse,
  projectsHomeResponse,
  updateProjectSettingsRequest,
} from '../../../src/contracts/projects.ts';
import { FIXTURE } from './fixtures.ts';

const port = Number(process.argv[2] ?? 4200);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type User = (typeof FIXTURE.users)[number];
type Session = { user: User; stage: 'pending_2fa' | 'active'; locale: Locale };
const sessions = new Map<string, Session>();

// Everyone the Team and Client users screens list: the fixture's managers and client users, then invites.
const people: UserSummary[] = FIXTURE.users
  .filter((u) => u.role !== 'super_admin')
  .map((u) => ({
    id: u.userId,
    name: u.name,
    email: u.email,
    role: u.role,
    status: 'active' as const,
    projectId: u.role === 'client' ? (u.projectIds[0] ?? null) : null,
    createdAt: '2026-11-20T08:00:00.000Z',
  }));
/** Invited during the run: no password yet (the fake has no accept flow). */
const noPassword = new Set<string>();
const staffOnly = (s: Session, targetRole: 'manager' | 'client') =>
  targetRole === 'manager' ? s.user.role === 'super_admin' : s.user.role !== 'client';

const token = () => randomBytes(32).toString('base64url');
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const me = (s: Session) =>
  meResponse.parse({
    userId: s.user.userId,
    role: s.user.role,
    projectIds: s.user.projectIds,
    locale: s.locale,
    stage: s.stage,
    name: s.user.name,
    email: s.user.email,
  });

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
const ok = <S extends z.ZodType>(res: ServerResponse, schema: S, body: unknown) =>
  send(res, 200, schema.parse(body));
const fail = (res: ServerResponse, status: number, code: string) =>
  send(res, status, { error: { code } });

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /health') return send(res, 200, { status: 'ok', checks: { db: 'ok' } });
  if (!req.headers['x-internal-token']) return fail(res, 401, 'UNAUTHENTICATED');

  const raw = req.headers['x-session-token'];
  const session = typeof raw === 'string' ? sessions.get(raw) : undefined;

  if (route === 'POST /auth/login') {
    const body = await readJson(req);
    const user = FIXTURE.users.find((u) => u.email === body.email);
    if (!user || body.password !== FIXTURE.password) return fail(res, 401, 'UNAUTHENTICATED');
    const t = token();
    sessions.set(t, { user, stage: 'pending_2fa', locale: user.locale });
    return ok(res, pendingSessionResponse, {
      stage: 'pending_2fa',
      sessionToken: t,
      expiresAt: inMinutes(15),
      maskedEmail: 'c***@example.test',
    });
  }

  if (!session) return fail(res, 401, 'UNAUTHENTICATED');

  if (route === 'POST /auth/code/verify') {
    const body = await readJson(req);
    if (session.stage !== 'pending_2fa' || body.code !== FIXTURE.code)
      return fail(res, 422, 'VALIDATION');
    sessions.delete(raw as string);
    const t = token();
    const active: Session = { ...session, stage: 'active' };
    sessions.set(t, active);
    return ok(res, activeSessionResponse, {
      stage: 'active',
      sessionToken: t,
      expiresAt: inMinutes(60 * 12),
      me: me(active),
    });
  }
  if (route === 'POST /auth/logout') {
    sessions.delete(raw as string);
    return ok(res, okResponse, { ok: true });
  }
  if (route === 'GET /me') return ok(res, meResponse, me(session));

  if (session.stage !== 'active') return fail(res, 401, 'UNAUTHENTICATED');
  if (route === 'PATCH /me') {
    // Validated like the real api: a bad body is 422 and changes nothing.
    const parsed = updateMeRequest.safeParse(await readJson(req));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    session.locale = parsed.data.locale;
    return ok(res, meResponse, me(session));
  }

  // Projects: staff see every client, a client user only its own; anything else is 404.
  const visible = FIXTURE.projects.filter(
    (p) => session.user.role !== 'client' || session.user.projectIds.includes(p.id),
  );
  // Clients home (staff only): every fixture client, quiet numbers, TikTok/LinkedIn/Snapchat not connected.
  if (route === 'GET /projects') {
    if (session.user.role === 'client') return fail(res, 403, 'FORBIDDEN');
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const platforms = [
      'whatsapp',
      'meta',
      'google',
      'tiktok',
      'linkedin',
      'snapchat',
      'website',
    ] as const;
    const rows = FIXTURE.projects.map(({ businessHours: _, ...o }) => ({
      ...o,
      newToday: 1,
      unreplied: 0,
      overdue: 0,
      integrations: platforms.map((platform) => ({
        platform,
        status: ['tiktok', 'linkedin', 'snapchat'].includes(platform)
          ? 'not_connected'
          : 'connected',
      })),
    }));
    return ok(res, projectsHomeResponse, {
      totals: { newToday: rows.length, unreplied: 0, overdue: 0, toFix: 0 },
      rows: rows.filter((r) => !q || `${r.name} ${r.city} ${r.industry}`.toLowerCase().includes(q)),
    });
  }
  if (route === 'GET /projects/options') {
    return ok(res, projectOptionsResponse, {
      options: visible.map(({ businessHours: _, ...o }) => o),
    });
  }
  // Create client (super admin): added to the fixture so the switcher, home and detail all see it.
  if (route === 'POST /projects') {
    if (session.user.role !== 'super_admin') return fail(res, 403, 'FORBIDDEN');
    const parsed = createProjectRequest.safeParse(await readJson(req));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const { name, city, industry } = parsed.data;
    if (FIXTURE.projects.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      return fail(res, 409, 'CONFLICT');
    const id = randomUUID();
    FIXTURE.projects.push({
      id,
      name,
      city,
      industry,
      color: '#776f6f',
      timezone: city === 'Morocco' ? 'Africa/Casablanca' : 'Asia/Dubai',
      businessHours: FIXTURE.projects[0]?.businessHours ?? [],
    });
    return ok(res, createProjectResponse, { projectId: id });
  }
  // People (F2b Team: managers, super admin only; F10a Client users: one client's users, staff only).
  if (route === 'GET /users') {
    const query = listUsersQuery.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) return fail(res, 422, 'VALIDATION');
    if (!staffOnly(session, query.data.kind)) return fail(res, 403, 'FORBIDDEN');
    const q = query.data;
    return ok(res, listUsersResponse, {
      users: people.filter((u) =>
        q.kind === 'manager'
          ? u.role === 'manager'
          : u.role === 'client' && u.projectId === q.projectId,
      ),
    });
  }
  if (route === 'POST /users/invite') {
    const parsed = inviteRequest.safeParse(await readJson(req));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const body = parsed.data;
    if (!staffOnly(session, body.kind)) return fail(res, 403, 'FORBIDDEN');
    if (body.kind === 'client' && !FIXTURE.projects.some((p) => p.id === body.projectId))
      return fail(res, 404, 'NOT_FOUND');
    const email = body.email.toLowerCase();
    if (people.some((u) => u.email === email) || FIXTURE.users.some((u) => u.email === email))
      return fail(res, 409, 'CONFLICT');
    const user: UserSummary = {
      id: randomUUID(),
      name: body.name,
      email,
      role: body.kind,
      status: 'invited',
      projectId: body.kind === 'client' ? body.projectId : null,
      createdAt: new Date().toISOString(),
    };
    people.push(user);
    noPassword.add(user.id);
    return ok(res, userSummary, user);
  }
  const status = /^POST \/users\/([^/]+)\/status$/.exec(route);
  if (status) {
    const parsed = setUserStatusRequest.safeParse(await readJson(req));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const user = people.find((u) => u.id === status[1]);
    if (!user) return fail(res, 404, 'NOT_FOUND');
    if (!staffOnly(session, user.role === 'manager' ? 'manager' : 'client'))
      return fail(res, 403, 'FORBIDDEN');
    // Like the real api: enabling someone who never set a password puts them back to Invited, not Active.
    const next =
      parsed.data.status === 'disabled'
        ? 'disabled'
        : noPassword.has(user.id)
          ? 'invited'
          : 'active';
    if (user.status === next) return fail(res, 409, 'CONFLICT');
    user.status = next;
    return ok(res, userSummary, user);
  }
  // Business hours (staff): validated with the contract, echoed back as the detail.
  const settings = /^PATCH \/projects\/([^/]+)\/settings$/.exec(route);
  if (settings) {
    if (session.user.role === 'client') return fail(res, 403, 'FORBIDDEN');
    const parsed = updateProjectSettingsRequest.safeParse(await readJson(req));
    const p = FIXTURE.projects.find((x) => x.id === settings[1]);
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    if (!p || parsed.data.projectId !== p.id) return fail(res, 404, 'NOT_FOUND');
    Object.assign(p, { timezone: parsed.data.timezone, businessHours: parsed.data.businessHours });
    return ok(res, projectDetail, p);
  }
  const detail = /^GET \/projects\/([^/]+)$/.exec(route);
  if (detail) {
    // The real api validates the id before access: a malformed one is 422 for every role.
    if (!UUID.test(detail[1] ?? '')) return fail(res, 422, 'VALIDATION');
    const p = visible.find((x) => x.id === detail[1]);
    return p ? ok(res, projectDetail, p) : fail(res, 404, 'NOT_FOUND');
  }
  return fail(res, 404, 'NOT_FOUND');
});

server.listen(port, () => {
  console.log(JSON.stringify({ msg: 'fake api listening', port }));
});
