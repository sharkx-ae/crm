import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import type { Me } from '../../src/contracts/auth.ts';
import type { Role, UserStatus } from '../../src/contracts/common.ts';
import * as s from '../../src/db/schema/index.ts';
import { hashPassword } from '../../src/lib/crypto/index.ts';
import { memoryTransport, setEmailTransport } from '../../src/lib/email/index.ts';
import { withSystem } from '../../src/lib/tenant/index.ts';
import { INTERNAL_TOKEN, testEnv } from './env.ts';

export const PASSWORD = 'Correct-horse-1234';

/** An app wired to a memory mail transport, so tests read codes and links the way a person would. */
export async function buildTestApp() {
  const mail = memoryTransport();
  setEmailTransport(mail);
  const app = await buildApp(testEnv());
  await app.ready();
  return { app, mail };
}

/** Headers web sends on every call: the internal token and, optionally, the session cookie value. */
export const internal = (extra: Record<string, string> = {}) => ({
  'x-internal-token': INTERNAL_TOKEN,
  ...extra,
});
export const asSession = (token: string, extra: Record<string, string> = {}) =>
  internal({ 'x-session-token': token, ...extra });

export type SeededUser = { id: string; email: string; password: string; name: string };

/** Creates a user directly (through the system role), the way the invite flow will end up. */
export async function seedUser(
  o: {
    role?: Exclude<Role, 'super_admin'>;
    status?: UserStatus;
    password?: string | null;
    projectId?: string;
    email?: string;
    locale?: 'en' | 'ar' | 'fr';
  } = {},
): Promise<SeededUser> {
  const email = o.email ?? `user-${randomUUID().slice(0, 8)}@test.local`;
  const password = o.password === undefined ? PASSWORD : o.password;
  const pwHash = password ? await hashPassword(password) : null;
  const name = 'Test User';
  const id = await withSystem(o.projectId ?? null, async (tx) => {
    const [row] = await tx
      .insert(s.users)
      .values({
        email,
        name,
        role: o.role ?? 'manager',
        status: o.status ?? 'active',
        pwHash,
        locale: o.locale ?? 'en',
      })
      .returning({ id: s.users.id });
    if (!row) throw new Error('seed user failed');
    if (o.projectId && (o.role ?? 'manager') === 'client') {
      await tx.insert(s.projectMembers).values({ projectId: o.projectId, userId: row.id });
    }
    return row.id;
  });
  return { id, email, password: password ?? '', name };
}

export type Mail = ReturnType<typeof memoryTransport>;

/** The six digits from the newest code email to `to`. */
export function lastCode(mail: Mail, to?: string): string {
  const msg = [...mail.sent].reverse().find((m) => m.template === 'code' && (!to || m.to === to));
  const code = msg?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error('no code email found');
  return code;
}

/** The raw token from the newest `template` email to `to` (the last path segment of its link). */
export function lastLinkToken(mail: Mail, template: 'invite' | 'reset', to?: string): string {
  const msg = [...mail.sent].reverse().find((m) => m.template === template && (!to || m.to === to));
  const token = msg?.text.match(/\/([A-Za-z0-9_-]{43})(?:\s|$)/)?.[1];
  if (!token) throw new Error(`no ${template} email found`);
  return token;
}

let ipCounter = 0;
/** A distinct client address per call, so rate-limit tests never share a key. */
export const freshIp = () =>
  `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;

export const post = (
  app: FastifyInstance,
  url: string,
  payload: unknown,
  headers: Record<string, string> = internal(),
) => app.inject({ method: 'POST', url, payload: payload as object, headers });

/** login → code → active. Returns the active session token and `me`. */
export async function signIn(
  app: FastifyInstance,
  mail: Mail,
  email: string,
  password: string = PASSWORD,
): Promise<{ token: string; me: Me }> {
  const login = await post(
    app,
    '/auth/login',
    { email, password },
    internal({ 'x-client-ip': freshIp() }),
  );
  if (login.statusCode !== 200) throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  const pending = login.json().sessionToken as string;
  const verify = await post(
    app,
    '/auth/code/verify',
    { code: lastCode(mail, email) },
    asSession(pending),
  );
  if (verify.statusCode !== 200)
    throw new Error(`verify failed: ${verify.statusCode} ${verify.body}`);
  return { token: verify.json().sessionToken as string, me: verify.json().me as Me };
}
