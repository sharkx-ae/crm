import { z } from 'zod';
import type { Locale } from '../../../contracts/common.ts';
import { frame, type Rendered } from './layout.ts';

// English now; Arabic and French arrive in the D18 batch (until then every locale renders English).
export const schema = z.object({
  name: z.string(),
  inviterName: z.string().nullable(),
  projectName: z.string().nullable(),
  link: z.url(),
  expiresInHours: z.number().int().positive(),
});

export const render = (_locale: Locale, d: z.infer<typeof schema>): Rendered =>
  frame('You are invited to SharkX CRM', `Welcome to SharkX CRM, ${d.name}`, {
    paragraphs: [
      `${d.inviterName ?? 'Your SharkX team'} invited you to SharkX CRM${d.projectName ? ` for ${d.projectName}` : ''}.`,
      'Set your password to get started. You will sign in with your password and a code we email you.',
    ],
    button: { label: 'Set password and continue', url: d.link },
    note: `This link works once and expires in ${d.expiresInHours} hours. If you were not expecting it, ignore this email.`,
  });
