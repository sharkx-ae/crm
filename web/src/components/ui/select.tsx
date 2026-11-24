'use client';

import type { SelectHTMLAttributes } from 'react';
import { cx } from '../../lib/cx.ts';
import { useControlA11y } from './field.tsx';
import { CONTROL, CONTROL_HEIGHT, type FieldSize } from './input.tsx';

export type SelectOption = { value: string; label: string; disabled?: boolean };

// A native <select>, as in the mockup: reliable on phones and in RTL, unlike a custom listbox.
export function Select({
  options,
  value,
  onValueChange,
  size = 'md',
  className,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'onChange' | 'children'> & {
  options: readonly SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  size?: FieldSize;
}) {
  const a11y = useControlA11y(rest);
  return (
    <select
      {...rest}
      {...a11y}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={cx(CONTROL, CONTROL_HEIGHT[size], 'cursor-pointer', className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
