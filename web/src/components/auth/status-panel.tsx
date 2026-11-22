import { cardClass, primaryButtonClass } from './ui.ts';

// A short message with one way out. Used by the forbidden, not-found and expired-link screens.
export function StatusPanel({
  title,
  body,
  cta,
  fullPage = false,
}: {
  title: string;
  body: string;
  cta: { href: string; label: string };
  /** true for a whole page (not-found); false inside a layout that already has the page frame. */
  fullPage?: boolean;
}) {
  const panel = (
    <section className={`${cardClass} max-w-md text-start`} aria-labelledby="status-title">
      <h1 id="status-title" className="mb-3 text-2xl font-bold text-sx-black">
        {title}
      </h1>
      <p className="mb-6 text-base text-sx-muted">{body}</p>
      <a href={cta.href} className={primaryButtonClass}>
        {cta.label}
      </a>
    </section>
  );
  if (!fullPage) return panel;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sx-page ps-4 pe-4 py-8 [color-scheme:light]">
      {panel}
    </main>
  );
}
