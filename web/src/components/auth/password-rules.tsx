'use client';

import { useTranslations } from 'next-intl';

// Live version of the contract rule (contracts `password`): 12+ characters, a letter and a number.
export const passwordChecks = (pw: string) => ({
  length: pw.length >= 12,
  letter: /[A-Za-z]/.test(pw),
  number: /\d/.test(pw),
});

export const passwordOk = (pw: string) => Object.values(passwordChecks(pw)).every(Boolean);

export function PasswordRules({ value, id }: { value: string; id: string }) {
  const t = useTranslations('auth.password');
  const checks = passwordChecks(value);
  const items = [
    ['length', t('ruleLength')],
    ['letter', t('ruleLetter')],
    ['number', t('ruleNumber')],
  ] as const;
  return (
    <div id={id} className="mt-3">
      <p className="mb-1 text-sm font-semibold text-sx-black">{t('rules')}</p>
      <ul className="m-0 list-none space-y-1 p-0 text-sm">
        {items.map(([key, label]) => (
          <li key={key} className="flex items-center gap-2 text-sx-black">
            {/* Shape plus a text label, never colour alone */}
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className={`size-4 shrink-0 ${checks[key] ? 'text-sx-success' : 'text-sx-faint'}`}
            >
              {checks[key] ? (
                <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" />
              ) : (
                <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
              )}
            </svg>
            <span>{label}</span>
            <span className="sr-only">{checks[key] ? t('met') : t('unmet')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
