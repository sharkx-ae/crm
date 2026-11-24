'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/cx.ts';
import { useControlA11y } from './field.tsx';

export type FieldSize = 'md' | 'sm';

// Shared by Input, Textarea and Select: 40px (34 small), 10px radius, a strong hairline, 3px red focus ring.
// Placeholder uses sx-muted: the brand does not allow #a49f9f for text on white.
export const CONTROL =
  'focus-ring block w-full min-w-0 rounded-field border border-sx-line bg-sx-paper px-3 text-body text-sx-black placeholder:text-sx-muted focus-visible:border-sx-black disabled:cursor-not-allowed disabled:opacity-60';
export const CONTROL_HEIGHT: Record<FieldSize, string> = {
  md: 'h-10',
  sm: 'h-[34px] text-label',
};

// Emails, phone numbers, passwords and times keep their LTR order inside Arabic pages; names and free
// text follow the direction of what the user typed.
const LTR_TYPES = new Set([
  'email',
  'tel',
  'url',
  'password',
  'number',
  'time',
  'date',
  'datetime-local',
]);

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: FieldSize };

export function Input({ size = 'md', className, type = 'text', dir, ...rest }: InputProps) {
  const a11y = useControlA11y(rest);
  return (
    <input
      {...rest}
      {...a11y}
      type={type}
      dir={dir ?? (LTR_TYPES.has(type) ? 'ltr' : 'auto')}
      className={cx(CONTROL, CONTROL_HEIGHT[size], className)}
    />
  );
}

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> & {
  size?: FieldSize;
};

export function Textarea({ size = 'md', className, dir, ...rest }: TextareaProps) {
  const a11y = useControlA11y(rest);
  return (
    <textarea
      {...rest}
      {...a11y}
      dir={dir ?? 'auto'}
      className={cx(
        CONTROL,
        'min-h-[84px] resize-y py-2.5',
        size === 'sm' && 'text-label',
        className,
      )}
    />
  );
}
