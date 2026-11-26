'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { createFormat } from '../../lib/i18n/format.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import type { Locale } from '../../lib/i18n/routing.ts';
import { lastPage, PAGE_SIZES, type PageItem, pageItems, rowRange } from '../../lib/paging.ts';
import { Icon } from './icons.tsx';
import { Select } from './select.tsx';

// A page's range reads left to right ("1–20 of 64") in Arabic too, so the figures never reorder around the words.
const figures = (chunks: ReactNode) => (
  <bdi dir="ltr" className="tabular-nums">
    {chunks}
  </bdi>
);

const CELL =
  'focus-ring grid size-8 flex-none place-items-center rounded-[10px] text-body tabular-nums text-sx-black no-underline transition-colors duration-150';
const GHOST = 'hover:bg-sx-shell';
const CURRENT = 'bg-sx-red-soft font-heading';
const OFF = 'cursor-default opacity-45';

/**
 * The footer of a flush card with a paged table (shadcn pattern in our tokens): rows per page at the inline start;
 * the range, previous and next, and compact page numbers at the inline end. Pages are real links, so it works
 * without JS and keeps the scroll position. Under 640px only the range and previous/next show. The current page is a
 * soft red chip, not a second red button.
 */
export function Pagination({
  page,
  size,
  total,
  shown,
  hrefFor,
  onPageChange,
  onSizeChange,
}: {
  /** 1-based, already inside the range the api returned. */
  page: number;
  size: number;
  /** The whole filtered set, not this page. */
  total: number;
  /** Rows on this page. */
  shown: number;
  /** Pages as real links (a list whose page lives in the address). */
  hrefFor?: (page: number) => string;
  /** Pages as buttons (a short list held in the browser, e.g. Team). One of `hrefFor` or `onPageChange`. */
  onPageChange?: (page: number) => void;
  onSizeChange: (size: number) => void;
}) {
  const t = useTranslations('ui.pagination');
  const locale = useLocale() as Locale;
  // Western digits next to the figures elsewhere on the screen, in Arabic too (see lib/i18n/format.ts).
  const n = createFormat({ locale, timeZone: 'UTC' }).number;
  const last = lastPage(total, size);
  const { from, to } = rowRange(page, size, shown);
  const items = pageItems(page, last);

  return (
    <div className="flex flex-none flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-sx-border px-4 py-3 rail:px-6">
      <div className="hidden items-center gap-2.5 sm:flex">
        <span className="whitespace-nowrap text-label text-sx-muted">{t('rowsPerPage')}</span>
        <Select
          size="sm"
          fit
          aria-label={t('rowsPerPage')}
          value={String(size)}
          onValueChange={(v) => onSizeChange(Number(v))}
          options={PAGE_SIZES.map((s) => ({ value: String(s), label: n(s) }))}
        />
      </div>
      <nav aria-label={t('label')} className="ms-auto flex items-center gap-1">
        <p className="me-2 text-label text-sx-muted">
          {t.rich('range', { from: n(from), to: n(to), total: n(total), r: figures })}
        </p>
        <Step
          label={t('previous')}
          icon="left"
          to={page > 1 ? page - 1 : null}
          hrefFor={hrefFor}
          onPageChange={onPageChange}
        />
        <ul className="m-0 hidden list-none items-center gap-1 p-0 sm:flex">
          {items.map((item, i) => (
            <PageLink
              key={item === 'gap' ? `gap-${i}` : item}
              item={item}
              current={page}
              label={(p) => t('page', { n: p })}
              text={n}
              hrefFor={hrefFor}
              onPageChange={onPageChange}
            />
          ))}
        </ul>
        <Step
          label={t('next')}
          icon="right"
          to={page < last ? page + 1 : null}
          hrefFor={hrefFor}
          onPageChange={onPageChange}
        />
      </nav>
    </div>
  );
}

/** Previous or next: a link, or a dimmed `aria-disabled` stand-in at the end of the list. The chevron mirrors in RTL. */
function Step({
  label,
  icon,
  to,
  hrefFor,
  onPageChange,
}: {
  label: string;
  icon: 'left' | 'right';
  /** The page it goes to, or null at the end of the list. */
  to: number | null;
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
}) {
  const glyph = <Icon name={icon} size="sm" flip />;
  if (to === null) {
    return (
      <button type="button" aria-disabled="true" aria-label={label} className={cx(CELL, OFF)}>
        {glyph}
      </button>
    );
  }
  return (
    <PageTarget
      page={to}
      label={label}
      className={cx(CELL, GHOST)}
      hrefFor={hrefFor}
      onPageChange={onPageChange}
    >
      {glyph}
    </PageTarget>
  );
}

/** A link to a page of the address, or a button that asks the screen to show it. */
function PageTarget({
  page,
  hrefFor,
  onPageChange,
  label,
  current,
  className,
  children,
}: {
  page: number;
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
  label: string;
  current?: boolean;
  className: string;
  children: ReactNode;
}) {
  const aria = { 'aria-label': label, 'aria-current': current ? ('page' as const) : undefined };
  if (hrefFor) {
    return (
      <Link href={hrefFor(page)} scroll={false} className={className} {...aria}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onPageChange?.(page)} className={className} {...aria}>
      {children}
    </button>
  );
}

function PageLink({
  item,
  current,
  label,
  text,
  hrefFor,
  onPageChange,
}: {
  item: PageItem;
  current: number;
  label: (page: number) => string;
  text: (n: number) => string;
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
}) {
  if (item === 'gap') {
    return (
      <li aria-hidden="true" className="grid size-8 place-items-center text-sx-muted">
        …
      </li>
    );
  }
  const isCurrent = item === current;
  return (
    <li>
      <PageTarget
        page={item}
        label={label(item)}
        current={isCurrent}
        className={cx(CELL, isCurrent ? CURRENT : GHOST)}
        hrefFor={hrefFor}
        onPageChange={onPageChange}
      >
        {text(item)}
      </PageTarget>
    </li>
  );
}
