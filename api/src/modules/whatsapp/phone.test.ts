import { describe, expect, it } from 'vitest';
import { toE164 } from './phone.ts';

describe('toE164', () => {
  it('keeps the digits and puts a + in front', () => {
    expect(toE164('+1 555-012-3456')).toBe('+15550123456');
    expect(toE164('971 50 123 4567')).toBe('+971501234567');
    expect(toE164('(212) 600-123456')).toBe('+212600123456');
  });

  it('refuses what is not a number', () => {
    for (const bad of ['', 'abc', '+0123456', '12345', '1'.repeat(16)]) {
      expect(() => toE164(bad), bad).toThrow(RangeError);
    }
  });
});
