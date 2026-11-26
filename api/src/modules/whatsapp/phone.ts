import { e164 } from '../../contracts/common.ts';

/**
 * Meta's `display_phone_number` always carries the country code ("+1 555-010-0001"), so this keeps the digits, puts a `+`
 * in front and checks the E.164 shape. No libphonenumber: nothing here guesses a country.
 */
export function toE164(displayPhoneNumber: string): string {
  const digits = displayPhoneNumber.replace(/\D/g, '');
  const out = e164.safeParse(`+${digits}`);
  if (!out.success) throw new RangeError('not an E.164 number');
  return out.data;
}
