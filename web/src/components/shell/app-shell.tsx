'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import type { ProjectOption } from '../../contracts/projects.ts';
import { usePathname } from '../../lib/i18n/navigation.ts';
import { projectIdOf } from '../../lib/nav/routes.ts';
import { UserText } from '../ui/bidi.tsx';
import { Rail } from './rail.tsx';
import { type ShellMe, ShellProvider } from './shell-context.tsx';
import { Topbar } from './topbar.tsx';

const RAIL_ID = 'sx-rail';

/**
 * The signed-in frame: skip link, rail (inline start), topbar, main and footer. No in-page titles: the rail marks the
 * current page. The mode follows the URL: inside /p/<id> the rail shows the client's screens, otherwise the agency's.
 */
export function AppShell({
  me,
  options,
  footerDate,
  children,
}: {
  me: ShellMe;
  options: ProjectOption[];
  /** Formatted on the server so server and browser render the same text. */
  footerDate: string;
  children: ReactNode;
}) {
  const t = useTranslations('shell');
  const tUi = useTranslations('ui');
  const tRole = useTranslations('common.role');
  const pathname = usePathname();
  const projectId = projectIdOf(pathname);
  const [open, setOpen] = useState(false);

  // A link in the off-canvas rail navigates: close it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on navigation only
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    // The drawer just opened from the menu button: move focus into it.
    document.querySelector<HTMLElement>(`#${RAIL_ID} nav a`)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      document.getElementById(`${RAIL_ID}-toggle`)?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <ShellProvider value={{ me, options }}>
      <div className="relative flex h-dvh flex-col overflow-hidden bg-sx-page desk:ps-(--rail-w) desk:has-[>aside:hover]:ps-(--side-w) desk:has-[>aside:focus-within]:ps-(--side-w) desk:transition-[padding] desk:duration-150">
        <a
          href="#main"
          className="focus-ring sr-only z-99 rounded-btn bg-sx-paper ps-4 pe-4 py-2 font-label text-sx-black focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {tUi('skipToContent')}
        </a>
        <Rail id={RAIL_ID} open={open} pathname={pathname} projectId={projectId} />
        {open ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('menu.close')}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-85 cursor-default bg-sx-black/30 desk:hidden"
          />
        ) : null}
        <Topbar
          railId={RAIL_ID}
          railOpen={open}
          onToggleRail={() => setOpen((v) => !v)}
          projectId={projectId}
        />
        {/* The page fills the width next to the rail (16px gutters, 24px from 900px). The frame is exactly one screen
            tall: the topbar and the footer stay put and only <main> scrolls, and only when a page is taller than the
            screen. A screen with a table gives the table card the free height (Card fill), so there the rows scroll
            inside the card and the page does not. */}
        <main
          id="main"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4 pb-3 outline-none rail:px-6 rail:pt-5"
        >
          {/* relative: absolutely positioned content (the chart's sr-only table) is clipped here, never extends the document. */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
          <footer className="mt-4 flex flex-none flex-wrap justify-between gap-2 border-t border-sx-border pt-2.5 text-label text-sx-muted">
            {/* The date is isolated so an Arabic month does not reorder the Latin text around it. */}
            <span>
              {t.rich('footer.line', { date: footerDate, d: (chunks) => <bdi>{chunks}</bdi> })}
            </span>
            <span>
              {t.rich('footer.user', {
                name: me.name,
                role: tRole(me.role),
                n: (chunks) => <UserText>{chunks}</UserText>,
              })}
            </span>
          </footer>
        </main>
      </div>
    </ShellProvider>
  );
}
