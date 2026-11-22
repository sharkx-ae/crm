import { sendEmail } from '../../lib/email/index.ts';
import type { JobHandler } from '../run-job.ts';

// `email.send`: alerts and (later) reminders and connection emails. Never invite, code or reset mails: those carry
// a secret and are sent directly from their request. A thrown error makes pg-boss retry with backoff.
export const emailSend: JobHandler<'email.send'> = async (data) => {
  await sendEmail(data);
};

/** Alerts are grouped by their own fingerprint, so a failing alert mail is recognised and never alerts again. */
export const emailTag = (data: { template: string }): string => data.template;
