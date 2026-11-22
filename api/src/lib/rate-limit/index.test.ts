import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '../../db/index.ts';
import { withSystem } from '../tenant/index.ts';
import { hit, peek, rateKey, rules } from './index.ts';

afterAll(() => getPool().end());

const rule = { limit: 3, windowSec: 600 };
const T0 = new Date('2026-11-22T10:00:00.000Z'); // aligned to the 10-minute window
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
const fresh = () => rateKey('test', randomUUID());
const hitOnce = (key: string, now: Date) => withSystem(null, (tx) => hit(tx, key, rule, now));
const peekOnce = (key: string, now: Date) => withSystem(null, (tx) => peek(tx, key, rule, now));

describe('rate limits', () => {
  it('allows up to the limit, then blocks with the seconds left in the window', async () => {
    const key = fresh();
    expect((await hitOnce(key, at(0))).allowed).toBe(true);
    expect((await hitOnce(key, at(10))).allowed).toBe(true);
    const third = await hitOnce(key, at(20));
    expect(third).toMatchObject({ allowed: true, count: 3 });
    const fourth = await hitOnce(key, at(30));
    expect(fourth).toMatchObject({ allowed: false, count: 4, retryAfterSec: 570 });
  });

  it('resets when the window rolls over', async () => {
    const key = fresh();
    for (let i = 0; i < 4; i++) await hitOnce(key, at(i));
    expect((await hitOnce(key, at(599))).allowed).toBe(false);
    expect(await hitOnce(key, at(600))).toMatchObject({ allowed: true, count: 1 });
  });

  it('peek reads without counting', async () => {
    const key = fresh();
    expect(await peekOnce(key, at(0))).toMatchObject({ allowed: true, count: 0 });
    await hitOnce(key, at(1));
    await hitOnce(key, at(2));
    expect(await peekOnce(key, at(3))).toMatchObject({ allowed: true, count: 2 });
    expect(await peekOnce(key, at(3))).toMatchObject({ count: 2 });
    await hitOnce(key, at(4));
    expect(await peekOnce(key, at(5))).toMatchObject({ allowed: false, count: 3 });
    // a new window starts clean
    expect(await peekOnce(key, at(600))).toMatchObject({ allowed: true, count: 0 });
  });

  it('keys are independent', async () => {
    const [a, b] = [fresh(), fresh()];
    for (let i = 0; i < 3; i++) await hitOnce(a, at(i));
    expect((await hitOnce(a, at(4))).allowed).toBe(false);
    expect((await hitOnce(b, at(4))).allowed).toBe(true);
  });

  it('parallel hits are each counted once', async () => {
    const key = fresh();
    const results = await Promise.all(Array.from({ length: 20 }, () => hitOnce(key, at(1))));
    expect(results.map((r) => r.count).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(rule.limit);
  });

  it('keys hold a hash, never the parts', () => {
    const key = rateKey('login', 'someone@example.com', '203.0.113.9');
    expect(key).toMatch(/^login:[0-9a-f]{64}$/);
    expect(key).not.toContain('example');
    expect(rateKey('login', 'a', 'b')).not.toBe(rateKey('login', 'ab'));
  });

  it('ships the plan’s rules', () => {
    expect(rules).toEqual({
      login: { limit: 5, windowSec: 900 },
      codeSend: { limit: 3, windowSec: 600 },
      reset: { limit: 3, windowSec: 3600 },
      alert: { limit: 1, windowSec: 3600 },
    });
  });
});
