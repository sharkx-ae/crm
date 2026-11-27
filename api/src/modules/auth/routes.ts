import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  acceptInviteRequest,
  activeSessionResponse,
  codeSentResponse,
  inviteInfoResponse,
  inviteRequest,
  listUsersQuery,
  listUsersResponse,
  loginRequest,
  loginResponse,
  meResponse,
  okResponse,
  pendingSessionResponse,
  resetConfirmRequest,
  resetRequest,
  setUserStatusRequest,
  tokenRequest,
  updateMeRequest,
  userSummary,
  verifyCodeRequest,
} from '../../contracts/auth.ts';
import type { ApiEnv } from '../../lib/env.ts';
import { defineRoute } from '../../lib/http/route.ts';
import {
  confirmReset,
  getMe,
  login,
  logout,
  requestReset,
  resendCode,
  updateMe,
  verifyCode,
} from './service.ts';
import { acceptInvite, inspectInvite, inviteUser, listUsers, setUserStatus } from './users.ts';

// POST bodies with nothing to say still send `{}`; accepting a missing body too keeps curl and tests simple.
const emptyBody = z.object({}).default({});

// Plan §5. web forwards the cookie value as x-session-token; the api never sets cookies.
export const authRoutes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/login',
      access: 'anon',
      body: loginRequest,
      response: loginResponse,
      audit: 'one',
    },
    async ({ body, ip, req }) => {
      const old = req.headers['x-session-token'];
      const device = req.headers['x-device-token'];
      return login(body, {
        ip,
        forwardedSessionToken: typeof old === 'string' ? old : undefined,
        forwardedDeviceToken: typeof device === 'string' ? device : undefined,
      });
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/code/verify',
      access: 'pending',
      body: verifyCodeRequest,
      response: activeSessionResponse,
      audit: 'one',
    },
    async ({ body, session }) => verifyCode(session, body.code, body.trustDevice),
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/code/send',
      access: 'pending',
      body: emptyBody,
      response: codeSentResponse,
      audit: 'none',
    },
    async ({ session }) => resendCode(session),
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/logout',
      access: 'pending',
      body: emptyBody,
      response: okResponse,
      audit: 'one',
    },
    async ({ session }) => {
      await logout(session);
      return { ok: true as const };
    },
  );

  // Pending sessions can call this too, so /code can show the masked email.
  defineRoute(
    app,
    { method: 'GET', url: '/me', access: 'pending', response: meResponse },
    async ({ session }) => getMe(session),
  );

  defineRoute(
    app,
    {
      method: 'PATCH',
      url: '/me',
      access: 'session',
      action: 'self',
      body: updateMeRequest,
      response: meResponse,
      audit: 'one',
    },
    async ({ body, session }) => updateMe(session, body),
  );

  // Always {ok:true}: the same answer for every email. The mail goes out after the reply is sent.
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/reset/request',
      access: 'anon',
      body: resetRequest,
      response: okResponse,
      audit: 'none', // an unknown email mutates nothing; a known one writes auth.reset_requested
    },
    async ({ body, req }) => {
      const { deliver } = await requestReset(body, { appUrl: env.APP_URL });
      if (deliver) {
        // Not awaited. A failure is logged by name only (F1d routes it to error_log and the alert inbox).
        void deliver().catch((err: unknown) =>
          req.log.error(
            { errorName: err instanceof Error ? err.name : 'unknown' },
            'reset email failed',
          ),
        );
      }
      return { ok: true as const };
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/reset/confirm',
      access: 'anon',
      body: resetConfirmRequest,
      response: okResponse,
      audit: 'one',
    },
    async ({ body, ip }) => {
      await confirmReset(body, new Date(), ip);
      return { ok: true as const };
    },
  );

  // POST, not GET /auth/invite/:token, so a raw token never appears in an api URL (request logs, proxies).
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/invite/inspect',
      access: 'anon',
      body: tokenRequest,
      response: inviteInfoResponse,
      audit: 'none',
    },
    async ({ body }) => inspectInvite(body.token),
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/invite/accept',
      access: 'anon',
      body: acceptInviteRequest,
      response: pendingSessionResponse,
      audit: 'one',
    },
    async ({ body, ip }) => acceptInvite(body, new Date(), ip),
  );

  // A manager is invited with user.manage (super admin only); a client user with clientuser.manage on its project.
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/users/invite',
      access: 'session',
      body: inviteRequest,
      action: ({ body }) =>
        body.kind === 'manager'
          ? { action: 'user.manage' }
          : { action: 'clientuser.manage', projectId: body.projectId },
      response: userSummary,
      audit: 'one',
    },
    async ({ body, session }) => inviteUser(session, body, { appUrl: env.APP_URL }),
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/users',
      access: 'session',
      query: listUsersQuery,
      action: ({ query }) =>
        query.kind === 'manager'
          ? { action: 'user.manage' }
          : { action: 'clientuser.manage', projectId: query.projectId },
      response: listUsersResponse,
    },
    async ({ query, session }) => ({ users: await listUsers(session, query) }),
  );

  // The route gate is "staff"; the service then needs user.manage for a manager target, clientuser.manage for a client's.
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/users/:id/status',
      access: 'session',
      params: z.object({ id: z.uuid() }),
      body: setUserStatusRequest,
      action: 'clientuser.manage',
      response: userSummary,
      audit: 'one',
    },
    async ({ params, body, session }) => setUserStatus(session, params.id, body.status),
  );
};
