'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { inputClass, labelClass } from './ui.ts';

// Password input with a show/hide toggle. The toggle sits at the inline end, so it mirrors in Arabic.
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
  invalid?: boolean;
}) {
  const t = useTranslations('auth.password');
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required
          maxLength={128}
          className={`${inputClass} pe-14`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t('hide') : t('show')}
          aria-pressed={shown}
          className="absolute inset-y-0 end-0 flex w-12 cursor-pointer items-center justify-center rounded-xl text-sx-muted focus-visible:outline-3 focus-visible:outline-sx-red"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {shown ? <path d="M3 3l18 18" /> : null}
          </svg>
        </button>
      </div>
    </div>
  );
}
