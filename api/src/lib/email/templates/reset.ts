import { z } from 'zod';
import type { Locale } from '../../../contracts/common.ts';
import { frame, type Rendered } from './layout.ts';

export const schema = z.object({ link: z.url(), expiresInMinutes: z.number().int().positive() });

export const render = (_locale: Locale, d: z.infer<typeof schema>): Rendered =>
  frame('Reset your SharkX CRM password', 'Reset your password', {
    paragraphs: ['Use the button below to choose a new password.'],
    button: { label: 'Choose a new password', url: d.link },
    note: `This link works once and expires in ${d.expiresInMinutes} minutes. If you did not ask for it, ignore this email: your password has not changed.`,
  });
