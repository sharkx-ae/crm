import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { cache } from 'react';
import { type Me, meResponse } from '../contracts/auth.ts';
import { apiCall } from './api/client.ts';
import { ApiError } from './api/error.ts';
import { getWebEnv } from './env.ts';
import { sessionCookieName } from './security.ts';

// The browser holds one opaque cookie; everything about the user comes from the api (GET /me).
// Cookies are set and cleared only here, from Server Actions, never by the api.

export const getSessionCookieName = (): string => sessionCookieName(getWebEnv().APP_ENV);

/**
 * Staff land on the clients list, a client user on its own overview (F1c landing rule).
 * Pure, so web and tests share it.
 */
export function landingPath(me: Pick<Me, 'role' | 'projectIds'>, locale: string): string {
  if (me.role === 'client') {
    const projectId = me.projectIds[0];
    return projectId ? `/${locale}/p/${projectId}/overview` : `/${locale}/login`;
  }
  return `/${locale}/clients`;
}

/**
 * The signed-in user for THIS request, or null. React `cache()` only dedupes inside one request;
 * it is not a data cache, so nothing about a user is kept between requests.
 */
export const getSession = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(getSessionCookieName())?.value;
  if (!token) return null;
  try {
    return await apiCall(meResponse, '/me');
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') return null; // expired, revoked, disabled
    throw err;
  }
});

/** For pages and layouts: sends visitors to `/login`, or to `/code` when only the password step is done. */
export async function requireSession(opts: { allowPending?: boolean } = {}): Promise<Me> {
  const me = await getSession();
  const locale = await getLocale();
  if (!me) redirect(`/${locale}/login`);
  if (me.stage === 'pending_2fa' && !opts.allowPending) redirect(`/${locale}/code`);
  return me;
}

/** Max-Age follows the api's expiry: 15 minutes while pending, then the remaining absolute lifetime. */
export async function setSessionCookie(token: string, expiresAt: string | Date): Promise<void> {
  const maxAge = Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  (await cookies()).set(getSessionCookieName(), token, {
    httpOnly: true,
    secure: getWebEnv().APP_ENV !== 'local',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(getSessionCookieName());
}
