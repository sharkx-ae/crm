import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import pkg from '../../package.json' with { type: 'json' };
import { healthResponse } from '../contracts/index.ts';
import { pingDb } from '../db/index.ts';
import type { ApiEnv } from '../lib/env.ts';
import { defineRoute } from '../lib/http/route.ts';
import { queueHealth } from '../lib/queue/index.ts';

// The api also sends commit, appEnv and time; they are not part of the contract.
const response = healthResponse.extend({
  commit: z.string().nullable(),
  appEnv: z.string(),
  time: z.string(),
});

// Railway healthcheck for the api service. Shape: HealthResponse (contracts/http.ts). No secrets or PII.
// integrations and lastWebhookAt are stubbed until F14a. The status follows the database only: a queue problem is
// reported, but must not make Railway restart the api.
export const healthRoutes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  defineRoute(
    app,
    { method: 'GET', url: '/health', access: 'public', response },
    async ({ reply }) => {
      const [db, queue] = await Promise.all([pingDb(), queueHealth()]);
      const ok = db === 'ok';
      reply.code(ok ? 200 : 503);
      return {
        status: ok ? ('ok' as const) : ('error' as const),
        service: 'api',
        version: pkg.version,
        commit: env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        appEnv: env.APP_ENV,
        checks: { db, queue, integrations: {} },
        lastWebhookAt: null,
        time: new Date().toISOString(),
      };
    },
  );
};
