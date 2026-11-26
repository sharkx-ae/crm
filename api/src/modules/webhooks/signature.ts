import { timingSafeEqual } from 'node:crypto';
import { hmacSha256 } from '../../lib/crypto/index.ts';

const HEADER = /^sha256=([0-9a-f]{64})$/;

/**
 * Meta's `X-Hub-Signature-256`: `sha256=` + lower-case hex HMAC-SHA256 of the EXACT bytes received, keyed with the app
 * secret. The check runs on the raw buffer (never a re-serialised body, which would not match Meta's escaped unicode)
 * and compares the 32-byte digests in constant time. Anything malformed (missing, `sha1=`, upper case, wrong length)
 * is simply false.
 */
export function verifyMetaSignature(
  raw: Buffer,
  header: string | string[] | undefined,
  appSecret: string,
): boolean {
  if (typeof header !== 'string') return false;
  const hex = HEADER.exec(header)?.[1];
  if (!hex) return false;
  return timingSafeEqual(hmacSha256(appSecret, raw), Buffer.from(hex, 'hex'));
}
