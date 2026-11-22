import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import {
  type FastifyError,
  type FastifyPluginAsync,
  type FastifyServerOptions,
  LogController,
} from 'fastify';
import { ZodError } from 'zod';
import { runWithContext } from '../context/index.ts';
import { safeEqual } from '../crypto/index.ts';
import type { ApiEnv } from '../env.ts';
import { AppError, toErrorBody } from '../errors/index.ts';
import type { RouteConfig, SessionResolver } from './route.ts';

export type HttpPluginOptions = {
  env: ApiEnv;
  resolveSession: SessionResolver;
  /** Called for every unexpected (non-AppError, non-4xx) failure, after the 500 is decided. */
  onUnexpected?: (err: Error, route: string) => void;
};

const configOf = (req: { routeOptions: { config?: unknown } }) =>
  req.routeOptions.config as Partial<RouteConfig> | undefined;

/** web sends its own id so one request can be followed across both services; anything odd is replaced. */
export const genReqId = (req: {
  headers: Record<string, string | string[] | undefined>;
}): string => {
  const h = req.headers['x-request-id'];
  return typeof h === 'string' && /^[\w.-]{8,64}$/.test(h) ? h : randomUUID();
};

/** Logger and server options shared by the real app and the tests. Logs carry ids and codes, never bodies. */
export function serverOptions(env: ApiEnv): FastifyServerOptions {
  return {
    logger: {
      level: env.LOG_LEVEL,
      base: { service: 'api', appEnv: env.APP_ENV },
      serializers: {
        req: (req: { id?: string; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split('?')[0],
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
    },
    // the onResponse hook below logs one clean line per request
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
    genReqId,
    trustProxy: (_address: string, hop: number) => hop < 1, // one hop: the Railway edge
    exposeHeadRoutes: false,
  };
}

export const httpPlugin: FastifyPluginAsync<HttpPluginOptions> = async (app, opts) => {
  const { env } = opts;
  app.decorate('sessionResolver', opts.resolveSession);
  app.decorate('sharkxAssertAudit', env.NODE_ENV === 'test');
  app.decorateRequest('sx', null as unknown as { ip: string; userId?: string });

  // A route registered any other way would skip access, validation and audit rules: refuse it.
  app.addHook('onRoute', (route) => {
    if ((route.config as Partial<RouteConfig> | undefined)?.sharkx !== true) {
      throw new Error(`${route.method} ${route.url}: register api routes with defineRoute()`);
    }
  });

  // Request id and per-request context for services and the audit counter.
  app.addHook('onRequest', (req, _reply, done) => {
    req.sx = { ip: req.ip };
    runWithContext({ requestId: req.id, ip: req.ip, auditCount: 0 }, done);
  });

  // Everything except public routes is only for web: wrong or missing token looks like no such route.
  app.addHook('onRequest', async (req, reply) => {
    const access = configOf(req)?.access;
    if (!access || access === 'public') return;
    const token = req.headers['x-internal-token'];
    if (typeof token !== 'string' || !safeEqual(token, env.INTERNAL_API_TOKEN)) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    }
    // Only now is the forwarded address trusted.
    const forwarded = req.headers['x-client-ip'];
    if (typeof forwarded === 'string' && isIP(forwarded) !== 0) req.sx.ip = forwarded;
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('strict-transport-security', 'max-age=63072000; includeSubDomains');
    reply.header('x-request-id', req.id);
    if (configOf(req)?.access !== 'public') reply.header('cache-control', 'no-store');
    return payload;
  });

  app.addHook('onResponse', async (req, reply) => {
    req.log.info(
      {
        method: req.method,
        route: req.routeOptions.url ?? 'unmatched',
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
        userId: req.sx?.userId,
      },
      'request',
    );
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND' } }));

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) {
      if (err.retryAfterSec !== undefined) reply.header('retry-after', String(err.retryAfterSec));
      return reply.code(err.status).send(toErrorBody(err));
    }
    if (err instanceof ZodError) {
      return reply.code(422).send({ error: { code: 'VALIDATION' } });
    }
    const status = (err as FastifyError).statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      // Malformed JSON, unsupported media type, body too large: the caller's problem, nothing to alert on.
      return reply.code(status === 404 ? 404 : 422).send({
        error: { code: status === 404 ? 'NOT_FOUND' : 'VALIDATION' },
      });
    }
    // Unexpected: the message can echo values (e.g. a duplicate key), so only the error name is logged.
    const route = req.routeOptions.url ?? 'unmatched';
    req.log.error({ route, errorName: err.name }, 'unhandled error');
    opts.onUnexpected?.(err, route);
    return reply.code(500).send({ error: { code: 'INTERNAL' } });
  });
};

// Same as `fastify-plugin`: hooks, decorators and handlers apply to the whole app, not only this plugin's scope.
(httpPlugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
