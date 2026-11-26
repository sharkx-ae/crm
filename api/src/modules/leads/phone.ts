import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';

// Phone normalisation for ingestLead (F4a S1, CONTRACTS §4): every stored phone is E.164. A local number is read in
// the client's country (Dubai and Abu Dhabi → UAE, Morocco → Morocco); an international one keeps its own country.

export type NormalisedPhone =
  | { valid: true; e164: string; display: string }
  | { valid: false; raw: string };

const REGION_BY_CITY: Record<string, CountryCode> = {
  dubai: 'AE',
  'abu dhabi': 'AE',
  morocco: 'MA',
  casablanca: 'MA',
};

/** The default region for a client's city; UAE when the city is unknown (most clients are in the UAE). */
export function regionOf(city: string | null | undefined): CountryCode {
  return REGION_BY_CITY[(city ?? '').trim().toLowerCase()] ?? 'AE';
}

/**
 * `{ valid: true, e164, display }` for a real number, otherwise `{ valid: false, raw }` with the trimmed input, so
 * ingestLead keeps the raw value on the lead's creation event and never matches on it.
 */
export function normalisePhone(
  raw: string | null | undefined,
  city: string | null | undefined,
): NormalisedPhone | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const parsed = parsePhoneNumberFromString(text, regionOf(city));
  if (!parsed?.isValid()) return { valid: false, raw: text };
  return { valid: true, e164: parsed.number, display: parsed.formatInternational() };
}
