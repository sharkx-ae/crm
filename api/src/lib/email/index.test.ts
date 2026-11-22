import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailEnvSchema, parseEnv } from '../env.ts';
import { AppError } from '../errors/index.ts';
import {
  fileTransport,
  memoryTransport,
  pickTransport,
  resendTransport,
  sendEmail,
  setEmailTransport,
} from './index.ts';
import { renderTemplate } from './templates/index.ts';

afterEach(() => {
  setEmailTransport(undefined);
  vi.unstubAllGlobals();
});

const LINK = 'http://localhost:3000/en/accept-invite/abc_DEF-123';
const samples = {
  invite: {
    name: 'Omar',
    inviterName: 'Alex',
    projectName: 'Acme Real Estate',
    link: LINK,
    expiresInHours: 72,
  },
  code: { code: '042517', expiresInMinutes: 10 },
  reset: { link: 'http://localhost:3000/en/reset/abc_DEF-123', expiresInMinutes: 60 },
  alert: {
    fingerprint: 'job:email.send:invite',
    message: 'job failed after 5 attempts',
    appEnv: 'staging',
  },
} as const;

describe('templates', () => {
  it.each(Object.keys(samples) as (keyof typeof samples)[])(
    '%s renders English with nothing undefined, in text and html',
    (name) => {
      const out = renderTemplate(name, 'en', samples[name]);
      for (const part of [out.subject, out.text, out.html]) {
        expect(part).not.toMatch(/undefined|\[object|null/);
        expect(part.length).toBeGreaterThan(10);
      }
      expect(out.html).toContain('SHARKX');
      expect(out.html).toContain('#e70101');
    },
  );

  it('the code and the links are in both the text and the html part', () => {
    const code = renderTemplate('code', 'en', samples.code);
    expect(code.text).toContain('042517');
    expect(code.html).toContain('042517');
    const invite = renderTemplate('invite', 'en', samples.invite);
    expect(invite.text).toContain(LINK);
    expect(invite.html).toContain(LINK);
    expect(invite.text).toContain('Acme Real Estate');
  });

  it('an invite without an inviter or a project still reads well', () => {
    const out = renderTemplate('invite', 'en', {
      ...samples.invite,
      inviterName: null,
      projectName: null,
    });
    expect(out.text).toContain('Your SharkX team invited you to SharkX CRM.');
  });

  it('escapes html in names', () => {
    const out = renderTemplate('invite', 'en', {
      ...samples.invite,
      name: '<script>alert(1)</script>',
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('refuses data that does not match the template', () => {
    expect(() => renderTemplate('code', 'en', { code: '12' })).toThrow();
    expect(() => renderTemplate('invite', 'en', { name: 'x' })).toThrow();
  });

  it('other locales render English until the D18 batch', () => {
    expect(renderTemplate('code', 'ar', samples.code).subject).toBe(
      renderTemplate('code', 'en', samples.code).subject,
    );
  });

  it('no email carries a password', () => {
    for (const [name, data] of Object.entries(samples)) {
      const out = renderTemplate(name as keyof typeof samples, 'en', data);
      expect(out.text.toLowerCase()).not.toMatch(/your password is/);
    }
  });
});

describe('sendEmail', () => {
  it('hands the rendered message to the transport', async () => {
    const mem = memoryTransport();
    setEmailTransport(mem);
    await sendEmail({ to: 'omar@example.com', template: 'code', locale: 'en', data: samples.code });
    expect(mem.sent).toHaveLength(1);
    expect(mem.sent[0]).toMatchObject({ to: 'omar@example.com', template: 'code' });
    expect(mem.sent[0]?.text).toContain('042517');
    expect(mem.sent[0]?.from).toMatch(/SharkX/);
  });

  it('a transport failure is INTEGRATION_ERROR', async () => {
    setEmailTransport({
      send: async () => {
        throw new Error('smtp down for omar@example.com');
      },
    });
    const err = await sendEmail({
      to: 'omar@example.com',
      template: 'code',
      locale: 'en',
      data: samples.code,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('INTEGRATION_ERROR');
    expect((err as AppError).message).not.toContain('omar');
  });
});

describe('transports', () => {
  it('file transport writes one json file per message, in local only', async () => {
    const dir = `${await mkdtemp(join(tmpdir(), 'mail-'))}/`;
    const msg = {
      from: 'a',
      to: 'b@example.com',
      subject: 's',
      text: 'code 123456',
      html: '<p/>',
      template: 'code',
    };
    await fileTransport('local', dir).send(msg);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(JSON.parse(await readFile(join(dir, files[0] as string), 'utf8'))).toMatchObject({
      to: 'b@example.com',
      text: 'code 123456',
    });
    await expect(fileTransport('staging', dir).send(msg)).rejects.toThrow(/local/);
    await expect(fileTransport('production', dir).send(msg)).rejects.toThrow(/local/);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it('resend transport posts JSON with the key and reports the status only', async () => {
    const fetchMock = vi.fn(
      async () => new Response('{"error":"bad address omar@example.com"}', { status: 422 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const t = resendTransport('re_key');
    const msg = {
      from: 'SharkX <a@b.co>',
      to: 'omar@example.com',
      subject: 's',
      text: 't',
      html: 'h',
    };
    const err = await t.send(msg).catch((e: unknown) => e);
    expect((err as Error).message).toBe('resend responded 422');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: msg.from,
      to: ['omar@example.com'],
      subject: 's',
      text: 't',
      html: 'h',
    });
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(t.send(msg)).resolves.toBeUndefined();
  });

  it('picks resend with a key, files locally without one, and refuses anything else', () => {
    expect(pickTransport({ APP_ENV: 'staging', RESEND_API_KEY: 'k' })).toHaveProperty('send');
    expect(pickTransport({ APP_ENV: 'local' })).toHaveProperty('send');
    expect(() => pickTransport({ APP_ENV: 'production' })).toThrow(/RESEND_API_KEY/);
  });
});

describe('email env', () => {
  it('requires the key, sender and alert inbox outside local', () => {
    expect(() => parseEnv(emailEnvSchema, { APP_ENV: 'staging' }, 'email')).toThrow(
      /RESEND_API_KEY[\s\S]*EMAIL_FROM[\s\S]*ALERT_EMAIL/,
    );
    expect(parseEnv(emailEnvSchema, { APP_ENV: 'local' }, 'email').APP_ENV).toBe('local');
  });
});
