import { z } from 'zod';
import type { Locale } from '../../../contracts/common.ts';
import { frame, type Rendered } from './layout.ts';

// Goes to ALERT_EMAIL. The message is already redacted by reportError.
export const schema = z.object({
  fingerprint: z.string(),
  message: z.string(),
  appEnv: z.string(),
});

export const render = (_locale: Locale, d: z.infer<typeof schema>): Rendered =>
  frame(`[${d.appEnv}] SharkX CRM alert`, 'Something needs attention', {
    paragraphs: [`Fingerprint: ${d.fingerprint}`, d.message],
    note: 'Identical alerts are sent at most once an hour. The full record is in error_log.',
  });
