// The ONLY web module that reads process.env (Biome `noProcessEnv` enforces this).
// The web app (UI + BFF) has no database access: it talks to api through API_URL.
// Adding a variable: update web/.env.example, the schema below, and Railway (docs/ENVIRONMENTS.md).
import { z } from 'zod';

export const webSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  APP_URL: z.url(),
  LEADS_URL: z.url().optional(),
  API_URL: z.url(), // server-side only; Railway private network URL of the api service
  // Shared secret with the api: sent as x-internal-token on every BFF call (the api's public domain also serves internal routes).
  INTERNAL_API_TOKEN: z.string().min(32, 'must be at least 32 characters'),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
});

export type WebEnv = z.infer<typeof webSchema>;

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
    `Invalid ${label} environment:\n${lines.join('\n')}\nSee web/.env.example and docs/ENVIRONMENTS.md.`,
  );
}

let web: WebEnv | undefined;
export function getWebEnv(): WebEnv {
  web ??= parseEnv(webSchema, process.env, 'web');
  return web;
}

/** Called from instrumentation.ts: fail fast when the Node.js server boots (not at build time). */
export function bootWebEnv(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') getWebEnv();
}
