// Shared class strings for the auth screens (and John's role-gated pages). Brand rules: cards radius 16 (rounded-2xl),
// buttons and inputs radius 12 (rounded-xl), one primary red button per view, 3px red focus ring, tap targets 48px.
// Logical utilities only (ps-/pe-/ms-/me-/start-/text-start): the Arabic layout mirrors without extra work.
const focus = 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sx-red';

export const inputClass = `block min-h-12 w-full rounded-xl border border-sx-border bg-white ps-4 pe-4 text-base text-sx-black placeholder:text-sx-faint ${focus}`;

export const primaryButtonClass = `inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-sx-red ps-6 pe-6 text-base font-bold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`;

export const secondaryButtonClass = `inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-sx-black bg-white ps-6 pe-6 text-base font-bold text-sx-black hover:bg-sx-shell disabled:cursor-not-allowed disabled:opacity-60 ${focus}`;

export const linkClass = `inline-flex min-h-12 cursor-pointer items-center font-semibold text-sx-red hover:underline ${focus} rounded-xl`;

export const labelClass = 'mb-2 block text-sm font-semibold text-sx-black';

export const errorTextClass = 'mt-2 text-sm font-semibold text-sx-destructive';

export const cardClass =
  'w-full rounded-2xl border border-sx-border bg-white p-6 shadow-[0_1px_3px_rgba(28,15,15,0.08)] sm:p-8';
