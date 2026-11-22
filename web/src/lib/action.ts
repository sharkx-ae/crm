import { redirect, unstable_rethrow } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import type { z } from 'zod';
import type { Me } from '../contracts/auth.ts';
import type { ErrorCode } from '../contracts/common.ts';
import { type Action, can } from '../contracts/session.ts';
import { ApiError } from './api/error.ts';
import { requireSession } from './session.ts';

// The one wrapper for every Server Action (CLAUDE.md: one wrapper per action maps errors to a translated message).
// It validates the input, resolves the session, runs `can()` for UX (the api is the enforcement point) and turns
// failures into a serialisable result the form shows with `errors.<code>`.
export type ActionError = {
  code: ErrorCode;
  details?: Record<string, unknown>;
  retryAfterSec?: number;
};
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

type Auth = 'none' | 'pending' | 'session';

export type ActionCtx<I, A extends Auth> = {
  input: I;
  /** null only for `auth: 'none'` (sign-in, reset, accept invite). */
  me: A extends 'none' ? null : Me;
  locale: string;
};

export type ActionSpec<S extends z.ZodType, A extends Auth> = {
  input: S;
  /** Checked with `can()` before the handler runs. A function can pick the action and project from the input. */
  action?: Action | ((input: z.infer<S>) => { action: Action; projectId?: string });
  /** Default `session`: an active session is required. */
  auth?: A;
};

const fail = (error: ActionError): { ok: false; error: ActionError } => ({ ok: false, error });

export function defineAction<S extends z.ZodType, T, A extends Auth = 'session'>(
  spec: ActionSpec<S, A>,
  handler: (ctx: ActionCtx<z.infer<S>, A>) => Promise<T>,
): (raw: unknown) => Promise<ActionResult<T>> {
  const auth: Auth = spec.auth ?? 'session';

  return async (raw) => {
    try {
      // Input first, but never echoed: only paths and issue codes reach the client.
      const parsed = spec.input.safeParse(raw);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION',
          details: {
            issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
          },
        });
      }
      const input = parsed.data as z.infer<S>;
      const locale = await getLocale();

      const me =
        auth === 'none' ? null : await requireSession({ allowPending: auth === 'pending' });

      if (spec.action && me) {
        const want =
          typeof spec.action === 'function' ? spec.action(input) : { action: spec.action };
        const projectId = 'projectId' in want ? want.projectId : undefined;
        if (!can(me, want.action, projectId)) {
          const foreign = me.role === 'client' && projectId !== undefined;
          return fail({ code: foreign ? 'NOT_FOUND' : 'FORBIDDEN' });
        }
      }

      const data = await handler({ input, me, locale } as ActionCtx<z.infer<S>, A>);
      return { ok: true, data };
    } catch (err) {
      unstable_rethrow(err); // redirect() and notFound() are control flow, not failures
      if (err instanceof ApiError) {
        // A signed-in action whose session has ended goes back to the sign-in screen.
        if (err.code === 'UNAUTHENTICATED' && auth !== 'none') {
          redirect(`/${await getLocale()}/login`);
        }
        return fail({ code: err.code, details: err.details, retryAfterSec: err.retryAfterSec });
      }
      // Unexpected: a generic message for the person; the log carries the error name only (no values, no PII).
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'web',
          msg: 'action failed',
          errorName: err instanceof Error ? err.name : 'unknown',
        }),
      );
      return fail({ code: 'INTERNAL' });
    }
  };
}
