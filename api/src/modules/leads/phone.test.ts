import { describe, expect, it } from 'vitest';
import { normalisePhone, regionOf } from './phone.ts';

const e164 = (raw: string, city: string | null = 'Dubai') => {
  const r = normalisePhone(raw, city);
  return r?.valid ? r.e164 : r;
};

describe('regionOf', () => {
  it('maps the client cities to their country, UAE by default', () => {
    expect(regionOf('Dubai')).toBe('AE');
    expect(regionOf(' abu dhabi ')).toBe('AE');
    expect(regionOf('Morocco')).toBe('MA');
    expect(regionOf(null)).toBe('AE');
    expect(regionOf('Paris')).toBe('AE');
  });
});

describe('normalisePhone', () => {
  it('UAE mobile in every common spelling becomes the same E.164', () => {
    for (const raw of [
      '050 412 7781',
      '0504127781',
      '+971 50 412 7781',
      '00971504127781',
      '971504127781',
    ]) {
      expect(e164(raw), raw).toBe('+971504127781');
    }
  });

  it('UAE landline', () => {
    expect(e164('04 555 0192')).toBe('+97145550192');
  });

  it('Moroccan mobile, read in Morocco for a Moroccan client', () => {
    expect(e164('06 61 23 45 78', 'Morocco')).toBe('+212661234578');
    expect(e164('+212 6 61 23 45 78', 'Morocco')).toBe('+212661234578');
  });

  it('an international number keeps its own country whatever the client city', () => {
    expect(e164('+212 6 61 23 45 78', 'Dubai')).toBe('+212661234578');
    expect(e164('+44 7911 123456', 'Dubai')).toBe('+447911123456');
  });

  it('gives a readable international display form', () => {
    expect(normalisePhone('0504127781', 'Dubai')).toEqual({
      valid: true,
      e164: '+971504127781',
      display: '+971 50 412 7781',
    });
  });

  it('garbage is kept raw and flagged invalid', () => {
    expect(normalisePhone(' call me ', 'Dubai')).toEqual({ valid: false, raw: 'call me' });
    expect(normalisePhone('123', 'Dubai')).toEqual({ valid: false, raw: '123' });
  });

  it('empty input is "no phone", not an invalid phone', () => {
    expect(normalisePhone('', 'Dubai')).toBeNull();
    expect(normalisePhone('   ', 'Dubai')).toBeNull();
    expect(normalisePhone(undefined, 'Dubai')).toBeNull();
  });
});
