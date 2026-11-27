import { and, eq } from 'drizzle-orm';
import type {
  InviteInfoResponse,
  InviteRequest,
  ListUsersQuery,
  PendingSessionResponse,
  UserSummary,
} from '../../contracts/auth.ts';
import type { Role, UserStatus } from '../../contracts/common.ts';
import { type Action, can } from '../../contracts/session.ts';
import { sendEmail } from '../../lib/email/index.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { hit, rateKey, rules } from '../../lib/rate-limit/index.ts';
import { type Tx, withSystem } from '../../lib/tenant/index.ts';
import { projectMembers } from '../../lib/tenant/schema.ts';
import { audit } from '../audit/index.ts';
import { projects } from '../projects/schema.ts';
import { actorOf, maskEmail } from './actor.ts';
import { revokeAllDevices } from './devices.ts';
import { hashNewPassword } from './password.ts';
import { users } from './schema.ts';
import { allowPasswordSet } from './service.ts';
import { createSession, revokeAllSessions } from './sessions.ts';
import {
  CODE_TTL_MS,
  consumeToken,
  INVITE_TTL_MS,
  issueCode,
  issueToken,
  peekToken,
  revokeLiveTokens,
} from './tokens.ts';

// F1c S4 (plan §6.2, §6.5). A role is fixed by the invite and never changes. Every function re-checks can():
// the route does too, but F2b calls inviteUserTx from its own transaction.

type UserRow = typeof users.$inferSelect;

const summary = (u: UserRow, projectId: string | null): UserSummary => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  projectId,
  createdAt: u.createdAt.toISOString(),
});

/** Which action an invite or a status change needs. Clients are never allowed: both actions are staff-only. */
const actionFor = (role: Role, projectId: string | null): { action: Action; projectId?: string } =>
  role === 'client' && projectId
    ? { action: 'clientuser.manage', projectId }
    : { action: 'user.manage' };

function assertCan(session: ResolvedSession, want: { action: Action; projectId?: string }): void {
  if (can(session, want.action, want.projectId)) return;
  const foreign =
    session.role === 'client' &&
    want.projectId !== undefined &&
    !session.projectIds.includes(want.projectId);
  throw new AppError(foreign ? 'NOT_FOUND' : 'FORBIDDEN');
}

const inviteLink = (appUrl: string, locale: string, token: string) =>
  `${appUrl.replace(/\/$/, '')}/${locale}/accept-invite/${token}`;

/**
 * The invite itself, inside the caller's transaction (a system transaction scoped to the project for a client
 * invite, to nothing for a manager). Returns `deliver`: call it AFTER the transaction commits, so a rollback
 * never sends an email.
 */
export async function inviteUserTx(
  tx: Tx,
  session: ResolvedSession,
  input: InviteRequest,
  o: { appUrl: string; now?: Date },
): Promise<{ user: UserSummary; deliver: () => Promise<void> }> {
  const now = o.now ?? new Date();
  const projectId = input.kind === 'client' ? input.projectId : null;
  assertCan(session, actionFor(input.kind === 'client' ? 'client' : 'manager', projectId));

  let projectName: string | null = null;
  if (projectId) {
    const [p] = await tx
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!p) throw new AppError('NOT_FOUND');
    projectName = p.name;
  }

  const role: Role = input.kind === 'client' ? 'client' : 'manager';
  const [existing] = await tx.select().from(users).where(eq(users.email, input.email));

  let user: UserRow;
  let reissued = false;
  if (existing) {
    // An account that is active or disabled is never touched. An invite that is still open is reissued only for
    // the same role and project, otherwise a lost email would strand the person and a changed role could sneak in.
    const [member] = await tx
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, existing.id));
    const same = existing.role === role && (member?.projectId ?? null) === projectId;
    if (existing.status !== 'invited' || !same) throw new AppError('CONFLICT');
    user = existing;
    reissued = true;
  } else {
    const [created] = await tx
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        role,
        status: 'invited',
        invitedBy: session.userId,
      })
      .returning();
    if (!created) throw new Error('user insert returned no row');
    user = created;
    if (projectId) await tx.insert(projectMembers).values({ projectId, userId: user.id });
  }

  const token = await issueToken(tx, user.id, 'invite', INVITE_TTL_MS, now);
  await audit(tx, {
    actor: actorOf(session),
    action: 'user.invited',
    projectId,
    entity: 'user',
    entityId: user.id,
    meta: { role, projectId, reissued },
  });

  return {
    user: summary(user, projectId),
    deliver: () =>
      sendEmail({
        to: user.email,
        template: 'invite',
        locale: user.locale,
        data: {
          name: user.name,
          inviterName: session.name,
          projectName,
          link: inviteLink(o.appUrl, user.locale, token),
          expiresInHours: INVITE_TTL_MS / 3_600_000,
        },
      }),
  };
}

export async function inviteUser(
  session: ResolvedSession,
  input: InviteRequest,
  o: { appUrl: string; now?: Date },
): Promise<UserSummary> {
  const { user, deliver } = await withSystem(
    input.kind === 'client' ? input.projectId : null,
    (tx) => inviteUserTx(tx, session, input, o),
  );
  await deliver(); // after commit; a failed send is a 502 and inviting again reissues the link
  return user;
}

