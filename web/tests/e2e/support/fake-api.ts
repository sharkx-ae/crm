// A tiny stand-in for the api, for the `stubbed` Playwright project (web plan §2.15). It answers the same contract
// as the real api, and every response is parsed with the contract schema before it is sent, so a fixture that
// drifts from the contract fails here instead of passing silently. Nothing in src/ knows it exists.
// Run: node tests/e2e/support/fake-api.ts <port>
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { z } from 'zod';
import {
  activeSessionResponse,
  meResponse,
  okResponse,
  pendingSessionResponse,
  updateMeRequest,
} from '../../../src/contracts/auth.ts';
import type { Locale } from '../../../src/contracts/common.ts';
import { projectDetail, projectOptionsResponse } from '../../../src/contracts/projects.ts';
import { FIXTURE } from './fixtures.ts';

const port = Number(process.argv[2] ?? 4200);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type User = (typeof FIXTURE.users)[number];
type Session = { user: User; stage: 'pending_2fa' | 'active'; locale: Locale };
const sessions = new Map<string, Session>();

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
  if (route === 'GET /projects/options') {
    return ok(res, projectOptionsResponse, {
      options: visible.map(({ businessHours: _, ...o }) => o),
    });
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
