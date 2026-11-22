import { describe, expect, it } from 'vitest';
import { opaqueToken } from '../../contracts/index.ts';
import {
  DUMMY_HASH,
  hashPassword,
  needsRehash,
  randomCode,
  randomToken,
  safeEqual,
  sha256,
  verifyPassword,
} from './index.ts';

describe('passwords', () => {
  it('hashes and verifies; a wrong password fails', async () => {
    const hash = await hashPassword('correct horse 1234');
    expect(hash).toMatch(/^scrypt\$15\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword('correct horse 1234', hash)).toBe(true);
    expect(await verifyPassword('correct horse 1235', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same password 12'),
      hashPassword('same password 12'),
    ]);
    expect(a).not.toBe(b);
  });

  it('normalises to NFKC, so composed and decomposed forms match', async () => {
    const hash = await hashPassword('café password 1');
    expect(await verifyPassword('café password 1', hash)).toBe(true);
  });

  it('bounds the length', async () => {
    await expect(hashPassword('short1')).rejects.toThrow(RangeError);
    await expect(hashPassword('a1'.repeat(65))).rejects.toThrow(RangeError);
    const hash = await hashPassword('correct horse 1234');
    expect(await verifyPassword('a'.repeat(129), hash)).toBe(false);
  });

  it('DUMMY_HASH is a valid current-parameter hash that matches nothing', async () => {
    expect(needsRehash(DUMMY_HASH)).toBe(false);
    expect(await verifyPassword('anything at all 1', DUMMY_HASH)).toBe(false);
  });

  it('flags old parameters and malformed values for rehash, and never verifies them', async () => {
    const hash = await hashPassword('correct horse 1234');
    expect(needsRehash(hash)).toBe(false);
    expect(needsRehash(hash.replace('scrypt$15$', 'scrypt$14$'))).toBe(true);
    expect(needsRehash('not-a-hash')).toBe(true);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    // A tampered row asking for huge memory is refused, not run.
    expect(await verifyPassword('x', hash.replace('scrypt$15$', 'scrypt$22$'))).toBe(false);
  });
});

describe('tokens and codes', () => {
  it('randomToken is 43 base64url characters and unique', () => {
    const tokens = new Set(Array.from({ length: 50 }, randomToken));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(opaqueToken.safeParse(t).success).toBe(true);
  });

  it('randomCode is six digits, zero-padded', () => {
    for (let i = 0; i < 2000; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });

  it('sha256 is hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('safeEqual compares values, including different lengths, without throwing', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
  });
});
