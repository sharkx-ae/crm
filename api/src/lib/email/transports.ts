import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Which template produced it; only the file transport keeps it (for the e2e helper). */
  template?: string;
};

export type EmailTransport = { send(message: EmailMessage): Promise<void> };

/** Resend over HTTPS with fetch: no SDK. Errors carry the status only, never the body (it can echo the address). */
export function resendTransport(apiKey: string): EmailTransport {
  return {
    async send({ from, to, subject, text, html }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`resend responded ${res.status}`);
    },
  };
}

const MAIL_DIR = fileURLToPath(new URL('../../../.mail/', import.meta.url)); // api/.mail, git-ignored

/** Local development and e2e only: one JSON file per message, newest last by name. */
export function fileTransport(appEnv: string, dir: string = MAIL_DIR): EmailTransport {
  return {
    async send(message) {
      if (appEnv !== 'local') throw new Error('the file email transport is for APP_ENV=local only');
      await mkdir(dir, { recursive: true });
      const name = `${Date.now()}-${randomUUID().slice(0, 8)}.json`;
      await writeFile(`${dir}${name}`, `${JSON.stringify(message, null, 2)}\n`);
    },
  };
}

/** Tests: keeps messages in memory. */
export function memoryTransport(): EmailTransport & { sent: EmailMessage[]; clear(): void } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    clear: () => {
      sent.length = 0;
    },
    async send(message) {
      sent.push(message);
    },
  };
}
