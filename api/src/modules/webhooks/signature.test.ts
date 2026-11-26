import { describe, expect, it } from 'vitest';
import { sign, signatureVector, webhookFixture } from '../../../tests/helpers/whatsapp.ts';
import { externalIdOf, verifyMetaSignature } from './index.ts';

const SECRET = 'test-app-secret';
const body = webhookFixture('messages-text');

describe('verifyMetaSignature', () => {
  it('accepts a header computed independently (precomputed vector)', () => {
    const v = signatureVector();
    const raw = webhookFixture(v.bodyFile.replace(/^webhooks\//, '').replace(/\.json$/, ''));
    expect(verifyMetaSignature(raw, v.header, v.secret)).toBe(true);
  });

  it('accepts a valid signature over the exact bytes', () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects one flipped byte in the body', () => {
    const tampered = Buffer.from(body);
    tampered[10] = (tampered[10] ?? 0) ^ 1;
    expect(verifyMetaSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verifyMetaSignature(body, sign(body, 'another-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing, empty or repeated header', () => {
    expect(verifyMetaSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, '', SECRET)).toBe(false);
    expect(verifyMetaSignature(body, [sign(body), sign(body)], SECRET)).toBe(false);
  });

  it('rejects other algorithms, upper-case hex, and hashes of the wrong length', () => {
    const hex = sign(body).slice('sha256='.length);
    expect(verifyMetaSignature(body, `sha1=${hex.slice(0, 40)}`, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, `sha256=${hex.toUpperCase()}`, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, `sha256=${hex.slice(0, 63)}`, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, `sha256=${hex}0`, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, hex, SECRET)).toBe(false); // no prefix
    expect(verifyMetaSignature(body, ` sha256=${hex}`, SECRET)).toBe(false);
  });

  it('signs the raw bytes: a re-serialised body fails while the raw bytes pass (escaped unicode)', () => {
    const raw = webhookFixture('messages-arabic');
    const header = sign(raw);
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(raw.toString('utf8'))));
    expect(reserialised.equals(raw)).toBe(false); // the fixture really is escaped
    expect(verifyMetaSignature(raw, header, SECRET)).toBe(true);
    expect(verifyMetaSignature(reserialised, header, SECRET)).toBe(false);
  });
});

describe('externalIdOf', () => {
  it('is stable for identical bytes and differs when one byte changes', () => {
    const a = externalIdOf(body);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(externalIdOf(Buffer.from(body))).toBe(a);
    const changed = Buffer.from(body);
    changed[20] = (changed[20] ?? 0) ^ 1;
    expect(externalIdOf(changed)).not.toBe(a);
  });
});
