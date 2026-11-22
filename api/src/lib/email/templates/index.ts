import type { Locale } from '../../../contracts/common.ts';
import type { EmailTemplate } from '../../../contracts/jobs.ts';
import * as alert from './alert.ts';
import * as code from './code.ts';
import * as invite from './invite.ts';
import type { Rendered } from './layout.ts';
import * as reset from './reset.ts';

export type { Rendered };

/**
 * Validates `data` against the template's own schema, then renders: a caller that forgets a field fails
 * loudly instead of sending "undefined". One case per `emailTemplate` value; TypeScript flags a missing one.
 */
export function renderTemplate(template: EmailTemplate, locale: Locale, data: unknown): Rendered {
  switch (template) {
    case 'invite':
      return invite.render(locale, invite.schema.parse(data));
    case 'code':
      return code.render(locale, code.schema.parse(data));
    case 'reset':
      return reset.render(locale, reset.schema.parse(data));
    case 'alert':
      return alert.render(locale, alert.schema.parse(data));
  }
}
