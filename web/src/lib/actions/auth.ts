'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  acceptInviteRequest,
  activeSessionResponse,
  codeSentResponse,
  loginRequest,
  type Me,
  meResponse,
  okResponse,
  pendingSessionResponse,
  resetConfirmRequest,
  resetRequest,
  updateMeRequest,
  verifyCodeRequest,
} from '../../contracts/auth.ts';
import { defineAction } from '../action.ts';
import { apiCall } from '../api/client.ts';
import { ApiError } from '../api/error.ts';
import { clearSessionCookie, landingPath, setSessionCookie } from '../session.ts';

// Every export here is a defineAction(...) (tests/structure: src/lib/actions/actions.test.ts).
// Cookies are set only in these actions; the api never sets one.

const empty = z.object({});

/** Password step. On success the browser holds a 15-minute pending session and moves to the code screen. */
export const login = defineAction(
  { input: loginRequest, auth: 'none' },
  async ({ input, locale }) => {
    const res = await apiCall(pendingSessionResponse, '/auth/login', {
      method: 'POST',
      body: input,
    });
    await setSessionCookie(res.sessionToken, res.expiresAt);
    redirect(`/${locale}/code`);
  },
);

/** Code step. The api swaps the pending token for an active one; the cookie is replaced and the person lands. */
export const verifyCode = defineAction(
  { input: verifyCodeRequest, auth: 'pending' },
  async ({ input, locale }) => {
    const res = await apiCall(activeSessionResponse, '/auth/code/verify', {
      method: 'POST',
      body: input,
    });
    await setSessionCookie(res.sessionToken, res.expiresAt);
    redirect(landingPath(res.me, locale));
  },
);

export const resendCode = defineAction({ input: empty, auth: 'pending' }, async () =>
  apiCall(codeSentResponse, '/auth/code/send', { method: 'POST', body: {} }),
);

/** Works from the code step too. The cookie is cleared even when the api already forgot the session. */
export const logout = defineAction({ input: empty, auth: 'pending' }, async ({ locale }) => {
  try {
    await apiCall(okResponse, '/auth/logout', { method: 'POST', body: {} });
  } catch (err) {
    if (!(err instanceof ApiError && err.code === 'UNAUTHENTICATED')) throw err;
  }
  await clearSessionCookie();
  redirect(`/${locale}/login`);
});

/** The language switch (F2a); the caller navigates to the new locale path afterwards. */
export const updateMe = defineAction(
  { input: updateMeRequest, auth: 'session' },
  async ({ input }): Promise<Me> => apiCall(meResponse, '/me', { method: 'PATCH', body: input }),
);

/** Sets the password from an invite link, then continues at the code step like a normal sign-in. */
export const acceptInvite = defineAction(
  { input: acceptInviteRequest, auth: 'none' },
  async ({ input, locale }) => {
    const res = await apiCall(pendingSessionResponse, '/auth/invite/accept', {
      method: 'POST',
      body: input,
      session: 'none',
    });
    await setSessionCookie(res.sessionToken, res.expiresAt);
    redirect(`/${locale}/code`);
  },
);

/** Always succeeds from the person's point of view: the api answers the same for every email. */
export const requestReset = defineAction({ input: resetRequest, auth: 'none' }, async ({ input }) =>
  apiCall(okResponse, '/auth/reset/request', { method: 'POST', body: input, session: 'none' }),
);

/** Single-use link. A used, expired or forged one shows the expired page; success goes to sign-in. */
export const resetPassword = defineAction(
  { input: resetConfirmRequest, auth: 'none' },
  async ({ input, locale }) => {
    try {
      await apiCall(okResponse, '/auth/reset/confirm', {
        method: 'POST',
        body: input,
        session: 'none',
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        redirect(`/${locale}/reset/${input.token}?expired=1`);
      }
      throw err;
    }
    await clearSessionCookie(); // every session was revoked, this browser's included
    redirect(`/${locale}/login?reset=1`);
  },
);
