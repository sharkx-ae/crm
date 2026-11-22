import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { type Action, can, type Session } from '../../contracts/session.ts';
import { getContext } from '../context/index.ts';
import { AppError } from '../errors/index.ts';

// The only way to register an api route. Access level, authorisation, validation and auditing are declared
// next to the handler, and the plugin refuses any route registered without going through here (plan §4.1).
export type RouteAccess = 'public' | 'anon' | 'pending' | 'session';

/** What `resolveSession` returns: the contract session plus what the auth module needs to rotate and revoke. */
export type ResolvedSession = Session & { sessionId: string; name: string; email: string };
export type SessionResolver = (raw: string, now?: Date) => Promise<ResolvedSession | null>;

type Schema = z.ZodType | undefined;
type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined;
type Input<B, Q, P> = { body: Infer<B>; query: Infer<Q>; params: Infer<P> };

export type RouteSpec<
  A extends RouteAccess,
  B extends Schema,
  Q extends Schema,
  P extends Schema,
  R extends z.ZodType,
> = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  access: A;
  /**
   * `session` routes need one: a fixed action, `'self'` (any signed-in user, acting on itself), or a function of
   * the validated input. A client asking about a project that is not its own gets 404, never 403.
   */
  action?: Action | 'self' | ((input: Input<B, Q, P>) => { action: Action; projectId?: string });
  body?: B;
  query?: Q;
  params?: P;
  response: R;
  /** Every mutating route declares whether its handler writes exactly one audit row ('one') or none. */
  audit?: 'one' | 'none';
};

export type RouteContext<
  A extends RouteAccess,
  B extends Schema,
  Q extends Schema,
  P extends Schema,
> = Input<B, Q, P> & {
  req: FastifyRequest;
  reply: FastifyReply;
  /** Client IP: `x-client-ip` from web after the internal token check, otherwise the socket (trustProxy 1). */
  ip: string;
  session: A extends 'pending' | 'session' ? ResolvedSession : null;
};

export type RouteConfig = { sharkx: true; access: RouteAccess; spec: AnySpec };
type AnySpec = {
  method: string;
  url: string;
  access: RouteAccess;
  action?: unknown;
  audit?: 'one' | 'none';
};

/** Every route defined in this process, for the structure tests. Keyed by `METHOD url`. */
export const routeSpecs = new Map<string, AnySpec>();

declare module 'fastify' {
  interface FastifyInstance {
    sessionResolver: SessionResolver;
    /** True in NODE_ENV=test: audited mutating routes must write exactly one audit row. */
    sharkxAssertAudit: boolean;
  }
  interface FastifyRequest {
    sx: { ip: string; userId?: string };
  }
}

/** Field paths and issue codes only: never the submitted values. */
function validationError(err: z.ZodError): AppError {
  const issues = err.issues.map((i) => ({ path: i.path.join('.'), code: i.code }));
  return new AppError('VALIDATION', { details: { issues } });
}

function parse<T extends z.ZodType>(schema: T | undefined, value: unknown): z.infer<T> | undefined {
  if (!schema) return undefined;
  const res = schema.safeParse(value);
  if (!res.success) throw validationError(res.error);
  return res.data;
}

export function defineRoute<
  A extends RouteAccess,
  B extends Schema = undefined,
  Q extends Schema = undefined,
  P extends Schema = undefined,
  R extends z.ZodType = z.ZodType,
>(
  app: FastifyInstance,
  spec: RouteSpec<A, B, Q, P, R>,
  handler: (c: RouteContext<A, B, Q, P>) => Promise<z.input<R>>,
): void {
  const label = `${spec.method} ${spec.url}`;
  if (spec.access === 'session' && !spec.action) {
    throw new Error(`${label}: a session route must declare its can() action (or 'self')`);
  }
  if (spec.access !== 'session' && spec.action) {
    throw new Error(`${label}: only session routes take an action`);
  }
  if (spec.method !== 'GET' && !spec.audit) {
    throw new Error(`${label}: a mutating route must declare audit: 'one' | 'none'`);
  }
  routeSpecs.set(label, spec);

  const config: RouteConfig = { sharkx: true, access: spec.access, spec };

  app.route({
    method: spec.method,
    url: spec.url,
    config,
    handler: async (req, reply) => {
      // 1. who is asking (before anything about the input is revealed)
      let session: ResolvedSession | null = null;
      if (spec.access === 'pending' || spec.access === 'session') {
        const raw = req.headers['x-session-token'];
        const resolved = typeof raw === 'string' ? await app.sessionResolver(raw) : null;
        if (!resolved) throw new AppError('UNAUTHENTICATED');
        if (spec.access === 'session' && resolved.stage !== 'active') {
          throw new AppError('UNAUTHENTICATED', { details: { stage: resolved.stage } });
        }
        session = resolved;
        req.sx.userId = resolved.userId;
      }

      // 2. what they sent
      const input = {
        body: parse(spec.body, req.body),
        query: parse(spec.query, req.query),
        params: parse(spec.params, req.params),
      } as Input<B, Q, P>;

      // 3. what they may do
      if (spec.access === 'session' && session && spec.action !== 'self') {
        const want: { action: Action; projectId?: string } =
          typeof spec.action === 'function'
            ? spec.action(input)
            : { action: spec.action as Action };
        if (!can(session, want.action, want.projectId)) {
          const foreign =
            session.role === 'client' &&
            want.projectId !== undefined &&
            !session.projectIds.includes(want.projectId);
          throw new AppError(foreign ? 'NOT_FOUND' : 'FORBIDDEN');
        }
      }

      const out = await handler({
        ...input,
        req,
        reply,
        ip: req.sx.ip,
        session: session as RouteContext<A, B, Q, P>['session'],
      });

      // Test mode: a mutating route that says 'one' must have written exactly one audit row (plan §6.6).
      if (spec.audit === 'one' && req.server.sharkxAssertAudit && getContext().auditCount !== 1) {
        throw new Error(`${label}: expected exactly one audit row, got ${getContext().auditCount}`);
      }
      // Parsing the response strips fields the contract does not name.
      return spec.response.parse(out);
    },
  });
}
