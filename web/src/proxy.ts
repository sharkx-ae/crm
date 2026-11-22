// Next.js 16 "proxy" (formerly middleware): per-request CSP nonce, the session-cookie guard and locale routing for
// every page; /api is excluded. The guard only checks that a cookie exists (cheap, no api call): the page itself
// resolves it with the api (requireSession), which is the real check.
import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { getWebEnv } from './lib/env.ts';
import { routing } from './lib/i18n/routing.ts';
import { buildCsp, classifyPath, sessionCookieName } from './lib/security.ts';

const intl = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const env = getWebEnv();
  const { locale, kind } = classifyPath(request.nextUrl.pathname, routing.locales);

  if (kind === 'protected' && !request.cookies.has(sessionCookieName(env.APP_ENV))) {
    const target = request.nextUrl.clone();
    target.pathname = `/${locale ?? routing.defaultLocale}/login`;
    target.search = '';
    return NextResponse.redirect(target);
  }

  // Next reads the nonce from the CSP on the REQUEST and stamps its own scripts with it.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);

  const response = intl(new NextRequest(request, { headers }));
  response.headers.set('content-security-policy', csp);
  // Auth pages carry tokens in their path: never send them on as a referrer.
  response.headers.set(
    'referrer-policy',
    kind === 'auth' ? 'no-referrer' : 'strict-origin-when-cross-origin',
  );
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*..*).*)'],
};
