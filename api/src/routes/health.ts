import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import pkg from '../../package.json' with { type: 'json' };
import { healthResponse } from '../contracts/index.ts';
import { pingDb } from '../db/index.ts';
import type { ApiEnv } from '../lib/env.ts';
import { defineRoute } from '../lib/http/route.ts';

// The api also sends commit, appEnv and time; they are not part of the contract.
const response = healthResponse.extend({
  commit: z.string().nullable(),
  appEnv: z.string(),
  time: z.string(),
});

// Railway healthcheck for the api service. Shape: HealthResponse (contracts/http.ts). No secrets or PII.
// queue is stubbed until F1d; integrations and lastWebhookAt until F14a.
export const healthRoutes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  defineRoute(
    app,
    { method: 'GET', url: '/health', access: 'public', response },
    async ({ reply }) => {
      const db = await pingDb();
      const ok = db === 'ok';
      reply.code(ok ? 200 : 503);
      return {
        status: ok ? ('ok' as const) : ('error' as const),
        service: 'api',
        version: pkg.version,
        commit: env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        appEnv: env.APP_ENV,
        checks: { db, queue: 'unknown' as const, integrations: {} },
        lastWebhookAt: null,
        time: new Date().toISOString(),
      };
    },
  );
};
