// Builds the Fastify app (backend API). server.ts listens; tests use app.inject() without a socket.
// Public routes (later specs): /webhooks/*, /oauth/*/callback, /forms/:key, /health.
// Every other route is called only by web (the BFF) with the internal token and the user's session (F1c).
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiEnv } from './lib/env.ts';
import { reportError } from './lib/errors/index.ts';
import { httpPlugin, serverOptions } from './lib/http/plugin.ts';
import type { SessionResolver } from './lib/http/route.ts';
import { auditRoutes } from './modules/audit/index.ts';
import { authRoutes, resolveSession } from './modules/auth/index.ts';
import { leadRoutes } from './modules/leads/index.ts';
import { projectRoutes } from './modules/projects/index.ts';
import { healthRoutes } from './routes/health.ts';

export type AppDeps = {
  resolveSession?: SessionResolver;
  onUnexpected?: (err: Error, route: string) => void;
};

export async function buildApp(env: ApiEnv, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify(serverOptions(env));
  await app.register(httpPlugin, {
    env,
    resolveSession: deps.resolveSession ?? resolveSession,
    onUnexpected: deps.onUnexpected ?? reportUnexpected,
  });
  await app.register(healthRoutes, { env });
  await app.register(authRoutes, { env });
  await app.register(auditRoutes);
  await app.register(projectRoutes, { env });
  await app.register(leadRoutes);
  return app;
}

/** Plan §6.7: an unexpected 500 goes to error_log and, rate-limited, to the alert inbox. Name only in the fingerprint. */
function reportUnexpected(err: Error, route: string): void {
  void reportError({
    source: 'api',
    fingerprint: `api:${route}:${err.name}`,
    message: `${err.name}: ${err.message}`, // redacted by reportError: database errors can echo values
    context: { route },
  });
}
