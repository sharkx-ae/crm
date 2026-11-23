import type { Locale } from './routing.ts';

// Pure formatters bound to a locale and a time zone (always the project's, never the browser's).
export const EMPTY = '—';

// Western digits next to phone numbers and Latin names, in Arabic too (confirm at F2c).
const INTL: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-AE' };
const intlOf = (locale: Locale) => `${INTL[locale]}-u-nu-latn`;

export type FormatContext = { locale: Locale; timeZone: string };
// A catalog lookup for `common.ago` / `common.duration`; keeps this file free of next-intl.
export type Translate = (key: string, values?: Record<string, number>) => string;

const parse = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
const finite = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/**
 * Short zone name for the agency view: GST, GMT+1. It depends on the instant: Africa/Casablanca is
 * GMT+1 but GMT during Ramadan, so callers pass the moment they are labelling.
 */
export function zoneLabel(timeZone: string, locale: Locale, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat(intlOf(locale), { timeZone, timeZoneName: 'short' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

export function createFormat(
  { locale, timeZone }: FormatContext,
  now: () => Date = () => new Date(),
) {
  const tag = intlOf(locale);
  const dateFmt = new Intl.DateTimeFormat(tag, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const shortDateFmt = new Intl.DateTimeFormat(tag, { timeZone, day: 'numeric', month: 'short' });
  const timeFmt = new Intl.DateTimeFormat(tag, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  const numberFmt = new Intl.NumberFormat(tag);
  const percentFmt = new Intl.NumberFormat(tag, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  // Whole days between two instants as calendar dates in the project's zone.
  const dayNumber = (d: Date) => {
    const [y, m, day] = dayKeyFmt.format(d).split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day) / 86_400_000;
  };
  const sentenceCase = (s: string) => s.charAt(0).toLocaleUpperCase(tag) + s.slice(1);

  return {
    /** "22 Nov 2026" */
    date: (iso: string | null | undefined) => {
      const d = parse(iso);
      return d ? dateFmt.format(d) : EMPTY;
    },
    /** "22 Nov 2026, 14:05" */
    dateTime: (iso: string | null | undefined) => {
      const d = parse(iso);
      return d ? dateTimeFmt.format(d) : EMPTY;
    },
    /** "14:05" */
    time: (iso: string | null | undefined) => {
      const d = parse(iso);
      return d ? timeFmt.format(d) : EMPTY;
    },
    /** Today, Yesterday, else "22 Nov". */
    dayLabel: (iso: string | null | undefined) => {
      const d = parse(iso);
      if (!d) return EMPTY;
      const diff = dayNumber(now()) - dayNumber(d);
      if (diff === 0) return sentenceCase(relative.format(0, 'day'));
      if (diff === 1) return sentenceCase(relative.format(-1, 'day'));
      return shortDateFmt.format(d);
    },
    /** "just now", "5 min ago", "3 h ago", "2 d ago" from `common.ago.{now,min,h,d}`. */
    ago: (iso: string | null | undefined, t: Translate) => {
      const d = parse(iso);
      if (!d) return EMPTY;
      const min = Math.round((now().getTime() - d.getTime()) / 60_000);
      if (min < 1) return t('now');
      if (min < 60) return t('min', { n: min });
      const h = Math.round(min / 60);
      if (h < 24) return t('h', { n: h });
      return t('d', { n: Math.round(h / 24) });
    },
    number: (n: number | null | undefined) => (finite(n) ? numberFmt.format(n) : EMPTY),
    /** A ratio (0.125) as "12.5%": one decimal, as the brand asks. */
    percent: (ratio: number | null | undefined) =>
      finite(ratio) ? percentFmt.format(ratio) : EMPTY,
    /** "12 min", "2 h", "1 h 5 min" from `common.duration.{min,h,hMin}`. */
    duration: (minutes: number | null | undefined, t: Translate) => {
      if (!finite(minutes) || minutes < 0) return EMPTY;
      const total = Math.round(minutes);
      if (total < 60) return t('min', { n: total });
      const h = Math.floor(total / 60);
      const m = total % 60;
      return m === 0 ? t('h', { n: h }) : t('hMin', { h, m });
    },
    zoneLabel: (tz: string = timeZone, at: Date = now()) => zoneLabel(tz, locale, at),
  };
}

export type Formatter = ReturnType<typeof createFormat>;
