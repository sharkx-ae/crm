import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request (or per-job) state that services read without it being threaded through every call.
export type RequestContext = {
  requestId: string;
  ip?: string;
  /** audit() increments this; in tests the route plugin asserts exactly one per audited mutation. */
  auditCount: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);

/** Outside a request or job (scripts, tests) a detached context is returned, so callers never branch. */
export const getContext = (): RequestContext =>
  storage.getStore() ?? { requestId: 'none', auditCount: 0 };
