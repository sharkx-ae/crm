import { isIP } from 'node:net';
import { ApiError } from './api/error.ts';
import { getWebEnv } from './env.ts';

// Pure helpers for the BFF: client address, CSP, same-origin check, cookie name. No Next imports, so they unit-test.

/** `__Host-` needs HTTPS (Secure, Path=/, no Domain); local development runs on plain http. */
export const sessionCookieName = (appEnv: string): string =>
  appEnv === 'local' ? 'sharkx_session' : '__Host-sharkx_session';

type HeaderReader = { get(name: string): string | null };

/**
 * The visitor's address, forwarded to the api for per-IP rate limits. The Railway edge is the only proxy in front
 * of us, so the LAST valid `x-forwarded-for` entry is the one it observed; earlier entries are whatever the client
 * sent and must not be trusted (a rotating first entry would sidestep the login limit).
 */
export function clientIp(headers: HeaderReader): string | undefined {
  const hops = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter((h) => isIP(h) !== 0);
  const last = hops[hops.length - 1];
  if (last) return last;
  const real = headers.get('x-real-ip')?.trim();
  return real && isIP(real) !== 0 ? real : undefined;
}

// What the Facebook JS SDK (WhatsApp Embedded Signup) needs, and nothing more. Applied ONLY on the integrations page
// (F3a plan §7.2); every other page keeps the strict policy. The signup itself runs in a popup, which our CSP does not
// restrict. Trim this list to what the browser console actually reports (plan T8).
const META_FRAMES = [
  'https://www.facebook.com',
  'https://web.facebook.com',
  'https://staticxx.facebook.com',
];

/**
 * Per-request CSP (plan §7). Dev adds 'unsafe-eval' for React's debugging features. `opts.meta` adds the Facebook SDK
 * hosts (integrations page only). With 'strict-dynamic' the host in script-src is ignored by modern browsers (the SDK
 * is loaded by a nonce-carrying script and trusts what that script injects); it is kept for CSP2-only browsers.
 */
export function buildCsp(nonce: string, dev: boolean, opts: { meta?: boolean } = {}): string {
  const meta = opts.meta === true;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${meta ? ' https://connect.facebook.net' : ''}${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${meta ? ' https://*.facebook.com https://*.fbcdn.net' : ''}`,
    "font-src 'self'",
    `connect-src 'self'${meta ? ' https://*.facebook.com https://graph.facebook.com' : ''}`,
    ...(meta ? [`frame-src ${META_FRAMES.join(' ')}`] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * True only for `/<locale>/p/<projectId>/integrations` (a trailing slash is fine, a sub path is not): the one page that
 * loads the Facebook SDK. Sub pages added later (F14b) must be added here on purpose.
 */
export function isMetaPath(pathname: string, locales: readonly string[]): boolean {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== undefined && locales.includes(parts[0])) parts.shift();
  return parts.length === 3 && parts[0] === 'p' && parts[1] !== '' && parts[2] === 'integrations';
}

/**
 * CSRF guard for cookie-authenticated route handlers (Server Actions have Next's own Origin check).
 * Browsers send `Sec-Fetch-Site`; older ones fall back to comparing `Origin` with the app's own.
 */
export function isSameOrigin(request: { headers: HeaderReader }, appUrl: string): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin' || site === 'none';
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(appUrl).origin;
}

/** Throws FORBIDDEN (403) for a cross-site request; the caller's wrapper maps ApiError like any other. */
export function assertSameOrigin(
  request: { headers: HeaderReader },
  appUrl: string = getWebEnv().APP_URL,
): void {
  if (!isSameOrigin(request, appUrl)) throw new ApiError('FORBIDDEN', 403);
}

/** Pages reachable without a session. Everything else under a locale needs the session cookie (the proxy guard). */
const PUBLIC_SEGMENTS = new Set(['login', 'code', 'reset', 'accept-invite']);

/**
 * Splits `/en/login` into its locale and what kind of page it is. `auth` pages carry tokens in their path, so they
 * get `Referrer-Policy: no-referrer`; `protected` ones redirect to /login when there is no session cookie.
 */
export function classifyPath(
  pathname: string,
  locales: readonly string[],
): { locale: string | null; kind: 'auth' | 'protected' } {
  const [first = '', second = ''] = pathname.split('/').filter(Boolean);
  const hasLocale = locales.includes(first);
  const segment = hasLocale ? second : first;
  return {
    locale: hasLocale ? first : null,
    kind: PUBLIC_SEGMENTS.has(segment) ? 'auth' : 'protected',
  };
}
