import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon, type IconName } from './icons.tsx';

// One primary (red) button per view; everything else is secondary (black outline) or ghost. The default is
// secondary so a forgotten prop never adds a second red button.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const BASE =
  'focus-ring inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap border font-label no-underline transition-[color,background-color,border-color,box-shadow,transform,filter] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45';
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-sx-red bg-sx-red text-white hover:brightness-90 hover:shadow-sx-md',
  secondary: 'border-sx-black bg-sx-paper text-sx-black hover:bg-sx-shell',
  ghost: 'border-transparent bg-transparent text-sx-black hover:bg-sx-shell',
};
const SIZE: Record<ButtonSize, string> = {
  md: 'h-[38px] rounded-btn px-4 text-body',
  sm: 'h-8 rounded-field px-3 text-label',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Disables the button, marks it busy and swaps the icon for a spinner. The label stays. */
  loading?: boolean;
  /** Style the single child (a link) as a button instead of rendering a <button>. */
  asChild?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  asChild = false,
  className,
  type,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const classes = cx(BASE, VARIANT[variant], SIZE[size], className);
  const lead = loading ? (
    <Icon name="refresh" size="sm" className="animate-spin" />
  ) : icon ? (
    <Icon name={icon} size="sm" />
  ) : null;
  const off = disabled || loading;

  if (asChild) {
    // A link cannot be `disabled`; aria-disabled plus pointer-events keeps it inert.
    return (
      <Slot.Root
        className={classes}
        aria-disabled={off || undefined}
        aria-busy={loading || undefined}
        {...rest}
      >
        {lead}
        <Slot.Slottable>{children}</Slot.Slottable>
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={off}
      aria-busy={loading || undefined}
      {...rest}
    >
      {lead}
      {children}
    </button>
  );
}

// A 40px icon-only button. The label is mandatory: it becomes the accessible name.
export function IconButton({
  label,
  icon,
  badgeDot = false,
  className,
  type,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  label: string;
  icon: IconName;
  /** A small red dot on the corner (unread, to fix). */
  badgeDot?: boolean;
}) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      className={cx(
        'focus-ring relative grid size-10 cursor-pointer place-items-center rounded-field text-sx-black transition-colors duration-150 hover:bg-sx-shell disabled:cursor-default disabled:opacity-30',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} />
      {badgeDot ? (
        <span
          aria-hidden="true"
          className="absolute end-2.5 top-[9px] box-content size-[9px] rounded-full border-2 border-white bg-sx-red"
        />
      ) : null}
    </button>
  );
}
