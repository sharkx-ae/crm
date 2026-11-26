import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { opaqueToken } from '../../contracts/index.ts';
import {
  DUMMY_HASH,
  hashPassword,
  hmacSha256,
  KeyringError,
  needsRehash,
  openToken,
  parseKeyring,
  randomCode,
  randomToken,
  safeEqual,
  sealToken,
  sha256,
  TokenOpenError,
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

const key = (id: string) => `${id}:${randomBytes(32).toString('base64')}`;
const AAD = 'integration_tokens:p1:i1:waba1';

describe('keyring', () => {
  it('parses the current key and a comma list of old ones', () => {
    const ring = parseKeyring(key('k2'), `${key('k1')},${key('k0')}`);
    expect(ring.current.id).toBe('k2');
    expect([...ring.old.keys()]).toEqual(['k1', 'k0']);
  });

  it('refuses keys that are not exactly 32 bytes, bad ids and duplicate ids', () => {
    const b64 = (n: number) => randomBytes(n).toString('base64');
    for (const bad of [
      `k1:${b64(31)}`,
      `k1:${b64(33)}`,
      'k1:not base64!',
      `K1:${b64(32)}`,
      `toolongkeyid1234567:${b64(32)}`,
      `:${b64(32)}`,
      b64(32),
      '',
    ]) {
      expect(() => parseKeyring(bad), bad).toThrow(KeyringError);
    }
    expect(() => parseKeyring(key('k1'), key('k1'))).toThrow(KeyringError);
    const dup = key('k0');
    expect(() => parseKeyring(key('k1'), `${dup},${dup}`)).toThrow(KeyringError);
  });

  it('never puts the key in the error message', () => {
    const secret = randomBytes(31).toString('base64');
    try {
      parseKeyring(`k1:${secret}`);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });
});

describe('token sealing (AES-256-GCM)', () => {
  const ring = parseKeyring(key('k1'));

  it('round-trips and carries the key id; the value is not in the ciphertext', () => {
    const sealed = sealToken(ring, 'EAAG-business-token', AAD);
    expect(sealed.keyId).toBe('k1');
    expect(sealed.encValue).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed.encValue).not.toContain('EAAG');
    expect(openToken(ring, sealed, AAD)).toBe('EAAG-business-token');
  });

  it('uses a fresh IV every time', () => {
    const a = sealToken(ring, 'same', AAD);
    const b = sealToken(ring, 'same', AAD);
    expect(a.encValue).not.toBe(b.encValue);
  });

  it('fails the same generic way for a tampered iv, ciphertext, tag, AAD or key id', () => {
    const sealed = sealToken(ring, 'secret-token', AAD);
    const [v, iv, ct, tag] = sealed.encValue.split('.') as [string, string, string, string];
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    const cases: [string, { encValue: string; keyId: string }, string][] = [
      ['iv', { ...sealed, encValue: [v, flip(iv), ct, tag].join('.') }, AAD],
      ['ciphertext', { ...sealed, encValue: [v, iv, flip(ct), tag].join('.') }, AAD],
      ['tag', { ...sealed, encValue: [v, iv, ct, flip(tag)].join('.') }, AAD],
      ['aad', sealed, 'integration_tokens:p2:i1:waba1'],
      ['key id', { ...sealed, keyId: 'k2' }, AAD],
      ['version', { ...sealed, encValue: sealed.encValue.replace('v1.', 'v2.') }, AAD],
      ['truncated', { ...sealed, encValue: [v, iv, ct].join('.') }, AAD],
      ['garbage', { ...sealed, encValue: 'enc' }, AAD],
    ];
    for (const [name, s, aad] of cases) {
      expect(() => openToken(ring, s, aad), name).toThrow(TokenOpenError);
    }
    expect(() => openToken(ring, { ...sealed, keyId: 'k2' }, AAD)).toThrow(
      /^token could not be opened$/,
    );
  });

  it('a ciphertext copied to another row (other AAD) does not open', () => {
    const sealed = sealToken(ring, 'secret-token', 'integration_tokens:clientA:i1:waba1');
    expect(() => openToken(ring, sealed, 'integration_tokens:clientB:i2:waba2')).toThrow(
      TokenOpenError,
    );
  });

  it('a different key with the same id does not open it', () => {
    const sealed = sealToken(ring, 'secret-token', AAD);
    expect(() => openToken(parseKeyring(key('k1')), sealed, AAD)).toThrow(TokenOpenError);
  });

  it('rotation: new seals use the new key, rows sealed with the old key still open', () => {
    const k1 = key('k1');
    const before = sealToken(parseKeyring(k1), 'old-row', AAD);
    const rotated = parseKeyring(key('k2'), k1);
    expect(openToken(rotated, before, AAD)).toBe('old-row');
    const after = sealToken(rotated, 'new-row', AAD);
    expect(after.keyId).toBe('k2');
    expect(openToken(rotated, after, AAD)).toBe('new-row');
    // once k1 is dropped from the old list, the old row no longer opens
    expect(() => openToken(parseKeyring(key('k2')), before, AAD)).toThrow(TokenOpenError);
  });
});

describe('hmacSha256', () => {
  it('matches the reference HMAC over a string and over a buffer', () => {
    const body = Buffer.from('{"a":"é"}');
    const ref = createHmac('sha256', 'secret').update(body).digest();
    expect(hmacSha256('secret', body).equals(ref)).toBe(true);
    expect(hmacSha256('secret', body.toString()).equals(ref)).toBe(true);
    expect(hmacSha256('other', body).equals(ref)).toBe(false);
  });
});
