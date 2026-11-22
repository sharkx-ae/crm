import { describe, expect, it } from 'vitest';
import { redact, redactString } from './redact.ts';

describe('redact', () => {
  it('masks emails and E.164 numbers inside strings', () => {
    expect(redactString('failed for alice@example.com')).toBe('failed for [email]');
    expect(redactString('call +971501234567 now')).toBe('call [phone] now');
    expect(redactString('a@b.co and c@d.io')).toBe('[email] and [email]');
  });

  it('masks token-like strings but leaves uuids and plain names alone', () => {
    const token = 'k3J9xQ2mZpLw8RtYvB1nC5dFgHaS7uEoXiMzNqPrT4w';
    expect(redactString(`session ${token} expired`)).toBe('session [token] expired');
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(redactString(uuid)).toBe(uuid);
    expect(redactString('user_status_changed_to_disabled')).toBe('user_status_changed_to_disabled');
  });

  it('drops sensitive keys, at any depth', () => {
    const out = redact({
      reason: 'wrong_password',
      password: 'hunter2hunter2',
      pwHash: 'scrypt$...',
      nested: { token: 'x', phone: '+971501234567', phoneE164: '+971501234567', ok: 1 },
      list: [{ email: 'a@b.co', keep: true }],
      code: '123456',
      text: 'hello there',
      body: 'whole message',
      cookie: 'sid=1',
      authorization: 'Bearer abc',
      errorCode: 'RATE_LIMITED',
      maskedEmail: 'a***@b.co',
    });
    expect(out).toEqual({
      reason: 'wrong_password',
      nested: { ok: 1 },
      list: [{ keep: true }],
      errorCode: 'RATE_LIMITED',
    });
  });

  it('keeps ids, numbers, booleans and nulls; serialises dates and bigints', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(
      redact({ projectId: id, n: 3, ok: false, none: null, at: new Date(0), big: 5n }),
    ).toEqual({
      projectId: id,
      n: 3,
      ok: false,
      none: null,
      at: '1970-01-01T00:00:00.000Z',
      big: '5',
    });
  });

  it('reduces an Error to its name (messages echo values)', () => {
    expect(redact({ err: new TypeError('duplicate key (email)=(a@b.co)') })).toEqual({
      err: { name: 'TypeError' },
    });
  });

  it('bounds depth, list length and string length', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(redact(deep))).toContain('[deep]');
    expect((redact(Array.from({ length: 200 }, (_, i) => i)) as number[]).length).toBe(50);
    expect((redact('x'.repeat(2000)) as string).length).toBeLessThanOrEqual(501);
  });
});
