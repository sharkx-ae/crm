import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  activeSessionResponse,
  codeSentResponse,
  loginRequest,
  meResponse,
  okResponse,
  pendingSessionResponse,
  updateMeRequest,
  verifyCodeRequest,
} from '../../contracts/auth.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { getMe, login, logout, resendCode, updateMe, verifyCode } from './service.ts';

// POST bodies with nothing to say still send `{}`; accepting a missing body too keeps curl and tests simple.
const emptyBody = z.object({}).default({});

// Plan §5. web forwards the cookie value as x-session-token; the api never sets cookies.
export const authRoutes: FastifyPluginAsync = async (app) => {
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/auth/login',
      access: 'anon',
      body: loginRequest,
      response: pendingSessionResponse,
      audit: 'one',
    },
    async ({ body, ip, req }) => {
      const old = req.headers['x-session-token'];
      return login(body, { ip, forwardedSessionToken: typeof old === 'string' ? old : undefined });
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
    async ({ body, session }) => verifyCode(session, body.code),
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
};