export async function listUsers(
  session: ResolvedSession,
  query: ListUsersQuery,
): Promise<UserSummary[]> {
  const projectId = query.kind === 'client' ? query.projectId : null;
  assertCan(session, actionFor(query.kind === 'client' ? 'client' : 'manager', projectId));

  return withSystem(projectId, async (tx) => {
    if (query.kind === 'manager') {
      const rows = await tx
        .select()
        .from(users)
        .where(eq(users.role, 'manager'))
        .orderBy(users.createdAt);
      return rows.map((u) => summary(u, null));
    }
    const rows = await tx
      .select({ user: users })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(and(eq(projectMembers.projectId, query.projectId), eq(users.role, 'client')))
      .orderBy(users.createdAt);
    return rows.map((r) => summary(r.user, query.projectId));
  });
}

/** Enabling returns the person to `active` when they already have a password, otherwise to `invited`. */
export async function setUserStatus(
  session: ResolvedSession,
  userId: string,
  to: 'active' | 'disabled',
  now: Date = new Date(),
): Promise<UserSummary> {
  const target = await withSystem(null, async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) return null;
    const [m] = await tx
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    return { user: u, projectId: m?.projectId ?? null };
  });
  if (!target) throw new AppError('NOT_FOUND');
  const { user, projectId } = target;

  // Authorisation first, so a caller who may not touch this person learns nothing else about them.
  assertCan(session, actionFor(user.role, projectId));
  if (user.id === session.userId || user.role === 'super_admin') throw new AppError('CONFLICT');

  const next: UserStatus = to === 'disabled' ? 'disabled' : user.pwHash ? 'active' : 'invited';
  if (user.status === next || (to === 'active' && user.status === 'invited')) {
    throw new AppError('CONFLICT');
  }

  return withSystem(projectId, async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ status: next })
      .where(eq(users.id, user.id))
      .returning();
    if (!updated) throw new AppError('NOT_FOUND');
    let devicesRevoked = 0;
    if (next === 'disabled') {
      await revokeAllSessions(tx, user.id);
      devicesRevoked = await revokeAllDevices(tx, user.id);
      await revokeLiveTokens(tx, user.id, now);
    }
    await audit(tx, {
      actor: actorOf(session),
      action: 'user.status_changed',
      projectId,
      entity: 'user',
      entityId: user.id,
      meta: { from: user.status, to: next, ...(devicesRevoked > 0 && { devicesRevoked }) },
    });
    return summary(updated, projectId);
  });
}

/** Who invited this person and for which client, for the accept screen. Nothing is consumed. */
export async function inspectInvite(
  rawToken: string,
  now: Date = new Date(),
): Promise<InviteInfoResponse> {
  const info = await withSystem(null, async (tx) => {
    const live = await peekToken(tx, rawToken, 'invite', now);
    if (!live) return null;
    const [u] = await tx.select().from(users).where(eq(users.id, live.userId));
    if (!u || u.status !== 'invited') return null;
    const inviter = u.invitedBy
      ? (await tx.select({ name: users.name }).from(users).where(eq(users.id, u.invitedBy)))[0]
      : undefined;
    const [m] = await tx
      .select({ name: projects.name })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.userId, u.id));
    return { user: u, inviterName: inviter?.name ?? null, projectName: m?.name ?? null };
  });
  if (!info) throw new AppError('NOT_FOUND'); // used, expired or forged: one answer
  return {
    // The seeded super admin also arrives here; the screen shows only the name and masked email.
    kind: info.user.role === 'client' ? 'client' : 'manager',
    name: info.user.name,
    maskedEmail: maskEmail(info.user.email),
    inviterName: info.inviterName,
    projectName: info.projectName,
  };
}

/** Sets the password, activates the account and starts the sign-in at the code step. */
export async function acceptInvite(
  input: { token: string; password: string },
  now: Date = new Date(),
  ip?: string,
): Promise<PendingSessionResponse> {
  await allowPasswordSet(input.token, 'invite', now, ip);
  const pwHash = await hashNewPassword(input.password); // after the token is live, outside the transaction

  const out = await withSystem(null, async (tx) => {
    const consumed = await consumeToken(tx, input.token, 'invite', now);
    if (!consumed) throw new AppError('NOT_FOUND');
    const [u] = await tx.select().from(users).where(eq(users.id, consumed.userId));
    if (!u || u.status !== 'invited') throw new AppError('NOT_FOUND');

    const limit = await hit(tx, rateKey('code_send', u.id), rules.codeSend, now);
    if (!limit.allowed) throw new AppError('RATE_LIMITED', { retryAfterSec: limit.retryAfterSec });

    await tx.update(users).set({ pwHash, status: 'active' }).where(eq(users.id, u.id));
    const session = await createSession(tx, u.id, 'pending_2fa', now);
    const { code } = await issueCode(tx, u.id, session.id, now);
    await audit(tx, {
      actor: actorOf({ userId: u.id, role: u.role }),
      action: 'user.invite_accepted',
      entity: 'user',
      entityId: u.id,
      meta: { role: u.role },
    });
    return { user: u, session, code };
  });

  await sendEmail({
    to: out.user.email,
    template: 'code',
    locale: out.user.locale,
    data: { code: out.code, expiresInMinutes: CODE_TTL_MS / 60_000 },
  });
  return {
    stage: 'pending_2fa',
    sessionToken: out.session.token,
    expiresAt: out.session.expiresAt.toISOString(),
    maskedEmail: maskEmail(out.user.email),
  };
}
