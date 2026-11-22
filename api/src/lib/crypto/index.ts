// Node built-in crypto only (no dependency). Passwords: scrypt; tokens: 256-bit random, only the sha256 is stored.
import {
  createHash,
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
