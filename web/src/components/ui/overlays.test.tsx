// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Direction } from 'radix-ui';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderIntl } from '../../test/render.tsx';
import { Button } from './button.tsx';
import { Drawer } from './drawer.tsx';
import { Field } from './field.tsx';
import { Input } from './input.tsx';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './menu.tsx';
import { Modal } from './modal.tsx';
import { Popover } from './popover.tsx';
import { Tabs, TabsList, TabsPanel, TabsTrigger } from './tabs.tsx';
import { ToastProvider, useToast } from './toast.tsx';

afterEach(() => vi.useRealTimers());

function ModalHarness({ description = 'We email the first user an invite.' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Add client
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add a client"
        description={description}
        footer={<Button variant="primary">Create client</Button>}
      >
        <Field label="Client name">
          <Input />
        </Field>
        <Field label="City">
          <Input />
        </Field>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('is a named dialog with its description, and nothing before it opens', async () => {
    renderIntl(<ModalHarness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add client' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a client' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('We email the first user an invite.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create client' })).toBeTruthy();
  });

  it('moves focus to the first field, not the close button', async () => {
    renderIntl(<ModalHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Add client' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Client name'));
  });

  it('closes on Esc and returns focus to what opened it', async () => {
    renderIntl(<ModalHarness />);
    const opener = screen.getByRole('button', { name: 'Add client' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Radix hands focus back on the next tick, after the dialog unmounts.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('closes from the translated close button', async () => {
    renderIntl(<ModalHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Add client' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps Tab inside the dialog', async () => {
    renderIntl(<ModalHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Add client' }));
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement), `after tab ${i + 1}`).toBe(true);
    }
  });

  it('has no description link when it has no description', async () => {
    renderIntl(<ModalHarness description="" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add client' }));
    expect(screen.getByRole('dialog').hasAttribute('aria-describedby')).toBe(false);
  });

  it('is wider when asked', () => {
    renderIntl(
      <Modal open onOpenChange={() => {}} title="Wide" wide>
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog').className).toContain('max-w-[720px]');
  });
});

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open lead
      </button>
      <Drawer open={open} onOpenChange={setOpen} title="Lina Haddad">
        <p>x</p>
      </Drawer>
    </>
  );
}

describe('Drawer', () => {
  const open = (locale?: 'en' | 'ar') =>
    renderIntl(
      <Drawer
        open
        onOpenChange={() => {}}
        title="Lina Haddad"
        subtitle={<span>Received 5 min ago</span>}
      >
        <p>Qualification</p>
      </Drawer>,
      { locale },
    );

  it('is a named dialog with its subtitle and body', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Lina Haddad' });
    expect(dialog.textContent).toContain('Received 5 min ago');
    expect(dialog.textContent).toContain('Qualification');
  });

  it('is pinned to the inline end and slides in the matching direction (English)', () => {
    open('en');
    const cls = screen.getByRole('dialog').className;
    expect(document.documentElement.dir).toBe('ltr');
    expect(cls).toContain('end-0');
    expect(cls).toContain('animate-sx-slide');
  });

  it('is pinned to the inline end and mirrors its slide in Arabic', () => {
    open('ar');
    const cls = screen.getByRole('dialog').className;
    expect(document.documentElement.dir).toBe('rtl');
    expect(cls).toContain('end-0');
    expect(cls).toContain('rtl:animate-sx-slide-rtl');
    // physical sides would pin it to the wrong edge in Arabic
    expect(cls).not.toMatch(/(^|\s)(left|right)-0/);
  });

  it('returns focus to the control that opened it', async () => {
    renderIntl(<DrawerHarness />);
    const opener = screen.getByRole('button', { name: 'Open lead' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('closes on Esc and from the close button', async () => {
    const onOpenChange = vi.fn();
    renderIntl(
      <Drawer open onOpenChange={onOpenChange} title="Lead">
        <p>x</p>
      </Drawer>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });
});

describe('Menu', () => {
  const setup = (onPick = vi.fn()) =>
    renderIntl(
      <Menu trigger={<button type="button">Language</button>} label="Language">
        <MenuLabel>Language</MenuLabel>
        <MenuItem onSelect={() => onPick('en')}>English</MenuItem>
        <MenuItem onSelect={() => onPick('ar')}>Arabic</MenuItem>
        <MenuSeparator />
        <MenuItem disabled>French</MenuItem>
      </Menu>,
    );

  it('opens from the keyboard with menu semantics', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Language' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Language' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'English',
      'Arabic',
      'French',
    ]);
    expect(screen.getByRole('separator')).toBeTruthy();
  });

  it('moves with the arrow keys and picks with Enter, then closes', async () => {
    const onPick = vi.fn();
    setup(onPick);
    screen.getByRole('button', { name: 'Language' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Arabic');
    await userEvent.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledExactlyOnceWith('ar');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('closes on Esc and returns focus to the trigger', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Language' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('shows a disabled item as disabled', async () => {
    setup();
    screen.getByRole('button', { name: 'Language' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'French' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('lets a link be a menu item', async () => {
    renderIntl(
      <Menu trigger={<button type="button">Client</button>}>
        <MenuItem asChild>
          <a href="/clients">All clients</a>
        </MenuItem>
      </Menu>,
    );
    screen.getByRole('button', { name: 'Client' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'All clients' }).getAttribute('href')).toBe(
      '/clients',
    );
  });
});

describe('Popover', () => {
  it('opens on click, closes on Esc and returns focus to the trigger', async () => {
    renderIntl(
      <Popover trigger={<button type="button">Details</button>} label="Details panel">
        <p>Anything at all</p>
      </Popover>,
    );
    const trigger = screen.getByRole('button', { name: 'Details' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Details panel' }).textContent).toContain(
      'Anything at all',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('Tabs', () => {
  const tabs = (value: string, onValueChange = vi.fn(), variant?: 'underline' | 'ribbon') =>
    renderIntl(
      <Tabs value={value} onValueChange={onValueChange} variant={variant}>
        <TabsList label="Lead status">
          <TabsTrigger value="all" count={64} keyTone="new">
            All
          </TabsTrigger>
          <TabsTrigger value="mql" count={12} keyTone="mql" hot>
            MQL
          </TabsTrigger>
          <TabsTrigger value="sql" count={5} keyTone="sql">
            SQL
          </TabsTrigger>
        </TabsList>
        <TabsPanel value={value}>Rows for {value}</TabsPanel>
      </Tabs>,
    );

  it('is a tab list with the selected tab marked', () => {
    tabs('mql');
    expect(screen.getByRole('tablist', { name: 'Lead status' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /MQL/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /^All/ }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tabpanel').textContent).toBe('Rows for mql');
  });

  it('reports the clicked tab and leaves the content to the caller', async () => {
    const onValueChange = vi.fn();
    tabs('all', onValueChange);
    await userEvent.click(screen.getByRole('tab', { name: /SQL/ }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('sql');
    expect(screen.getByRole('tabpanel').textContent).toBe('Rows for all');
  });

  it('moves focus with the arrow keys without switching (a switch is a server round trip), Enter switches', async () => {
    const onValueChange = vi.fn();
    tabs('all', onValueChange);
    screen.getByRole('tab', { name: /^All/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /MQL/ }));
    expect(onValueChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('mql');
  });

  it('follows the Direction provider: ArrowLeft is next in Arabic', async () => {
    const onValueChange = vi.fn();
    renderIntl(
      <Direction.Provider dir="rtl">
        <Tabs value="all" onValueChange={onValueChange}>
          <TabsList label="Lead status">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="mql">MQL</TabsTrigger>
          </TabsList>
        </Tabs>
      </Direction.Provider>,
      { locale: 'ar' },
    );
    screen.getByRole('tab', { name: 'All' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'MQL' }));
    await userEvent.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('mql');
  });

  it('underline shows the count beside the label', () => {
    tabs('all');
    const tab = screen.getByRole('tab', { name: /^All/ });
    expect(tab.className).toContain('border-b-2');
    expect(tab.textContent).toBe('All64');
  });

  it('ribbon shows the figure, the label and a colour key, and a hot figure is red', () => {
    tabs('all', vi.fn(), 'ribbon');
    const mql = screen.getByRole('tab', { name: /MQL/ });
    expect(mql.className).toContain('border-b-[3px]');
    expect(mql.querySelector('span[aria-hidden="true"]')?.className).toContain('bg-sx-red-mid');
    expect(screen.getByText('12').className).toContain('text-sx-red');
    expect(screen.getByText('64').className).not.toContain('text-sx-red');
  });
});

function Pusher({ text }: { text: string }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast(text)}>
      Mark
    </button>
  );
}

describe('Toast', () => {
  it('shows a message in a labelled, polite region', async () => {
    renderIntl(
      <ToastProvider>
        <Pusher text="Marked Lina as MQL" />
      </ToastProvider>,
    );
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Mark' }));
    expect(screen.getAllByText('Marked Lina as MQL').length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(document.querySelector('[aria-live="assertive"]')).toBeNull();
  });

  it('goes away by itself after 3.4 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderIntl(
      <ToastProvider>
        <Pusher text="Saved" />
      </ToastProvider>,
    );
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole('button', { name: 'Mark' }));
    expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
    await act(async () => {
      vi.advanceTimersByTime(3600);
    });
    await waitFor(() => expect(screen.queryAllByText('Saved')).toHaveLength(0));
  });

  it('stacks several messages', async () => {
    renderIntl(
      <ToastProvider>
        <Pusher text="First" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark' }));
    expect(document.querySelectorAll('li').length).toBe(2);
  });

  it('is centred with a mirrored offset for RTL', () => {
    renderIntl(<ToastProvider>x</ToastProvider>);
    const viewport = screen.getByRole('region', { name: 'Notifications' }).querySelector('ol');
    expect(viewport?.className).toContain('-translate-x-1/2');
    expect(viewport?.className).toContain('rtl:translate-x-1/2');
  });

  it('refuses to work without its provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderIntl(<Pusher text="x" />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
