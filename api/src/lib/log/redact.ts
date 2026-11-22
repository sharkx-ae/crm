// One redaction for logs, audit meta and error reports (CLAUDE.md: never PII, tokens or message bodies).
// Keys that name sensitive data are dropped; strings that look like an email, a phone number or a secret are masked.
const MAX_DEPTH = 6;
const MAX_ITEMS = 50;
const MAX_STRING = 500;

// Dropped when the key contains one of these (`pwHash`, `accessToken`, `phoneE164`, `maskedEmail`…).
const DENIED_PARTS = [
  'password',
  'passwd',
  'token',
  'secret',
  'cookie',
  'authorization',
  'phone',
  'email',
  'hash',
];
// Dropped only on an exact match: `code` is a sign-in code, but `errorCode` is fine.
const DENIED_EXACT = new Set(['code', 'text', 'body', 'message_body', 'subject']);

export const isDeniedKey = (key: string): boolean => {
  const k = key.toLowerCase();
  return DENIED_EXACT.has(k) || DENIED_PARTS.some((p) => k.includes(p));
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const E164 = /\+[1-9]\d{6,14}/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG = /[A-Za-z0-9_-]{20,}/g;

// A long run of base64url characters with both letters and digits is a token or key; plain snake_case
// names (`user_status_changed_to_x`) and UUIDs are not.
const looksSecret = (s: string) => !UUID.test(s) && /[A-Za-z]/.test(s) && /\d/.test(s);

export function redactString(s: string): string {
  const cut = s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s;
  return cut
    .replace(EMAIL, '[email]')
    .replace(E164, '[phone]')
    .replace(LONG, (m) => (looksSecret(m) ? '[token]' : m));
}

/** Returns a JSON-safe copy: sensitive keys removed, sensitive strings masked, depth and size bounded. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name }; // messages can echo values
  if (depth >= MAX_DEPTH) return '[deep]';
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      if (!isDeniedKey(k) && v !== undefined) out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return undefined; // functions, symbols
}

export const redactRecord = (value: Record<string, unknown>): Record<string, unknown> =>
  redact(value) as Record<string, unknown>;
