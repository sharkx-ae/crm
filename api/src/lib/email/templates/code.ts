import { z } from 'zod';
import type { Locale } from '../../../contracts/common.ts';
import { frame, type Rendered } from './layout.ts';

export const schema = z.object({
  code: z.string().regex(/^\d{6}$/),
  expiresInMinutes: z.number().int().positive(),
});

export const render = (_locale: Locale, d: z.infer<typeof schema>): Rendered =>
  frame('Your SharkX CRM sign-in code', 'Your sign-in code', {
    paragraphs: ['Enter this code to finish signing in.'],
    code: d.code,
    note: `The code expires in ${d.expiresInMinutes} minutes. SharkX will never ask you for it. If you did not try to sign in, change your password.`,
  });
