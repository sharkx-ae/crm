'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cx } from '../../lib/cx.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import { visibleNav } from '../../lib/nav/config.ts';
import { routePath } from '../../lib/nav/routes.ts';
import { Icon } from '../ui/icons.tsx';
import { useShell } from './shell-context.tsx';

// Shown on a wide hover screen only while the rail is collapsed; the open rail (hover, focus, or the
// off-canvas drawer on narrow and touch screens) shows the labels and the wordmark.
const REVEAL =
  'desk:opacity-0 desk:transition-opacity desk:group-hover/rail:opacity-100 desk:group-focus-within/rail:opacity-100';

/**
 * The icon rail at the inline start. Wide screens with hover: 72px of icons that opens to 248px on hover or focus
 * and pushes the page (the parent pads by the same width). Narrow or touch: an off-canvas drawer the topbar opens.
 */
export function Rail({
  id,
  open,
  pathname,
  projectId,
}: {
  id: string;
  open: boolean;
  pathname: string;
  projectId: string | null;
}) {
  const t = useTranslations('shell');
  const { me } = useShell();
  const groups = visibleNav(me.role, projectId ? 'project' : 'agency');

  return (
    <aside
      id={id}
      data-open={open}
      className={cx(
        'group/rail fixed inset-y-0 start-0 z-90 flex w-(--side-w) flex-col overflow-hidden border-e border-sx-border bg-sx-paper transition-[width,translate,visibility] duration-150',
        // Closed drawer: off screen AND invisible, so its links leave the tab order and the accessibility tree.
        // Visibility is delayed only on close (slide out first); on open it flips at once so focus can move in.
        'invisible -translate-x-full rtl:translate-x-full data-[open=true]:visible data-[open=true]:transition-[width,translate] data-[open=true]:translate-x-0 rtl:data-[open=true]:translate-x-0',
        'desk:visible desk:w-(--rail-w) desk:translate-x-0 rtl:desk:translate-x-0 desk:hover:w-(--side-w) desk:focus-within:w-(--side-w)',
      )}
    >
      {/* 56px brand row. The collapsed 72px rail shows the 32px icon centred (20 + 32 + 20); the open rail shows the
          wordmark at 26px high. The wordmark is the official logo with its transparent padding cropped (scripts/trim-logo.mjs),
          so the letters really are 26px tall and start where the icon did. */}
      <div className="flex h-(--top-h) flex-none items-center ps-5">
        <Image
          src="/brand/icon-red-white-x.png"
          alt={t('brand.logoAlt')}
          width={32}
          height={32}
          className="hidden size-8 rounded-[9px] desk:block desk:group-hover/rail:hidden desk:group-focus-within/rail:hidden"
        />
        {/* biome-ignore lint/performance/noImgElement: both densities are local files, so the browser picks 1x or 2x itself */}
        <img
          src="/brand/logo-red-wordmark-trim.png"
          srcSet="/brand/logo-red-wordmark-trim.png 1x, /brand/logo-red-wordmark-trim-2x.png 2x"
          alt={t('brand.logoAlt')}
          width={147}
          height={26}
          className="block h-[26px] w-auto desk:hidden desk:group-hover/rail:block desk:group-focus-within/rail:block"
        />
      </div>
      <nav aria-label={t('nav.label')} className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.labelKey ?? 'items'} className="mt-3">
            {g.labelKey ? (
              <p
                className={cx(
                  'mb-1 ps-3 font-label text-label whitespace-nowrap text-sx-muted',
                  REVEAL,
                )}
              >
                {t(g.labelKey)}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const href = routePath(item.key, projectId ?? undefined);
                const current = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={item.key}>
                    <Link
                      href={href}
                      aria-current={current ? 'page' : undefined}
                      className="focus-ring flex h-10 items-center gap-3 rounded-field ps-3 pe-3 font-label whitespace-nowrap text-sx-black no-underline hover:bg-sx-shell aria-[current=page]:bg-sx-red-soft aria-[current=page]:*:[svg]:text-sx-red"
                    >
                      <Icon name={item.icon} className="flex-none" />
                      <span className={REVEAL}>{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
