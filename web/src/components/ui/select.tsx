'use client';

import { Select as RadixSelect } from 'radix-ui';
import { cx } from '../../lib/cx.ts';
import { useControlA11y } from './field.tsx';
import { Icon } from './icons.tsx';
import { CONTROL_BASE, CONTROL_HEIGHT, type FieldSize } from './input.tsx';
import { MENU_ITEM, MENU_SURFACE } from './menu-styles.ts';

export type SelectOption = { value: string; label: string; disabled?: boolean };

// Radix refuses an item whose value is "" (that is how it shows the placeholder). Filters need exactly that value
// ("All sources"), so an empty option travels as this token inside the wrapper and is mapped back on the way out.
const EMPTY = '__all__';

/**
 * The list is a Radix Select: the same surface and rows as the other menus, keyboard and typeahead, and correct in RTL
 * (the locale layout gives Radix its direction). Full width by default (forms); `fit` is the toolbar width (150px
 * and up, as wide as its text, two to a row on a phone). The props are the old native select's: `options`, `value`, `onValueChange`, `size`.
 */
export function Select({
  options,
  value,
  onValueChange,
  size = 'md',
  fit = false,
  placeholder,
  disabled,
  name,
  required,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...rest
}: {
  options: readonly SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  size?: FieldSize;
  /** Toolbar width instead of full width. */
  fit?: boolean;
  /** Shown while `value` is "" and no option has that value. */
  placeholder?: string;
  disabled?: boolean | undefined;
  name?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  id?: string | undefined;
  'aria-label'?: string | undefined;
  'aria-labelledby'?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' | undefined;
}) {
  const a11y = useControlA11y(rest);
  const hasEmptyOption = options.some((o) => o.value === '');
  const toRadix = (v: string) => (v === '' && hasEmptyOption ? EMPTY : v);
  const fromRadix = (v: string) => (v === EMPTY ? '' : v);

  return (
    <RadixSelect.Root
      value={toRadix(value)}
      onValueChange={(v) => onValueChange(fromRadix(v))}
      disabled={disabled}
      name={name}
      required={required}
    >
      <RadixSelect.Trigger
        {...a11y}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cx(
          CONTROL_BASE,
          CONTROL_HEIGHT[size],
          'flex cursor-pointer items-center justify-between gap-2 text-start transition-colors duration-150 hover:border-sx-black disabled:hover:border-sx-line',
          // `fit`: 150px and up; where two would not fit a row (a 360px toolbar) each takes half of it instead.
          fit ? 'w-auto min-w-[min(150px,calc(50%-6px))]' : 'w-full min-w-0',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {/* The label is passed in, so the server renders it too (Radix fills the value in only after mounting). */}
          <RadixSelect.Value placeholder={placeholder}>
            {options.find((o) => o.value === value)?.label}
          </RadixSelect.Value>
        </span>
        <RadixSelect.Icon asChild>
          <Icon name="down" size="sm" className="text-sx-muted" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className={cx(
            MENU_SURFACE,
            'min-w-(--radix-select-trigger-width) max-h-[min(320px,var(--radix-select-content-available-height))] max-w-[min(360px,calc(100vw-16px))]',
          )}
        >
          <RadixSelect.Viewport>
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={toRadix(o.value)}
                disabled={o.disabled}
                className={cx(MENU_ITEM, 'data-[state=checked]:font-semibold')}
              >
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="ms-auto flex-none">
                  <Icon name="check" size="sm" className="text-sx-red" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
