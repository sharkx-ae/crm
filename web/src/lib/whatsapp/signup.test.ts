import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ES_EXTRAS,
  isMetaOrigin,
  isQrPath,
  looksLikeSignup,
  type Pairing,
  pairingReady,
  parseSignupMessage,
  signupErrorKey,
} from './signup.ts';

// Hand-built from Meta's documented v5 shape, not recorded (see tests/fixtures/whatsapp/README.md).
const fixture = (name: string): string =>
  readFileSync(new URL(`../../../tests/fixtures/whatsapp/${name}.json`, import.meta.url), 'utf8');
const WWW = 'https://www.facebook.com';

describe('ES_EXTRAS', () => {
  it('selects Embedded Signup v5', () => {
    expect(ES_EXTRAS).toEqual({ setup: {}, version: 'v5' });
  });
});

describe('parseSignupMessage', () => {
  it('reads the v5 QR-path finish message (a JSON string, as the popup posts it)', () => {
    const m = parseSignupMessage(WWW, fixture('session-info-v5-biz-app'));
    expect(m).toEqual({
      kind: 'finish',
      session: {
        event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
        messagingAccountIds: ['100000000000001'],
        phoneNumberId: '110000000000001',
        isOnBizApp: true,
      },
    });
  });

  it('reads an already-parsed object too', () => {
    const m = parseSignupMessage(WWW, JSON.parse(fixture('session-info-v5-biz-app')));
    expect(m?.kind).toBe('finish');
  });

  it('reads the FINISH message of a new Cloud API number, which is not the QR path', () => {
    const m = parseSignupMessage('https://web.facebook.com', fixture('session-info-v5-finish'));
    expect(m?.kind).toBe('finish');
    if (m?.kind !== 'finish') throw new Error('unreachable');
    expect(m.session.event).toBe('FINISH');
    expect(isQrPath(m.session)).toBe(false);
  });

  it('only the QR path is a QR path', () => {
    const base = {
      event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' as const,
      messagingAccountIds: ['1'],
      phoneNumberId: '2',
      isOnBizApp: true,
    };
    expect(isQrPath(base)).toBe(true);
    expect(isQrPath({ ...base, isOnBizApp: false })).toBe(false);
    expect(isQrPath({ ...base, event: 'FINISH' })).toBe(false);
  });

  it('reads cancel and error messages', () => {
    const cancel = JSON.stringify({
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'CANCEL',
      data: { current_step: 'PHONE_NUMBER_SETUP' },
    });
    expect(parseSignupMessage(WWW, cancel)).toEqual({ kind: 'cancel' });
    const error = JSON.stringify({
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'ERROR',
      data: { error_code: 3441077, error_message: 'not eligible' },
    });
    expect(parseSignupMessage(WWW, error)).toEqual({
      kind: 'error',
      code: '3441077',
      message: 'not eligible',
    });
    const bare = JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR' });
    expect(parseSignupMessage(WWW, bare)).toEqual({ kind: 'error', code: null, message: null });
  });

  it('ignores messages from any other origin, even a look-alike', () => {
    const raw = fixture('session-info-v5-biz-app');
    for (const origin of [
      'https://evil.example',
      'https://www.facebook.com.evil.example',
      'http://www.facebook.com',
      'https://evilfacebook.com',
      'https://facebook.com.evil.example',
      'https://www.facebook.com:8443',
      'https://user@www.facebook.com',
      'null',
      '',
    ]) {
      expect(parseSignupMessage(origin, raw), origin).toBeNull();
    }
  });

  it('reads Meta hosts over https: facebook.com and its subdomains (www, web, business …)', () => {
    const raw = fixture('session-info-v5-biz-app');
    for (const origin of [
      'https://www.facebook.com',
      'https://web.facebook.com',
      'https://business.facebook.com',
      'https://facebook.com',
    ]) {
      expect(isMetaOrigin(origin), origin).toBe(true);
      expect(parseSignupMessage(origin, raw), origin).not.toBeNull();
    }
  });

  it('looksLikeSignup spots a signup message from any origin, for the dropped-message log', () => {
    expect(looksLikeSignup('{"type":"WA_EMBEDDED_SIGNUP","event":"FINISH"}')).toBe(true);
    expect(looksLikeSignup({ type: 'WA_EMBEDDED_SIGNUP' })).toBe(true);
    expect(looksLikeSignup('hello')).toBe(false);
    expect(looksLikeSignup(null)).toBe(false);
  });

  it('ignores what is not Embedded Signup or not JSON', () => {
    expect(parseSignupMessage(WWW, 'not json')).toBeNull();
    expect(parseSignupMessage(WWW, '42')).toBeNull();
    expect(parseSignupMessage(WWW, 'null')).toBeNull();
    expect(parseSignupMessage(WWW, JSON.stringify({ type: 'SOMETHING_ELSE' }))).toBeNull();
    expect(parseSignupMessage(WWW, undefined)).toBeNull();
  });

  it('an unexpected shape of a signup message is "unexpected", never trusted', () => {
    const odd = (data: unknown, event = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') =>
      JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data });
    for (const raw of [
      odd({ waba_id: '1', phone_number_id: '2' }), // the old v3 shape
      odd({ messaging_account_ids: [], phone_number_id: '2', is_on_biz_app: true }),
      odd({ messaging_account_ids: ['abc'], phone_number_id: '2', is_on_biz_app: true }),
      odd({ messaging_account_ids: ['1'], phone_number_id: '2', is_on_biz_app: 'yes' }),
      odd({}, 'SOMETHING'),
    ]) {
      expect(parseSignupMessage(WWW, raw), raw).toEqual({ kind: 'unexpected' });
    }
  });
});

describe('signupErrorKey', () => {
  it('maps every documented code to its plain-words message', () => {
    const expected: Record<string, string> = {
      '4563015': 'appVersion',
      '3441077': 'notEligible',
      '3441069': 'personal',
      '3441148': 'notBusinessApp',
      '3441130': 'notBusinessApp',
      '3441042': 'country',
      '2388098': 'limit',
      '3441110': 'limit',
      '3441151': 'qrRate',
      '3441112': 'qrFailed',
      '3441113': 'qrFailed',
      '3441127': 'qrFailed',
      '3441093': 'disconnecting',
      '3441145': 'disconnecting',
      '3441091': 'otherProvider',
      '3441079': 'otherProvider',
      '3441095': 'otherProvider',
      '2655093': 'otherProvider',
      '3441107': 'notEnabled',
      '3441126': 'notEnabled',
      '2655111': 'notEnabled',
    };
    for (const [code, key] of Object.entries(expected)) {
      expect(signupErrorKey(code), code).toBe(key);
      expect(signupErrorKey(Number(code)), code).toBe(key);
    }
  });

  it('is null for a code we have no wording for, and for garbage', () => {
    for (const code of ['1', '999999', 'abc', '', '3441077.5', null]) {
      expect(signupErrorKey(code), String(code)).toBeNull();
    }
  });
});

describe('pairingReady', () => {
  const session = {
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' as const,
    messagingAccountIds: ['1'],
    phoneNumberId: '2',
    isOnBizApp: true,
  };
  it('needs the code and the session info', () => {
    const cases: [Pairing, boolean][] = [
      [{}, false],
      [{ code: 'c' }, false],
      [{ session }, false],
      [{ code: '', session }, false],
      [{ code: 'c', session }, true],
    ];
    for (const [p, ready] of cases) expect(pairingReady(p)).toBe(ready);
  });
});
