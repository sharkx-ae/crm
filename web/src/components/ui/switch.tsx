'use client';

import { Switch as RadixSwitch } from 'radix-ui';
import { cx } from '../../lib/cx.ts';

// An on/off toggle. `label` is the accessible name (there is no visible text inside the control).
// The thumb moves along `inset-inline-start`, so it mirrors in RTL without extra work.
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cx(
        'focus-ring relative h-6 w-10 flex-none cursor-pointer rounded-full bg-sx-faint data-[state=checked]:bg-sx-red disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    >
      <RadixSwitch.Thumb className="absolute start-[3px] top-[3px] block size-[18px] rounded-full bg-white transition-[inset-inline-start] data-[state=checked]:start-[19px]" />
    </RadixSwitch.Root>
  );
}
