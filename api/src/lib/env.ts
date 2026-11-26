// The ONLY api module that reads process.env (Biome `noProcessEnv` enforces this).
// Zod-validated; a missing or invalid variable stops the process with a readable message.
// Adding a variable: update api/.env.example, the schema below, and Railway (docs/ENVIRONMENTS.md).
import { z } from 'zod';
import { password } from '../contracts/common.ts';

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

export const apiSchema = shared
  .extend(email.shape)
  .extend({
    PORT: z.coerce.number().int().positive().default(4000),
    APP_URL: z.url(), // web app URL, used in email links and CORS-free redirects
    TOKEN_ENC_KEY: z.string().min(1).optional(),
    // Shared secret between web and api: every non-public route requires it (x-internal-token).
    INTERNAL_API_TOKEN: z.string().min(32),
  })
  .superRefine(requireEmailOutsideLocal);

export const workerSchema = shared.extend(email.shape).superRefine(requireEmailOutsideLocal);

export const dbSchema = shared.pick({ DATABASE_URL: true });

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
export const getSeedEnv = (): z.infer<typeof seedSchema> =>
  cached('seed', () => parseEnv(seedSchema, process.env, 'seed'));
export const getTestDbUrl = (): string =>
  cached('test', () => parseEnv(testSchema, process.env, 'test').TEST_DATABASE_URL);
