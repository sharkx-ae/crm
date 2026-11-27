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
import { contactProfile, contactsPage, contactsQuery } from '../../../src/contracts/contacts.ts';
import {
  assignLeadRequest,
  assignLeadResponse,
  leadDetail,
  leadExportRequest,
  leadExportRows,
  leadsPage,
  leadsQuery,
  markLeadRequest,
  markLeadResponse,
  projectScope,
} from '../../../src/contracts/leads.ts';
import {
  createProjectRequest,
  createProjectResponse,
  projectDetail,
  projectOptionsResponse,
  projectsHomeResponse,
  updateProjectSettingsRequest,
} from '../../../src/contracts/projects.ts';
import { overviewResponse } from '../../../src/contracts/reports.ts';
import { FIXTURE, type FixtureLead } from './fixtures.ts';

const port = Number(process.argv[2] ?? 4200);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type User = (typeof FIXTURE.users)[number];
type Session = { user: User; stage: 'pending_2fa' | 'active'; locale: Locale };
const sessions = new Map<string, Session>();
/** Trusted-device tokens → the email they belong to (spec F1c-remember-device). */
const devices = new Map<string, string>();

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
    // A trusted device (ticked at an earlier code step) skips the code, like the real api.
    const rawDevice = req.headers['x-device-token'];
    if (typeof rawDevice === 'string' && devices.get(rawDevice) === user.email) {
      const active: Session = { user, stage: 'active', locale: user.locale };
      sessions.set(t, active);
      return ok(res, activeSessionResponse, {
        stage: 'active',
        sessionToken: t,
        expiresAt: inMinutes(60 * 12),
        me: me(active),
        deviceExpiresAt: inMinutes(60 * 24 * 30),
      });
    }
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
    const device = body.trustDevice === true ? token() : undefined;
    if (device) devices.set(device, session.user.email);
    return ok(res, activeSessionResponse, {
      stage: 'active',
      sessionToken: t,
      expiresAt: inMinutes(60 * 12),
      me: me(active),
      ...(device && { deviceToken: device, deviceExpiresAt: inMinutes(60 * 24 * 30) }),
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
  // Leads and contacts (F4b). Every success body is parsed with its contract before it is sent.
  const QUALIFICATION = {
    mqlDefinition: 'A lead who asked for a consultation.',
    sqlDefinition: 'A lead who booked a visit.',
    reasons: ['Budget', 'Wrong service', 'Duplicate'],
  };
  const seeProject = (projectId: string) => {
    if (!FIXTURE.projects.some((p) => p.id === projectId)) return fail(res, 404, 'NOT_FOUND');
    if (session.user.role === 'client' && !session.user.projectIds.includes(projectId))
      return fail(res, 404, 'NOT_FOUND');
    return null;
  };
  const staffRow = (lead: FixtureLead) => {
    const { projectId: _projectId, ...row } = lead;
    return row;
  };
  const clientRow = (lead: FixtureLead) => {
    const { ownerId: _ownerId, ownerName: _ownerName, ...row } = staffRow(lead);
    return row;
  };
  const rowFor = (lead: FixtureLead) =>
    session.user.role === 'client' ? clientRow(lead) : staffRow(lead);
  const byNewest = (a: FixtureLead, b: FixtureLead) =>
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  const narrowed = (
    projectId: string,
    f: { q?: string | undefined; source?: string | undefined; owner?: string | undefined },
  ) =>
    FIXTURE.leads.filter((lead) => {
      if (lead.projectId !== projectId) return false;
      if (f.source && lead.source !== f.source) return false;
      if (f.owner === 'unassigned' && lead.ownerId !== null) return false;
      if (f.owner && f.owner !== 'unassigned' && lead.ownerId !== f.owner) return false;
      if (f.q) {
        const q = f.q.toLowerCase();
        const blob = `${lead.name ?? ''} ${lead.campaign ?? ''} ${lead.phone ?? ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });

  // Overview (F13a): Lumière's chart data from the fixture, its tiles from the leads; every other client is empty.
  if (route === 'GET /reports/overview') {
    const parsed = projectScope.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const denied = seeProject(parsed.data.projectId);
    if (denied) return denied;
    const mine = FIXTURE.leads.filter((l) => l.projectId === parsed.data.projectId);
    const lum = parsed.data.projectId === FIXTURE.ids.lumiere;
    const days = lum
      ? FIXTURE.overview.lumiere.perDay
      : FIXTURE.overview.lumiere.perDay.map((d) => ({ date: d.date, count: 0 }));
    const leads30 = days.reduce((n, d) => n + d.count, 0);
    const share = (f: (l: FixtureLead) => boolean) =>
      mine.length ? mine.filter(f).length / mine.length : null;
    const kpis = {
      leads30,
      newToday: days.at(-1)?.count ?? 0,
      medianFirstReplyMin: lum ? FIXTURE.overview.lumiere.medianFirstReplyMin : null,
      mqlRate: share((l) => l.status === 'mql' || l.status === 'sql'),
      sqlRate: share((l) => l.status === 'sql'),
    };
    const series = { perDay: days, bySource: lum ? FIXTURE.overview.lumiere.bySource : [] };
    if (session.user.role !== 'client')
      return ok(res, overviewResponse, { view: 'staff', kpis, ...series });
    const waiting = mine.filter((l) => l.status === 'new').sort(byNewest);
    return ok(res, overviewResponse, {
      view: 'client',
      kpis: { ...kpis, waiting: waiting.length },
      ...series,
      waiting: waiting.slice(0, 5).map(clientRow),
    });
  }
  if (route === 'GET /leads') {
    const parsed = leadsQuery.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    if (session.user.role === 'client' && parsed.data.owner) return fail(res, 422, 'VALIDATION');
    const denied = seeProject(parsed.data.projectId);
    if (denied) return denied;
    const base = narrowed(parsed.data.projectId, parsed.data);
    const tabbed =
      parsed.data.tab === 'all'
        ? base
        : base.filter((lead) =>
            parsed.data.tab === 'unreviewed'
              ? lead.status === 'new'
              : lead.status === parsed.data.tab,
          );
    const from = (parsed.data.page - 1) * parsed.data.limit;
    const rows = [...tabbed]
      .sort(byNewest)
      .slice(from, from + parsed.data.limit)
      .map(rowFor);
    const counts = {
      all: base.length,
      unreviewed: base.filter((lead) => lead.status === 'new').length,
      mql: base.filter((lead) => lead.status === 'mql').length,
      sql: base.filter((lead) => lead.status === 'sql').length,
      not_qualified: base.filter((lead) => lead.status === 'not_qualified').length,
    };
    const sources = [
      ...new Set(
        FIXTURE.leads.filter((l) => l.projectId === parsed.data.projectId).map((l) => l.source),
      ),
    ];
    if (session.user.role === 'client') {
      return ok(res, leadsPage, { view: 'client', counts, total: tabbed.length, sources, rows });
    }
    return ok(res, leadsPage, {
      view: 'staff',
      counts,
      total: tabbed.length,
      sources,
      rows,
      owners: [{ id: FIXTURE.ids.rami, name: 'Rami Haddad', active: true }],
    });
  }

  if (route === 'POST /leads/export') {
    const parsed = leadExportRequest.safeParse(await readJson(req));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    if (session.user.role === 'client' && parsed.data.owner) return fail(res, 422, 'VALIDATION');
    const denied = seeProject(parsed.data.projectId);
    if (denied) return denied;
    const base = narrowed(parsed.data.projectId, parsed.data);
    const tabbed =
      parsed.data.tab === 'all'
        ? base
        : base.filter((lead) =>
            parsed.data.tab === 'unreviewed'
              ? lead.status === 'new'
              : lead.status === parsed.data.tab,
          );
    const rows = [...tabbed].sort(byNewest).map((lead) => {
      const common = {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        source: lead.source,
        campaign: lead.campaign,
        status: lead.status,
        reason: lead.reason,
        receivedAt: lead.createdAt,
      };
      return session.user.role === 'client' ? common : { ...common, ownerName: lead.ownerName };
    });
    return ok(res, leadExportRows, {
      view: session.user.role === 'client' ? 'client' : 'staff',
      rows,
    });
  }

  const marked = /^POST \/leads\/([^/]+)\/status$/.exec(route);
  if (marked) {
    if (!UUID.test(marked[1] ?? '')) return fail(res, 422, 'VALIDATION');
    const parsed = markLeadRequest.safeParse(await readJson(req));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const denied = seeProject(parsed.data.projectId);
    if (denied) return denied;
    const lead = FIXTURE.leads.find(
      (l) => l.id === marked[1] && l.projectId === parsed.data.projectId,
    );
    if (!lead) return fail(res, 404, 'NOT_FOUND');
    if (
      parsed.data.to === 'not_qualified' &&
      (!parsed.data.reason || !QUALIFICATION.reasons.includes(parsed.data.reason))
    ) {
      return fail(res, 422, 'VALIDATION');
    }
    lead.status = parsed.data.to;
    lead.reason = parsed.data.to === 'not_qualified' ? (parsed.data.reason ?? null) : null;
    return ok(res, markLeadResponse, {
      view: session.user.role === 'client' ? 'client' : 'staff',
      lead: rowFor(lead),
      // Staff fixture always queues one outbox row, so the toast says it was sent to the ad platform.
      outboxQueued: session.user.role === 'client' ? 0 : 1,
    });
  }

  const assigned = /^POST \/leads\/([^/]+)\/assign$/.exec(route);
  if (assigned) {
    if (session.user.role === 'client') return fail(res, 403, 'FORBIDDEN');
    if (!UUID.test(assigned[1] ?? '')) return fail(res, 422, 'VALIDATION');
    const parsed = assignLeadRequest.safeParse(await readJson(req));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const denied = seeProject(parsed.data.projectId);
    if (denied) return denied;
    const lead = FIXTURE.leads.find(
      (l) => l.id === assigned[1] && l.projectId === parsed.data.projectId,
    );
    if (!lead) return fail(res, 404, 'NOT_FOUND');
    if (parsed.data.ownerId && parsed.data.ownerId !== FIXTURE.ids.rami)
      return fail(res, 422, 'VALIDATION');
    lead.ownerId = parsed.data.ownerId;
    lead.ownerName = parsed.data.ownerId ? 'Rami Haddad' : null;
    return ok(res, assignLeadResponse, { lead: staffRow(lead) });
  }

  const oneLead = /^GET \/leads\/([^/]+)$/.exec(route);
  if (oneLead) {
    if (!UUID.test(oneLead[1] ?? '')) return fail(res, 422, 'VALIDATION');
    const parsed = projectScope.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const denied = seeProject(parsed.data.projectId);
    if (denied) return denied;
    const lead = FIXTURE.leads.find(
      (l) => l.id === oneLead[1] && l.projectId === parsed.data.projectId,
    );
    if (!lead) return fail(res, 404, 'NOT_FOUND');
    if (session.user.role === 'client') {
      return ok(res, leadDetail, {
        view: 'client',
        lead: clientRow(lead),
        qualification: QUALIFICATION,
      });
    }
    return ok(res, leadDetail, {
      view: 'staff',
      lead: staffRow(lead),
      qualification: QUALIFICATION,
      whatsappState: 'none',
      owners: [{ id: FIXTURE.ids.rami, name: 'Rami Haddad' }],
      timeline: [
        {
          id: `b${lead.id.slice(1)}`,
          kind: 'created',
          data: { source: lead.source },
          actorKind: 'system',
          actorName: null,
          at: lead.createdAt,
        },
      ],
    });
  }

  if (route === 'GET /contacts' || route.startsWith('GET /contacts/')) {
    if (session.user.role === 'client') return fail(res, 403, 'FORBIDDEN');
  }
  if (route === 'GET /contacts') {
    const parsed = contactsQuery.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const denied = seeProject(parsed.data.projectId);
    if (denied) return denied;
    const q = parsed.data.q?.toLowerCase();
    const rows = FIXTURE.contacts
      .filter((c) => c.projectId === parsed.data.projectId)
      .map((c) => {
        const own = FIXTURE.leads
          .filter((l) => c.leadIds.includes(l.id) && l.projectId === c.projectId)
          .sort(byNewest);
        const latest = own[0];
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          phoneDisplay: c.phoneDisplay,
          email: c.email,
          leadCount: own.length,
          latestStatus: latest?.status ?? null,
          lastActivityAt: latest?.createdAt ?? null,
        };
      })
      .filter((row) => row.leadCount > 0)
      .filter((row) => {
        if (!q) return true;
        const blob = `${row.name ?? ''} ${row.email ?? ''} ${row.phone ?? ''}`.toLowerCase();
        return blob.includes(q);
      })
      .sort(
        (a, b) =>
          (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') ||
          b.id.localeCompare(a.id),
      );
    const from = (parsed.data.page - 1) * parsed.data.limit;
    return ok(res, contactsPage, {
      rows: rows.slice(from, from + parsed.data.limit),
      total: rows.length,
    });
  }
  const oneContact = /^GET \/contacts\/([^/]+)$/.exec(route);
  if (oneContact) {
    if (!UUID.test(oneContact[1] ?? '')) return fail(res, 422, 'VALIDATION');
    const parsed = projectScope.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return fail(res, 422, 'VALIDATION');
    const denied = seeProject(parsed.data.projectId);
    if (denied) return denied;
    const contact = FIXTURE.contacts.find(
      (c) => c.id === oneContact[1] && c.projectId === parsed.data.projectId,
    );
    const own = FIXTURE.leads
      .filter((l) => contact?.leadIds.includes(l.id) && l.projectId === parsed.data.projectId)
      .sort(byNewest);
    if (!contact || own.length === 0) return fail(res, 404, 'NOT_FOUND');
    return ok(res, contactProfile, {
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        phoneDisplay: contact.phoneDisplay,
        email: contact.email,
        createdAt: contact.createdAt,
      },
      leads: own.map(staffRow),
      chats: [],
      notes: [],
      statusChanges: [],
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
