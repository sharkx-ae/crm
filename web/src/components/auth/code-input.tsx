'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { inputClass } from './ui.ts';

export const CODE_LENGTH = 6;

/** What a paste or a typed value turns into: digits only, at most six. */
export const digitsOnly = (s: string): string => s.replace(/\D/g, '').slice(0, CODE_LENGTH);

// Six boxes with auto-advance, backspace-to-previous and paste of the whole code. Digits keep their order in RTL (dir="ltr").
export function CodeInput({
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations('auth.code');
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[Math.min(Math.max(i, 0), CODE_LENGTH - 1)]?.focus();

  function setAt(i: number, raw: string) {
    const typed = digitsOnly(raw);
    if (typed.length === 0) {
      onChange(value.slice(0, i) + value.slice(i + 1));
      return;
    }
    // A paste into any box fills from there; a single digit replaces this box.
    const next = digitsOnly(value.slice(0, i) + typed + value.slice(i + 1));
    onChange(typed.length > 1 ? digitsOnly(value.slice(0, i) + typed) : next);
    focus(i + typed.length);
  }

  return (
    <fieldset dir="ltr" className="m-0 flex min-w-0 justify-between gap-2 border-0 p-0">
      <legend className="sr-only">{t('label')}</legend>
      {Array.from({ length: CODE_LENGTH }, (_, i) => (
        <input
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed six boxes, positions never reorder
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={CODE_LENGTH} // lets a paste arrive whole; setAt trims it
          value={value[i] ?? ''}
          disabled={disabled}
          aria-label={t('digit', { n: i + 1 })}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => setAt(i, e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i]) focus(i - 1);
            else if (e.key === 'ArrowLeft') focus(i - 1);
            else if (e.key === 'ArrowRight') focus(i + 1);
          }}
          className={`${inputClass} ps-0 pe-0 text-center text-xl font-bold tabular-nums`}
        />
      ))}
    </fieldset>
  );
}
