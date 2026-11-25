// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import errors from '../../../messages/en/errors.json';
import type { ProjectOption } from '../../contracts/projects.ts';
import { renderIntl } from '../../test/render.tsx';
import { ToastProvider } from '../ui/toast.tsx';
import { AppShell } from './app-shell.tsx';
import type { ShellMe } from './shell-context.tsx';

type SaveResult = { ok: true } | { ok: false; error: { code: string } };
const nav = vi.hoisted(() => ({ pathname: '/clients', replace: vi.fn() }));
const actions = vi.hoisted(() => ({
  updateMe: vi.fn(async (_input: { locale: string }): Promise<SaveResult> => ({ ok: true })),
  logout: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../../lib/i18n/navigation.ts', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace }),
}));
vi.mock('../../lib/actions/auth.ts', () => actions);
vi.mock('next/image', () => ({
  // biome-ignore lint/performance/noImgElement: test double for next/image
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const option = (id: string, name: string): ProjectOption => ({
  id,
  name,
  city: 'Dubai',
  industry: null,
  color: '#e70101',
  timezone: 'Asia/Dubai',
});
const OPTIONS = [option(A, 'Lumière Aesthetics'), option(B, 'Pearl Derma Clinic')];
const SUPER: ShellMe = { name: 'Admin', role: 'super_admin', projectIds: [] };
const CLIENT: ShellMe = { name: 'Dr. Lina', role: 'client', projectIds: [A] };

const renderShell = (me: ShellMe, options = OPTIONS, children: ReactNode = <p>page body</p>) =>
  renderIntl(
    <ToastProvider>
      <AppShell me={me} options={options} footerDate="24 Nov 2026">
        {children}
      </AppShell>
    </ToastProvider>,
    { extra: { errors } },
  );
const railLinks = () =>
  within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((a) => a.textContent);

beforeEach(() => {
  nav.pathname = '/clients';
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});

describe('AppShell', () => {
  it('super admin in the agency: the ready agency items, the current one marked', () => {
    renderShell(SUPER);
    expect(railLinks()).toEqual(['Clients', 'Team']);
    expect(screen.getByRole('link', { name: 'Clients' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('main')?.textContent).toContain('page body');
  });

  it('inside a client the rail switches to the client screens', () => {
    nav.pathname = `/p/${A}/overview`;
    renderShell(SUPER);
    expect(railLinks()).toEqual(['Overview', 'Leads', 'Settings']);
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe(
      `/p/${A}/overview`,
    );
  });

  it('the switcher lists every client and the way back to all clients', async () => {
    nav.pathname = `/p/${A}/overview`;
    renderShell(SUPER);
    await userEvent.click(screen.getByRole('button', { name: /Lumière Aesthetics/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'All clients' }).getAttribute('href')).toBe(
      '/clients',
    );
    expect(
      within(menu)
        .getByRole('menuitem', { name: /Pearl Derma Clinic/ })
        .getAttribute('href'),
    ).toBe(`/p/${B}/overview`);
  });

  it('with no clients the super admin is offered "Add client"', async () => {
    renderShell(SUPER, []);
    await userEvent.click(screen.getByRole('button', { name: /Agency workspace/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('No clients yet')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Add client' })).toBeTruthy();
  });

  it('a client user has no switcher: its own client block and its own nav', () => {
    nav.pathname = `/p/${A}/overview`;
    renderShell(CLIENT, [OPTIONS[0] as ProjectOption]);
    expect(screen.queryByRole('button', { name: /Lumière Aesthetics/ })).toBeNull();
    expect(screen.getByText('Client dashboard')).toBeTruthy();
    expect(railLinks()).toEqual(['Overview', 'Leads']);
  });

  it('the menu button opens and closes the rail; Escape closes it and returns focus', async () => {
    renderShell(SUPER);
    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('sx-rail')?.getAttribute('data-open')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Clients' }));
    await userEvent.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('choosing a language saves it and reopens the same page in that language', async () => {
    nav.pathname = `/p/${A}/overview`;
    renderShell(SUPER);
    await userEvent.click(screen.getByRole('button', { name: 'Language' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'العربية' }));
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(actions.updateMe).toHaveBeenCalledWith({ locale: 'ar' });
    expect(nav.replace).toHaveBeenCalledWith(`/p/${A}/overview`, { locale: 'ar' });
  });

  it('the language switch keeps the query string', async () => {
    window.history.replaceState(null, '', '/en/clients?new=1');
    renderShell(SUPER);
    await userEvent.click(screen.getByRole('button', { name: 'Language' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Français' }));
    await vi.waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/clients?new=1', { locale: 'fr' }),
    );
  });

  it('if saving the language fails, the page stays and says why', async () => {
    actions.updateMe.mockResolvedValueOnce({ ok: false, error: { code: 'INTERNAL' } });
    renderShell(SUPER);
    await userEvent.click(screen.getByRole('button', { name: 'Language' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'العربية' }));
    expect(await screen.findByText('Something went wrong on our side. Try again.')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('sign out calls logout', async () => {
    renderShell(SUPER);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => expect(actions.logout).toHaveBeenCalledWith({}));
  });

  it('skip link first, footer with the date, name and role, and never an email', () => {
    const { container } = renderShell(SUPER);
    const first = container.querySelector('a, button');
    expect(first?.textContent).toContain('Skip to content');
    expect(first?.getAttribute('href')).toBe('#main');
    expect(screen.getByRole('contentinfo').textContent).toContain(
      'SharkX · 24 Nov 2026 · Confidential · sharkx.ae',
    );
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toContain('Admin · Super admin');
    expect(within(footer).getByText('Admin').tagName).toBe('BDI');
    expect(container.innerHTML).not.toMatch(/@/);
  });
});
