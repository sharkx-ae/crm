// `pnpm auth:seed-admin --email a@b.co --name "Alex"`: creates THE super admin (status `invited`) and sends the invite.
// There is exactly one (unique index users_one_super_admin), so a second run is refused. On production it runs once as a
// Railway one-off command in the api service, never from a laptop (same rule as db:migrate).
// The link is printed only when APP_ENV=local (the mail goes to api/.mail there); elsewhere it only travels by email.
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { email as emailSchema } from '../contracts/common.ts';
import { sendEmail } from '../lib/email/index.ts';
import { getApiEnv } from '../lib/env.ts';
import { AppError } from '../lib/errors/index.ts';
import { withSystem } from '../lib/tenant/index.ts';
import { audit } from '../modules/audit/index.ts';
import { users } from '../modules/auth/schema.ts';
import { INVITE_TTL_MS, issueToken } from '../modules/auth/tokens.ts';

export async function seedSuperAdmin(input: {
  email: string;
  name: string;
  appUrl: string;
  now?: Date;
}): Promise<{ userId: string; link: string }> {
  const email = emailSchema.parse(input.email);
  const name = input.name.trim();
  if (!name) throw new Error('--name is required');
  const now = input.now ?? new Date();

  const out = await withSystem(null, async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'super_admin'));
    if (existing) throw new AppError('CONFLICT'); // the unique index is the backstop for a race
    const [user] = await tx
      .insert(users)
      .values({ email, name, role: 'super_admin', status: 'invited' })
      .returning({ id: users.id, locale: users.locale });
    if (!user) throw new Error('user insert returned no row');
    const token = await issueToken(tx, user.id, 'invite', INVITE_TTL_MS, now);
    await audit(tx, {
      actor: { kind: 'system' },
      action: 'user.invited',
      entity: 'user',
      entityId: user.id,
      meta: { role: 'super_admin', reissued: false, via: 'seed' },
    });
    return { user, token };
  });

  const link = `${input.appUrl.replace(/\/$/, '')}/${out.user.locale}/accept-invite/${out.token}`;
  await sendEmail({
    to: email,
    template: 'invite',
    locale: out.user.locale,
    data: {
      name,
      inviterName: null,
      projectName: null,
      link,
      expiresInHours: INVITE_TTL_MS / 3_600_000,
    },
  });
  return { userId: out.user.id, link };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  const env = getApiEnv();
  try {
    if (!values.email || !values.name)
      throw new Error('usage: pnpm auth:seed-admin --email <email> --name <name>');
    const { link } = await seedSuperAdmin({
      email: values.email,
      name: values.name,
      appUrl: env.APP_URL,
    });
    console.log('Super admin created and invited. The invite link was emailed.');
    if (env.APP_ENV === 'local') console.log(`Local only, the invite link: ${link}`);
  } catch (err) {
    const refused = err instanceof AppError && err.code === 'CONFLICT';
    console.error(
      refused
        ? 'A super admin already exists. Nothing was changed.'
        : err instanceof Error
          ? err.message
          : 'failed',
    );
    process.exitCode = 1;
  } finally {
    const { getPool } = await import('./index.ts');
    await getPool().end();
  }
}
