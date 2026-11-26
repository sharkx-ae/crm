// The ONLY api module that reads process.env (Biome `noProcessEnv` enforces this).
// Zod-validated; a missing or invalid variable stops the process with a readable message.
// Adding a variable: update api/.env.example, the schema below, and Railway (docs/ENVIRONMENTS.md).
import { z } from 'zod';
import { password } from '../contracts/common.ts';
import { type Keyring, parseKeyring } from './crypto/index.ts';

const shared = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
});

// Email is optional locally, required on staging/production (invites, codes, alerts).
const email = z.object({
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  ALERT_EMAIL: z.email().optional(),
});

function requireEmailOutsideLocal(
  v: { APP_ENV: string } & z.infer<typeof email>,
  ctx: z.RefinementCtx,
): void {
  if (v.APP_ENV === 'local') return;
  for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'ALERT_EMAIL'] as const) {
    if (!v[key])
      ctx.addIssue({ code: 'custom', path: [key], message: `required when APP_ENV=${v.APP_ENV}` });
  }
}

// Token sealing keys (F3a plan §4.1): `<keyId>:<base64 of 32 bytes>`. Required whenever Meta is configured and on every
// environment but local; `..._OLD` is a comma list of retired keys, kept to decrypt rows sealed before a rotation.
const crypto = z.object({
  TOKEN_ENC_KEY: z.string().min(1).optional(),
  TOKEN_ENC_KEYS_OLD: z.string().min(1).optional(),
});

// Meta (F3a plan §4.2). The group is all-or-none and optional on every environment: production may deploy before
// App Review, and then the webhook answers 404 and the connect card shows "Awaiting access". The worker needs the
// app id/secret and the Graph version, not the webhook verify token (only the api answers the handshake).
const metaGroup = z.object({
  META_APP_ID: z
    .string()
    .regex(/^\d{1,32}$/)
    .optional(),
  META_APP_SECRET: z.string().min(10).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(32).optional(),
});
const metaCommon = z.object({
  META_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.0$/)
    .default('v27.0'),
  // `true` until Meta business verification and access verification are done (plan §6.5); anything else is off.
  META_ONBOARDING_LIMITED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

function requireAllOrNone(keys: readonly string[]) {
  return (v: Record<string, unknown>, ctx: z.RefinementCtx): void => {
    const set = keys.filter((k) => v[k] !== undefined);
    if (set.length === 0 || set.length === keys.length) return;
    for (const k of keys) {
      if (v[k] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [k],
          message: `required when ${set.join(', ')} is set`,
        });
      }
    }
  };
}

function requireKeyring(
  v: {
    APP_ENV: string;
    META_APP_SECRET?: string | undefined;
    TOKEN_ENC_KEY?: string | undefined;
    TOKEN_ENC_KEYS_OLD?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (!v.TOKEN_ENC_KEY) {
    if (v.APP_ENV !== 'local' || v.META_APP_SECRET) {
      const why = v.META_APP_SECRET ? 'META_APP_SECRET is set' : `APP_ENV=${v.APP_ENV}`;
      ctx.addIssue({ code: 'custom', path: ['TOKEN_ENC_KEY'], message: `required when ${why}` });
    }
    return;
  }
  try {
    parseKeyring(v.TOKEN_ENC_KEY, v.TOKEN_ENC_KEYS_OLD);
  } catch (e) {
    // The message names the rule, never a key.
    ctx.addIssue({
      code: 'custom',
      path: ['TOKEN_ENC_KEY'],
      message: `${(e as Error).message} (format <id>:<base64 32 bytes>; ids unique across TOKEN_ENC_KEYS_OLD)`,
    });
  }
}

const apiMetaKeys = ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'] as const;
const workerMetaKeys = ['META_APP_ID', 'META_APP_SECRET'] as const;

export const apiSchema = shared
  .extend(email.shape)
  .extend(crypto.shape)
  .extend(metaGroup.shape)
  .extend(metaCommon.shape)
  .extend({
    PORT: z.coerce.number().int().positive().default(4000),
    APP_URL: z.url(), // web app URL, used in email links and CORS-free redirects
    // Shared secret between web and api: every non-public route requires it (x-internal-token).
    INTERNAL_API_TOKEN: z.string().min(32),
  })
  .superRefine(requireEmailOutsideLocal)
  .superRefine(requireAllOrNone(apiMetaKeys))
  .superRefine(requireKeyring);

export const workerSchema = shared
  .extend(email.shape)
  .extend(crypto.shape)
  .extend(metaGroup.omit({ META_WEBHOOK_VERIFY_TOKEN: true }).shape)
  .extend({ META_GRAPH_VERSION: metaCommon.shape.META_GRAPH_VERSION })
  .superRefine(requireEmailOutsideLocal)
  .superRefine(requireAllOrNone(workerMetaKeys))
  .superRefine(requireKeyring);

export const dbSchema = shared.pick({ DATABASE_URL: true });

// What the Meta integration and token sealing need; the api and the worker both read these variables.
export const integrationEnvSchema = shared
  .pick({ APP_ENV: true })
  .extend(crypto.shape)
  .extend(metaGroup.shape)
  .extend(metaCommon.shape)
  .superRefine(requireAllOrNone(workerMetaKeys))
  .superRefine(requireKeyring);

// What lib/email needs; the api and the worker both send mail.
export const emailEnvSchema = shared
  .pick({ APP_ENV: true })
  .extend(email.shape)
  .superRefine(requireEmailOutsideLocal);

// `pnpm db:seed` only (F4a S5): the shared dev password of every seeded user. Same rules as a real password.
// Local/staging only; never set in production, and the api and worker never read it.
export const seedSchema = shared.pick({ APP_ENV: true }).extend({ SEED_PASSWORD: password });

export const testSchema = z.object({
  TEST_DATABASE_URL: z
    .url({ protocol: /^postgres(ql)?$/ })
    .refine((u) => new URL(u).pathname.endsWith('_test'), 'database name must end with _test'),
});

export type ApiEnv = z.infer<typeof apiSchema>;
export type WorkerEnv = z.infer<typeof workerSchema>;

/** Pure parser (used by tests). Throws one readable error listing every bad variable. */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined>,
  label: string,
): z.infer<S> {
  // `KEY=` in an env file means "not set".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  );
  const res = schema.safeParse(cleaned);
  if (res.success) return res.data;
  const lines = res.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(
    `Invalid ${label} environment:\n${lines.join('\n')}\nSee api/.env.example and docs/ENVIRONMENTS.md.`,
  );
}

