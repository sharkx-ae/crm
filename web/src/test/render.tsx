// Helpers for jsdom component tests (`// @vitest-environment jsdom` on the file's first line).
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';
import common from '../../messages/en/common.json';
import shell from '../../messages/en/shell.json';
import ui from '../../messages/en/ui.json';
import { dirOf, type Locale } from '../lib/i18n/routing.ts';

// Vitest has no globals, so testing-library cannot register its own cleanup.
afterEach(cleanup);

// jsdom lacks a few browser APIs that Radix (Popper, Dialog, Menu) touches.
if (typeof window !== 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver ??= ResizeObserverStub;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

export const messages = { common, ui, shell };

/** Renders with the English catalogs and, for Arabic, `dir="rtl"` on <html> as the real layout sets it. */
export function renderIntl(
  element: ReactElement,
  { locale = 'en', extra = {} }: { locale?: Locale; extra?: Record<string, unknown> } = {},
) {
  document.documentElement.lang = locale;
  document.documentElement.dir = dirOf(locale);
  return render(
    <NextIntlClientProvider locale={locale} messages={{ ...messages, ...extra }}>
      {element}
    </NextIntlClientProvider>,
  );
}
