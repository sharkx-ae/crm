// Node built-in crypto only (no dependency). Passwords: scrypt; tokens: 256-bit random, only the sha256 is stored.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';

// N * r * 128 = 32 MiB, which is exactly Node's default maxmem, so the default would reject it.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
const MAXMEM = 64 * 1024 * 1024;
const MAX_PASSWORD = 128; // bounds CPU per attempt
const MIN_PASSWORD = 12;

type Params = { n: number; r: number; p: number };

const scrypt = (pw: string, salt: Buffer, keylen: number, o: Params): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCb(pw, salt, keylen, { N: o.n, r: o.r, p: o.p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });

const normalize = (pw: string) => pw.normalize('NFKC');

/** The length rule is applied after normalisation, so a password that passed the form check can still land here. */
export class PasswordLengthError extends RangeError {}

/** `scrypt$<log2 N>$<r>$<p>$<salt b64url>$<hash b64url>`. Hash outside DB transactions: it takes ~100 ms and 32 MiB. */
export async function hashPassword(pw: string): Promise<string> {
  const p = normalize(pw);
  if (p.length < MIN_PASSWORD || p.length > MAX_PASSWORD) {
    throw new PasswordLengthError(`password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(p, salt, KEYLEN, { n: N, r: R, p: P });
  return `scrypt$${Math.log2(N)}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function parse(stored: string): (Params & { salt: Buffer; hash: Buffer }) | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, logN, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const params = { n: 2 ** Number(logN), r: Number(r), p: Number(p) };
  if (![params.n, params.r, params.p].every((x) => Number.isInteger(x) && x > 0)) return null;
  // Refuse parameters that would need more memory than we allow (a tampered row must not exhaust memory).
  if (128 * params.n * params.r > MAXMEM) return null;
  return { ...params, salt: Buffer.from(salt, 'base64url'), hash: Buffer.from(hash, 'base64url') };
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  const p = normalize(pw);
  if (!parsed || p.length > MAX_PASSWORD) return false;
  const key = await scrypt(p, parsed.salt, parsed.hash.length, parsed);
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
}

/** True when the stored hash uses weaker parameters than today's, so login can upgrade it. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return (
    !parsed || parsed.n !== N || parsed.r !== R || parsed.p !== P || parsed.hash.length !== KEYLEN
  );
}

/** A valid hash of a password nobody has: unknown users cost the same as real ones. */
export const DUMMY_HASH =
  'scrypt$15$8$1$sqCXrgUGQTyo2PJUQKI2xw$2BLLRtwL4Ln4r2aHABn5y3AOzRRXqrWCR7HwJIC24Vw7MGarZpT_CHNj-AAZ5i-sOsCa6lFQ4x192FQpMETRmg';

/** 32 random bytes, base64url (43 characters). */
export const randomToken = (): string => randomBytes(32).toString('base64url');

/** Six digits, zero-padded. */
export const randomCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Constant-time comparison that does not leak a length mismatch (it compares digests). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

/** HMAC-SHA256 over the exact bytes given (webhook signatures, `appsecret_proof`). */
export const hmacSha256 = (key: string, data: Buffer | string): Buffer =>
  createHmac('sha256', key).update(data).digest();

// ---- Token sealing: AES-256-GCM with key ids (plan F3a §4.1) -------------------------------------------------------
// `encValue = "v1." + iv + "." + ciphertext + "." + tag` (base64url). The key id travels with the row (`key_id`), so
// rotation is: new current key, old one kept for decrypt only. The AAD binds a ciphertext to its own row.

export type Keyring = { current: { id: string; key: Buffer }; old: Map<string, Buffer> };
export type SealedToken = { encValue: string; keyId: string };

const KEY_ID = /^[a-z0-9]{1,16}$/;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Never names a key, a value or what failed: the keys are secrets and the message may end up in logs. */
export class KeyringError extends Error {}

/** One generic error for every way a sealed value can fail to open (wrong key, tampered, wrong row). */
export class TokenOpenError extends Error {
  constructor() {
    super('token could not be opened');
    this.name = 'TokenOpenError';
  }
}

function parseKey(entry: string): { id: string; key: Buffer } {
  const at = entry.indexOf(':');
  const id = at < 0 ? '' : entry.slice(0, at).trim();
  const b64 = at < 0 ? '' : entry.slice(at + 1).trim();
  if (!KEY_ID.test(id)) throw new KeyringError('key id must be 1-16 lowercase letters or digits');
  const key = B64.test(b64) && b64.length % 4 === 0 ? Buffer.from(b64, 'base64') : null;
  if (!key || key.length !== KEY_BYTES) throw new KeyringError('key must be 32 bytes, base64');
  return { id, key };
}

/** `current` is `<id>:<base64 32 bytes>`; `old` is a comma list of the same (decrypt only). Ids are unique across both. */
export function parseKeyring(current: string, old?: string): Keyring {
  const cur = parseKey(current);
  const olds = new Map<string, Buffer>();
  for (const part of (old ?? '').split(',').filter((p) => p.trim() !== '')) {
    const k = parseKey(part);
    if (k.id === cur.id || olds.has(k.id)) throw new KeyringError('key ids must be unique');
    olds.set(k.id, k.key);
  }
  return { current: cur, old: olds };
}

/** Seals with the current key and a fresh random IV. `aad` binds the value to its row; open needs the same one. */
export function sealToken(ring: Keyring, plain: string, aad: string): SealedToken {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', ring.current.key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const enc = [iv, ct, cipher.getAuthTag()].map((b) => b.toString('base64url'));
  return { encValue: `v1.${enc.join('.')}`, keyId: ring.current.id };
}

export function openToken(ring: Keyring, sealed: SealedToken, aad: string): string {
  try {
    const key = sealed.keyId === ring.current.id ? ring.current.key : ring.old.get(sealed.keyId);
    const parts = sealed.encValue.split('.');
    if (!key || parts.length !== 4 || parts[0] !== 'v1') throw new TokenOpenError();
    const [iv, ct, tag] = parts.slice(1).map((p) => Buffer.from(p, 'base64url')) as [
      Buffer,
      Buffer,
      Buffer,
    ];
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new TokenOpenError();
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new TokenOpenError();
  }
}
