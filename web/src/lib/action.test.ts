import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Me } from '../contracts/auth.ts';
import { defineAction } from './action.ts';
import { ApiError } from './api/error.ts';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const me = (over: Partial<Me> = {}): Me => ({
  userId: '33333333-3333-4333-8333-333333333333',
  role: 'manager',
  projectIds: [],
  locale: 'en',
  stage: 'active',
  name: 'Test',
  email: 'test@test.local',
  ...over,
});

let current: Me | 'redirect' = me();
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }));
vi.mock('./session.ts', async () => {
  const { redirect } = await import('next/navigation');
  return {
    requireSession: async () => {
      if (current === 'redirect') redirect('/en/login');
      return current;
    },
  };
});

beforeEach(() => {
  current = me();
  vi.restoreAllMocks();
});

const input = z.object({ name: z.string().min(2), password: z.string().min(12) });
const isRedirect = { digest: expect.stringContaining('NEXT_REDIRECT') };

describe('defineAction', () => {
  it('returns the handler result as data', async () => {
    const act = defineAction({ input, auth: 'none' }, async ({ input: i, me: m }) => ({
      hello: i.name,
      anon: m === null,
    }));
    expect(await act({ name: 'Omar', password: 'x'.repeat(12) })).toEqual({
      ok: true,
      data: { hello: 'Omar', anon: true },
    });
  });

  it('a validation failure returns paths and issue codes, never the submitted values', async () => {
    const act = defineAction({ input, auth: 'none' }, async () => 1);
    const res = await act({ name: 'O', password: 'secret-123' });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const text = JSON.stringify(res);
    expect(text).toContain('name');
    expect(text).toContain('password');
    expect(text).not.toContain('secret-123');
  });

  it('maps an ApiError to its code, details and retry time', async () => {
    const act = defineAction({ input: z.object({}), auth: 'none' }, async () => {
      throw new ApiError('RATE_LIMITED', 429, { retryAfterSec: 30, details: { scope: 'login' } });
    });
    expect(await act({})).toEqual({
      ok: false,
      error: { code: 'RATE_LIMITED', details: { scope: 'login' }, retryAfterSec: 30 },
    });
  });

  it('lets redirect() through: it is control flow, not a failure', async () => {
    const { redirect } = await import('next/navigation');
    const act = defineAction({ input: z.object({}), auth: 'none' }, async () => {
      redirect('/en/code');
    });
    await expect(act({})).rejects.toMatchObject(isRedirect);
  });

  it('an unexpected error is a generic INTERNAL and logs only the error name', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const act = defineAction({ input: z.object({}), auth: 'none' }, async () => {
      throw new Error('duplicate key (email)=(a@b.co)');
    });
    expect(await act({})).toEqual({ ok: false, error: { code: 'INTERNAL' } });
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain('"errorName":"Error"');
    expect(line).not.toContain('a@b.co');
  });

  it('runs can() before the handler: FORBIDDEN for the wrong role', async () => {
    const handler = vi.fn(async () => 1);
    const act = defineAction({ input: z.object({}), action: 'user.manage' }, handler);
    expect(await act({})).toEqual({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(handler).not.toHaveBeenCalled();
    current = me({ role: 'super_admin' });
    expect(await act({})).toEqual({ ok: true, data: 1 });
  });

  it('a client asking about another client project gets NOT_FOUND, its own is fine', async () => {
    current = me({ role: 'client', projectIds: [P1] });
    const act = defineAction(
      {
        input: z.object({ projectId: z.uuid() }),
        action: (i) => ({ action: 'lead.read', projectId: i.projectId }),
      },
      async () => 'ok',
    );
    expect(await act({ projectId: P2 })).toEqual({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await act({ projectId: P1 })).toEqual({ ok: true, data: 'ok' });
  });

  it('a missing session redirects before the handler runs', async () => {
    current = 'redirect';
    const handler = vi.fn(async () => 1);
    const act = defineAction({ input: z.object({}) }, handler);
    await expect(act({})).rejects.toMatchObject(isRedirect);
    expect(handler).not.toHaveBeenCalled();
  });

  it('a signed-in action whose session ended at the api goes back to sign-in', async () => {
    const act = defineAction({ input: z.object({}), auth: 'session' }, async () => {
      throw new ApiError('UNAUTHENTICATED', 401);
    });
    await expect(act({})).rejects.toMatchObject(isRedirect);
  });

  it('but UNAUTHENTICATED on an anonymous action (wrong password) is just a result', async () => {
    const act = defineAction({ input: z.object({}), auth: 'none' }, async () => {
      throw new ApiError('UNAUTHENTICATED', 401);
    });
    expect(await act({})).toEqual({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});