const cache = new Map<string, unknown>();
function cached<T>(key: string, load: () => T): T {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key) as T;
}

export const getApiEnv = (): ApiEnv => cached('api', () => parseEnv(apiSchema, process.env, 'api'));
export const getWorkerEnv = (): WorkerEnv =>
  cached('worker', () => parseEnv(workerSchema, process.env, 'worker'));
export const getDbEnv = (): z.infer<typeof dbSchema> =>
  cached('db', () => parseEnv(dbSchema, process.env, 'database'));
export const getEmailEnv = (): z.infer<typeof emailEnvSchema> =>
  cached('email', () => parseEnv(emailEnvSchema, process.env, 'email'));

/** Meta settings, or null when the feature is off (webhook 404, connect not ready). Both apps use the same shape. */
export type MetaEnv = {
  appId: string;
  appSecret: string;
  graphVersion: string;
  /** api only; the worker never answers the handshake. */
  webhookVerifyToken?: string;
  limited: boolean;
};
export function metaEnvOf(
  e: Pick<ApiEnv, 'META_APP_ID' | 'META_APP_SECRET' | 'META_GRAPH_VERSION'> &
    Partial<Pick<ApiEnv, 'META_WEBHOOK_VERIFY_TOKEN' | 'META_ONBOARDING_LIMITED'>>,
): MetaEnv | null {
  if (!e.META_APP_ID || !e.META_APP_SECRET) return null;
  return {
    appId: e.META_APP_ID,
    appSecret: e.META_APP_SECRET,
    graphVersion: e.META_GRAPH_VERSION,
    ...(e.META_WEBHOOK_VERIFY_TOKEN ? { webhookVerifyToken: e.META_WEBHOOK_VERIFY_TOKEN } : {}),
    limited: e.META_ONBOARDING_LIMITED ?? false,
  };
}
const getIntegrationEnv = () =>
  cached('integration', () => parseEnv(integrationEnvSchema, process.env, 'integration'));
export const getMetaEnv = (): MetaEnv | null => metaEnvOf(getIntegrationEnv());

/** Token sealing keyring, or null when no key is set (only possible on local without Meta). Parsed once. */
export const getCryptoEnv = (): Keyring | null =>
  cached('keyring', () => {
    const e = getIntegrationEnv();
    return e.TOKEN_ENC_KEY ? parseKeyring(e.TOKEN_ENC_KEY, e.TOKEN_ENC_KEYS_OLD) : null;
  });

export const getSeedEnv = (): z.infer<typeof seedSchema> =>
  cached('seed', () => parseEnv(seedSchema, process.env, 'seed'));
export const getTestDbUrl = (): string =>
  cached('test', () => parseEnv(testSchema, process.env, 'test').TEST_DATABASE_URL);
