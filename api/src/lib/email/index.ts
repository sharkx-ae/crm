import type { Locale } from '../../contracts/common.ts';
import type { EmailTemplate } from '../../contracts/jobs.ts';
import { getEmailEnv } from '../env.ts';
import { AppError } from '../errors/index.ts';
import { renderTemplate } from './templates/index.ts';
import { type EmailTransport, fileTransport, resendTransport } from './transports.ts';

export type { EmailTransport } from './transports.ts';
export { fileTransport, memoryTransport, resendTransport } from './transports.ts';

type EmailEnv = { APP_ENV: string; RESEND_API_KEY?: string; EMAIL_FROM?: string };

const LOCAL_FROM = 'SharkX CRM <no-reply@sharkx.local>';

/** Resend when a key is set; otherwise files, which is only allowed locally (env validation requires a key elsewhere). */
export function pickTransport(env: EmailEnv): EmailTransport {
  if (env.RESEND_API_KEY) return resendTransport(env.RESEND_API_KEY);
  if (env.APP_ENV === 'local') return fileTransport(env.APP_ENV);
  throw new Error(`no email transport: RESEND_API_KEY is required when APP_ENV=${env.APP_ENV}`);
}

let override: EmailTransport | undefined;
/** Tests install a memory transport here; pass undefined to go back to the configured one. */
export function setEmailTransport(t: EmailTransport | undefined): void {
  override = t;
}

/**
 * The only way mail leaves the system. Invite, code and reset mails are called directly by their request
 * (they carry a secret, so they never sit in the queue); alerts and reminders go through the `email.send` job.
 */
export async function sendEmail(msg: {
  to: string;
  template: EmailTemplate;
  locale: Locale;
  data: unknown;
}): Promise<void> {
  const rendered = renderTemplate(msg.template, msg.locale, msg.data);
  const env = getEmailEnv();
  try {
    const transport = override ?? pickTransport(env);
    await transport.send({
      from: env.EMAIL_FROM ?? LOCAL_FROM,
      to: msg.to,
      template: msg.template,
      ...rendered,
    });
  } catch (cause) {
    // The cause is kept for error_log (redacted there); the caller sees only that the provider failed.
    throw new AppError('INTEGRATION_ERROR', { cause });
  }
}
