'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';

export const CODE_LENGTH = 6;

/** What a paste or a typed value turns into: digits only, at most six. */
export const digitsOnly = (s: string): string => s.replace(/\D/g, '').slice(0, CODE_LENGTH);

// Six boxes of 52x56px (mockup `.codebox`; over the 44px tap-target minimum), 10px apart (8px under 400px), with
// auto-advance, backspace-to-previous, arrows and paste of the whole code. The row is `dir="ltr"` so the digits keep
// their order in Arabic, which also makes ArrowLeft/ArrowRight match what is on screen. In an RTL page the row sits at
// the inline start (the right) like the text above it. They shrink (max 52px) when the column is narrower than 362px.
const BOX =
  'focus-ring block h-14 min-w-0 max-w-[52px] flex-1 rounded-btn border border-sx-line bg-sx-paper p-0 text-center text-[22px] font-heading tabular-nums text-sx-black focus-visible:border-sx-black aria-invalid:border-sx-bad disabled:cursor-not-allowed disabled:opacity-60';
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
    <fieldset dir="ltr" className="m-0 flex min-w-0 gap-2 border-0 p-0 min-[400px]:gap-2.5 rtl:justify-end">
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
          className={BOX}
        />
      ))}
    </fieldset>
  );
}
