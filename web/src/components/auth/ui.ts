// Shared class strings for the auth screens. Sizes follow the mockup and the base components (web plan §2.6 #6–8):
// fields 40px high with radius 10, buttons 38px with radius 12, placeholders in sx-muted (sx-faint fails contrast),
// one primary red button per view, 3px red focus ring (focus-ring utility). The forms sit in the white column of the
// split-screen layout, so they carry no card of their own; full-page status screens add one (fullPageCardClass).
// Logical utilities only (ps-/pe-/ms-/me-/start-/text-start): the Arabic layout mirrors without extra work.
const focus = 'focus-ring';

export const inputClass = `block h-10 w-full rounded-field border border-sx-border bg-sx-paper ps-3 pe-3 text-body text-sx-black placeholder:text-sx-muted aria-invalid:border-sx-bad ${focus}`;

export const primaryButtonClass = `inline-flex h-[38px] w-full cursor-pointer items-center justify-center rounded-btn border border-sx-red bg-sx-red ps-4 pe-4 font-label text-body text-white no-underline hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-45 ${focus}`;

export const secondaryButtonClass = `inline-flex h-[38px] w-full cursor-pointer items-center justify-center rounded-btn border border-sx-black bg-sx-paper ps-4 pe-4 font-label text-body text-sx-black no-underline hover:bg-sx-shell disabled:cursor-not-allowed disabled:opacity-45 ${focus}`;

export const linkClass = `inline-flex min-h-10 cursor-pointer items-center rounded-field font-label text-sx-red hover:underline ${focus}`;

export const labelClass = 'mb-1.5 block font-label text-label text-sx-black';

export const errorTextClass = 'mt-1.5 font-label text-label text-sx-bad';

/** An auth form or panel inside the split-screen layout's form column. */
export const cardClass = 'w-full text-start';

/** A status panel shown on its own page (not-found outside the app): the brand card. */
export const fullPageCardClass =
  'w-full rounded-card border border-sx-border bg-sx-paper p-6 shadow-sx sm:p-8';
