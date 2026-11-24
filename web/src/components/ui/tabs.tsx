'use client';

import { Tabs as RadixTabs } from 'radix-ui';
import { createContext, type ReactNode, useContext } from 'react';
import { cx } from '../../lib/cx.ts';

// Tabs here are the list and its triggers. The URL drives which content shows (filters, the open tab and the page
// size live in the address so a refresh keeps them), so the page passes `value` from the URL and navigates in
// `onValueChange`. Wrap the content in <TabsPanel value={...}> so each trigger points at a real panel.
// Activation is manual: arrow keys move focus, Enter, Space or a click activates. A change is a server round trip,
// so it must not fire on every arrow press, nor twice for one click (mouse-down, then focus) while the URL catches up.
export type TabsVariant = 'underline' | 'ribbon';
const VariantContext = createContext<TabsVariant>('underline');

export function Tabs({
  value,
  onValueChange,
  variant = 'underline',
  children,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  /** `underline` for settings and filters; `ribbon` for the Leads state tabs (figure, label and colour key). */
  variant?: TabsVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <VariantContext.Provider value={variant}>
      <RadixTabs.Root
        value={value}
        onValueChange={onValueChange}
        activationMode="manual"
        className={className}
      >
        {children}
      </RadixTabs.Root>
    </VariantContext.Provider>
  );
}

const LIST: Record<TabsVariant, string> = {
  underline: 'flex gap-6 overflow-x-auto border-sx-border border-b',
  ribbon: 'flex overflow-x-auto border-sx-border border-b',
};

export function TabsList({
  label,
  children,
  className,
}: {
  /** Accessible name of the tab list ("Lead status", "Settings"). */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const variant = useContext(VariantContext);
  return (
    <RadixTabs.List aria-label={label} className={cx(LIST[variant], className)}>
      {children}
    </RadixTabs.List>
  );
}

// The ring is drawn inside the trigger: the list scrolls sideways, which would clip an outside ring.
const RING =
  'focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-sx-red cursor-pointer';
const TRIGGER: Record<TabsVariant, string> = {
  underline:
    '-mb-px flex items-baseline gap-1.5 whitespace-nowrap border-transparent border-b-2 py-2.5 font-label text-sx-muted hover:text-sx-black data-[state=active]:border-sx-red data-[state=active]:font-heading data-[state=active]:text-sx-black',
  ribbon:
    'group -mb-px flex min-w-[96px] shrink-0 grow flex-col border-transparent border-b-[3px] px-4 pt-3.5 pb-3 text-start hover:bg-sx-page data-[state=active]:border-sx-red not-first:border-s not-first:border-s-sx-border rail:min-w-[116px] rail:px-6',
};

// The colour key of a ribbon tab: the same four states as the chips and the state bar.
export type TabKeyTone = 'new' | 'mql' | 'sql' | 'nq';
const KEY: Record<TabKeyTone, string> = {
  new: 'bg-sx-paper shadow-[inset_0_0_0_1.5px_var(--color-sx-faint)]',
  mql: 'bg-sx-red-mid',
  sql: 'bg-sx-red',
  nq: 'bg-sx-black',
};

export function TabsTrigger({
  value,
  count,
  keyTone,
  hot = false,
  children,
}: {
  value: string;
  /** A number beside the label (underline) or the big figure above it (ribbon). Format it before passing. */
  count?: ReactNode;
  /** Ribbon only: the colour key dot before the label. */
  keyTone?: TabKeyTone;
  /** Ribbon only: the figure turns red (something is waiting). */
  hot?: boolean;
  children: ReactNode;
}) {
  const variant = useContext(VariantContext);
  const hasCount = count !== undefined && count !== null;
  return (
    <RadixTabs.Trigger value={value} className={cx(RING, TRIGGER[variant])}>
      {variant === 'ribbon' ? (
        <>
          {hasCount ? (
            <span
              className={cx(
                'font-heading text-figure leading-tight tabular-nums',
                hot && 'text-sx-red',
              )}
            >
              {count}
            </span>
          ) : null}
          <span className="flex items-center gap-1.5 whitespace-nowrap font-label text-label text-sx-muted group-data-[state=active]:text-sx-black">
            {keyTone ? (
              <span
                aria-hidden="true"
                className={cx('size-2 flex-none rounded-full', KEY[keyTone])}
              />
            ) : null}
            {children}
          </span>
        </>
      ) : (
        <>
          <span>{children}</span>
          {hasCount ? (
            <span className="font-body text-label text-sx-muted tabular-nums">{count}</span>
          ) : null}
        </>
      )}
    </RadixTabs.Trigger>
  );
}

/** The content for one tab. Only the active panel is mounted. */
export function TabsPanel({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.Content value={value} className={className}>
      {children}
    </RadixTabs.Content>
  );
}
