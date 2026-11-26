import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The locale layout is an async server component that needs a request to render, so its wiring is checked in the
// source, like the other structure tests. Removing a provider breaks arrow keys in RTL menus and tabs (Radix reads
// the direction from here) or every toast; component tests pass their own providers and would not notice.
const source = readFileSync(new URL('./[locale]/layout.tsx', import.meta.url), 'utf8').replaceAll(
  '\r\n',
  '\n',
);
const at = (needle: string | RegExp) =>
  typeof needle === 'string' ? source.indexOf(needle) : source.search(needle);

describe('[locale]/layout.tsx', () => {
  it('derives the direction from the locale once and uses it for <html> and for Radix', () => {
    expect(source).toMatch(/const dir = dirOf\(locale\);/);
    expect(source).toMatch(/<html lang=\{locale\} dir=\{dir\}>/);
    expect(source).toMatch(/<Direction\.DirectionProvider dir=\{dir\}>/);
    expect(source).toMatch(/import \{ Direction \} from 'radix-ui';/);
  });

  it('nests the providers outside in: Radix direction, then intl, then toasts, then the page', () => {
    const order = [
      '<Direction.DirectionProvider',
      '<NextIntlClientProvider',
      '<ToastProvider>',
      '{children}',
    ].map(at);
    expect(
      order.every((i) => i >= 0),
      'every provider is present',
    ).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // ToastProvider reads the `ui` catalog, so it must sit inside the intl provider
    expect(at('</ToastProvider>')).toBeLessThan(at('</NextIntlClientProvider>'));
  });

  it('gives the browser only the modules its client components use', () => {
    expect(source).toMatch(/pickModules\(await getMessages\(\), CLIENT_MODULES\)/);
    expect(source).toMatch(/<NextIntlClientProvider messages=\{messages\}>/);
  });
});
