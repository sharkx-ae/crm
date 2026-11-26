// The ONLY web module that reads process.env (Biome `noProcessEnv` enforces this).
// The web app (UI + BFF) has no database access: it talks to api through API_URL.
// Adding a variable: update web/.env.example, the schema below, and Railway (docs/ENVIRONMENTS.md).
import { z } from 'zod';

// WhatsApp Embedded Signup (F3a): the connect card needs the app id and the Facebook Login for Business configuration id.
// Both are public by nature (they appear in the page); read on the server and passed to the client as props, not
// NEXT_PUBLIC_*, so a Railway change needs no rebuild. Optional: unset = the card shows "Awaiting access".
const metaId = z.string().regex(/^\d{1,32}$/);

export const webSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
    APP_URL: z.url(),
    LEADS_URL: z.url().optional(),
    API_URL: z.url(), // server-side only; Railway private network URL of the api service
    // Shared secret with the api: sent as x-internal-token on every BFF call (the api's public domain also serves internal routes).
    INTERNAL_API_TOKEN: z.string().min(32, 'must be at least 32 characters'),
    RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
    META_APP_ID: metaId.optional(),
    META_ES_CONFIG_ID: metaId.optional(),
    META_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.0$/)
      .default('v27.0'),
  })
  .superRefine((v, ctx) => {
    for (const [set, missing] of [
      ['META_APP_ID', 'META_ES_CONFIG_ID'],
      ['META_ES_CONFIG_ID', 'META_APP_ID'],
    ] as const) {
      if (v[set] !== undefined && v[missing] === undefined) {
        ctx.addIssue({ code: 'custom', path: [missing], message: `required when ${set} is set` });
      }
    }
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

/** What the WhatsApp connect card needs, or null when Meta is not configured for this environment. */
export function getMetaWebEnv(): { appId: string; configId: string; graphVersion: string } | null {
  const e = getWebEnv();
  if (!e.META_APP_ID || !e.META_ES_CONFIG_ID) return null;
  return {
    appId: e.META_APP_ID,
    configId: e.META_ES_CONFIG_ID,
    graphVersion: e.META_GRAPH_VERSION,
  };
}

/** Called from instrumentation.ts: fail fast when the Node.js server boots (not at build time). */
export function bootWebEnv(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') getWebEnv();
}
