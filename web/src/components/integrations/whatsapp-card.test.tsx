// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import errors from '../../../messages/en/errors.json';
import integrations from '../../../messages/en/integrations.json';
import { renderIntl } from '../../test/render.tsx';
import { ToastProvider } from '../ui/toast.tsx';
import { WhatsAppCard } from './whatsapp-card.tsx';

const refresh = vi.fn();
const connectWhatsApp = vi.fn();
let scriptFails = false;

vi.mock('../../lib/i18n/navigation.ts', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('../../lib/actions/whatsapp.ts', () => ({
  connectWhatsApp: (...a: unknown[]) => connectWhatsApp(...a),
}));
// The real SDK is not loaded in a test: the stub reports ready (or failed) as soon as it mounts.
vi.mock('next/script', () => ({
  default: ({ onReady, onError }: { onReady?: () => void; onError?: () => void }) => {
    useEffect(() => {
      if (scriptFails) onError?.();
      else onReady?.();
    }, [onReady, onError]);
    return null;
  },
}));

const P = '11111111-1111-4111-8111-111111111111';
const META = { appId: '1234567890', configId: '9876543210', graphVersion: 'v27.0' };
const ORIGIN = 'https://www.facebook.com';
const number = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  phoneE164: '+15550100001',
  label: 'Front desk',
  syncState: 'none' as const,
  syncPct: 0,
  onboardedAt: '2026-11-26T10:00:00.000Z',
  ...over,
});

function setup(
  over: Partial<React.ComponentProps<typeof WhatsAppCard>> = {},
  fb?: { login: ReturnType<typeof vi.fn> },
) {
  const login = fb?.login ?? vi.fn();
  window.FB = { init: vi.fn(), login } as never;
  renderIntl(
    <ToastProvider>
      <WhatsAppCard
        projectId={P}
        numbers={[]}
        connect={{ ready: true, limited: false }}
        meta={META}
        nonce="n0nce"
        timeZone="Asia/Dubai"
        {...over}
      />
    </ToastProvider>,
    { extra: { integrations, errors } },
  );
  return { login };
}

/** The card inside a page that can render again (what `router.refresh()` or a parent update does). */
function RerenderingPage() {
  const [n, setN] = useState(0);
  return (
    <ToastProvider>
      <button type="button" onClick={() => setN(n + 1)}>
        bump
      </button>
      <WhatsAppCard
        projectId={P}
        numbers={[]}
        connect={{ ready: true, limited: false }}
        meta={META}
        nonce={`n${n}`}
        timeZone="Asia/Dubai"
      />
    </ToastProvider>
  );
}

const popup = (type: string, event: string, data?: unknown) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: ORIGIN,
        data: JSON.stringify({ type, event, data }),
      }),
    );
  });
const finish = (over: Record<string, unknown> = {}) =>
  popup('WA_EMBEDDED_SIGNUP', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', {
    messaging_account_ids: ['100000000000001'],
    phone_number_id: '110000000000001',
    is_on_biz_app: true,
    ...over,
  });
const connectButton = () => screen.getByRole('button', { name: /Connect a WhatsApp number/ });
const loginCallback = (login: ReturnType<typeof vi.fn>) =>
  login.mock.calls[0]?.[0] as (r: { authResponse?: { code?: string } | null }) => void;

beforeEach(() => {
  vi.clearAllMocks();
  scriptFails = false;
  connectWhatsApp.mockResolvedValue({
    ok: true,
    data: { numbers: [number({ phoneE164: '+15550100009' })] },
  });
});
afterEach(() => {
  vi.useRealTimers();
  window.FB = undefined;
});

describe('WhatsAppCard states', () => {
  it('has exactly one primary (red) button: the connect button', () => {
    setup({ numbers: [number(), number({ phoneE164: '+15550100002' })] });
    const red = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('bg-sx-red') && !b.className.includes('bg-sx-red-soft'));
    expect(red).toHaveLength(1);
    expect(red[0]?.textContent).toContain('Connect a WhatsApp number');
  });

  it('when Meta is not configured it is disabled and says it is waiting for approval', () => {
    setup({ connect: { ready: false, limited: false } });
    expect(connectButton()).toHaveProperty('disabled', true);
    expect(screen.getByText('WhatsApp connections are waiting for Meta approval.')).toBeTruthy();
    // the SDK is not even mounted: no window.FB.init
    expect(window.FB?.init).not.toHaveBeenCalled();
  });

  it('is also awaiting when the web has no Meta app id', () => {
    setup({ meta: null });
    expect(connectButton()).toHaveProperty('disabled', true);
    expect(screen.getByText(/waiting for Meta approval/)).toBeTruthy();
  });

  it('shows the unverified-business notice only while it applies', () => {
    setup({ connect: { ready: true, limited: true } });
    expect(screen.getByText(/allows only a few new connections per week/)).toBeTruthy();
  });

  it('shows no notice when not limited', () => {
    setup();
    expect(screen.queryByText(/few new connections per week/)).toBeNull();
    expect(screen.queryByText(/waiting for Meta approval/)).toBeNull();
  });

  it('initialises the SDK with the app id and Graph version, then enables the button', async () => {
    setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    expect(window.FB?.init).toHaveBeenCalledWith({
      // exact object: no autoLogAppEvents
      appId: META.appId,
      xfbml: false,
      version: 'v27.0',
    });
  });

  it('says so when the SDK cannot load, and keeps the button off', async () => {
    scriptFails = true;
    setup();
    expect(await screen.findByText(/connection window could not load/)).toBeTruthy();
    expect(connectButton()).toHaveProperty('disabled', true);
  });
});

describe('numbers list', () => {
  it('shows the empty state', () => {
    setup();
    expect(screen.getByText('No WhatsApp number connected yet')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists several numbers with their sync state and %, connected date and label', () => {
    setup({
      numbers: [
        number({ syncState: 'none', syncPct: 0 }),
        number({ phoneE164: '+15550100002', label: null, syncState: 'syncing', syncPct: 42 }),
        number({ phoneE164: '+15550100003', syncState: 'done', syncPct: 100 }),
        number({ phoneE164: '+15550100004', syncState: 'missed', syncPct: 10 }),
      ],
    });
    const table = screen.getByRole('table', { name: 'WhatsApp numbers' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Number', 'Label', 'Chat history', 'Connected']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain('Not started');
    expect(rows[1]?.textContent).toContain('Syncing 42%');
    expect(rows[2]?.textContent).toContain('Done');
    expect(rows[3]?.textContent).toContain('Reconnect needed');
    expect(rows[0]?.textContent).toContain('+15550100001');
    expect(rows[0]?.textContent).toContain('Front desk');
    expect(rows[0]?.textContent).toContain('26 Nov 2026'); // the client's own zone (UTC+4)
    // the phone is isolated left-to-right (it must not reorder inside an Arabic sentence)
    expect(
      within(rows[0] as HTMLElement)
        .getByText('+15550100001')
        .getAttribute('dir'),
    ).toBe('ltr');
  });
});

describe('connect flow', () => {
  it('opens Embedded Signup v5 with the configuration, then submits the code and session info together', async () => {
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());

    expect(login).toHaveBeenCalledTimes(1);
    expect(login.mock.calls[0]?.[1]).toEqual({
      config_id: META.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, version: 'v5' },
    });
    // one click = one flow: the button is off while the popup is open
    expect(connectButton()).toHaveProperty('disabled', true);

    // the code alone does not submit
    act(() => loginCallback(login)({ authResponse: { code: 'auth-code' } }));
    expect(connectWhatsApp).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(connectWhatsApp).toHaveBeenCalledTimes(1));
    expect(connectWhatsApp).toHaveBeenCalledWith({
      projectId: P,
      code: 'auth-code',
      event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
      messagingAccountIds: ['100000000000001'],
      phoneNumberId: '110000000000001',
      isOnBizApp: true,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(await screen.findByText('+15550100009 is connected.')).toBeTruthy();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
  });

  it('works when the session info arrives before the code', async () => {
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    finish();
    expect(connectWhatsApp).not.toHaveBeenCalled();
    act(() => loginCallback(login)({ authResponse: { code: 'auth-code' } }));
    await waitFor(() => expect(connectWhatsApp).toHaveBeenCalledTimes(1));
  });

  it('ignores a message from any other origin', async () => {
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example',
          data: JSON.stringify({
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
            data: {
              messaging_account_ids: ['1'],
              phone_number_id: '2',
              is_on_biz_app: true,
            },
          }),
        }),
      );
    });
    expect(connectWhatsApp).not.toHaveBeenCalled();
    expect(connectButton()).toHaveProperty('disabled', true); // still waiting for the real half
  });

  it('refuses the FINISH of a new Cloud API number in the browser: no api call', async () => {
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    popup('WA_EMBEDDED_SIGNUP', 'FINISH', {
      messaging_account_ids: ['1'],
      phone_number_id: '2',
      is_on_biz_app: false,
    });
    expect(
      await screen.findByText(/Only a number that is already on the WhatsApp Business app/),
    ).toBeTruthy();
    expect(connectWhatsApp).not.toHaveBeenCalled();
    expect(connectButton()).toHaveProperty('disabled', false);
  });

  it('closing the popup is neutral and changes nothing', async () => {
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: null }));
    expect(await screen.findByText('Connection cancelled. Nothing was changed.')).toBeTruthy();
    expect(connectWhatsApp).not.toHaveBeenCalled();
    expect(connectButton()).toHaveProperty('disabled', false);
  });

  it('a CANCEL event from the popup is the same neutral message', async () => {
    setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    popup('WA_EMBEDDED_SIGNUP', 'CANCEL', { current_step: 'PHONE_NUMBER_SETUP' });
    expect(await screen.findByText('Connection cancelled. Nothing was changed.')).toBeTruthy();
  });

  it('shows a known Meta error code in plain words', async () => {
    setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    popup('WA_EMBEDDED_SIGNUP', 'ERROR', { error_code: 4563015, error_message: 'raw meta text' });
    expect(
      await screen.findByText(
        'Update the WhatsApp Business app to the latest version, then try again.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/raw meta text/)).toBeNull();
  });

  it("shows Meta's own text with the code for an unknown error code", async () => {
    setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    popup('WA_EMBEDDED_SIGNUP', 'ERROR', { error_code: 123, error_message: 'Something Meta says' });
    expect(await screen.findByText('Something Meta says (code 123)')).toBeTruthy();
  });

  it('an unexpected session shape is an unknown error, never submitted', async () => {
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    popup('WA_EMBEDDED_SIGNUP', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', { waba_id: '1' });
    expect(await screen.findByText(/could not finish the connection/)).toBeTruthy();
    expect(connectWhatsApp).not.toHaveBeenCalled();
  });

  it('shows the api reason in plain words and lets the person retry', async () => {
    connectWhatsApp.mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', details: { reason: 'number_taken' } },
    });
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    finish();
    expect(
      await screen.findByText(
        'This number is already connected to another client in SharkX. Disconnect it there first.',
      ),
    ).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
  });

  it('every reason the api can return has wording', () => {
    for (const r of [
      'not_configured',
      'qr_only',
      'code_expired',
      'waba_mismatch',
      'no_number',
      'subscribe_failed',
      'graph_unavailable',
      'number_taken',
    ]) {
      expect((integrations.whatsapp.reasons as Record<string, string>)[r], r).toBeTruthy();
    }
  });

  it('a reason we do not know falls back to the generic error toast', async () => {
    connectWhatsApp.mockResolvedValue({ ok: false, error: { code: 'INTERNAL' } });
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    finish();
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
  });

  it('gives up after a minute when only one half arrives', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { login } = setup();
    await vi.waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByText('WhatsApp took too long to answer. Try again.')).toBeTruthy();
    expect(connectWhatsApp).not.toHaveBeenCalled();
    expect(connectButton()).toHaveProperty('disabled', false);
  });

  it('still gives up after a minute when the page re-renders while waiting (router.refresh, a parent update)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const login = vi.fn();
    window.FB = { init: vi.fn(), login } as never;
    renderIntl(<RerenderingPage />, { extra: { integrations, errors } });
    await vi.waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    fireEvent.click(screen.getByRole('button', { name: 'bump' })); // the whole tree renders again
    fireEvent.click(screen.getByRole('button', { name: 'bump' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByText('WhatsApp took too long to answer. Try again.')).toBeTruthy();
    expect(connectButton()).toHaveProperty('disabled', false);
  });

  it('a re-render does not lose the popup answer that arrives afterwards', async () => {
    const login = vi.fn();
    window.FB = { init: vi.fn(), login } as never;
    renderIntl(<RerenderingPage />, { extra: { integrations, errors } });
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    fireEvent.click(screen.getByRole('button', { name: 'bump' }));
    finish();
    await waitFor(() => expect(connectWhatsApp).toHaveBeenCalledTimes(1));
  });

  it('reads the session info from another Meta subdomain (business.facebook.com)', async () => {
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://business.facebook.com',
          data: JSON.stringify({
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
            data: { messaging_account_ids: ['1'], phone_number_id: '2', is_on_biz_app: true },
          }),
        }),
      );
    });
    await waitFor(() => expect(connectWhatsApp).toHaveBeenCalledTimes(1));
  });

  it('logs the origin (never the payload) when a signup message comes from an origin it does not trust', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      setup();
      await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://evil.example',
            data: JSON.stringify({
              type: 'WA_EMBEDDED_SIGNUP',
              event: 'FINISH',
              secret: 'SECRET-123',
            }),
          }),
        );
        window.dispatchEvent(
          new MessageEvent('message', { origin: 'https://evil.example', data: 'unrelated' }),
        );
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).toContain('https://evil.example');
      expect(line).not.toContain('SECRET-123');
    } finally {
      warn.mockRestore();
    }
  });

  it('an api failure without a known reason says so in words, not with the email toast', async () => {
    connectWhatsApp.mockResolvedValue({ ok: false, error: { code: 'INTEGRATION_ERROR' } });
    const { login } = setup();
    await waitFor(() => expect(connectButton()).toHaveProperty('disabled', false));
    fireEvent.click(connectButton());
    act(() => loginCallback(login)({ authResponse: { code: 'c' } }));
    finish();
    expect(
      await screen.findByText(
        'WhatsApp could not finish the connection. Try again in a few minutes.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Email not sent. Try again')).toBeNull();
  });

  it('renders under dir="rtl" with the phone number still isolated left-to-right', () => {
    document.documentElement.dir = 'rtl';
    window.FB = { init: vi.fn(), login: vi.fn() } as never;
    renderIntl(
      <ToastProvider>
        <WhatsAppCard
          projectId={P}
          numbers={[number()]}
          connect={{ ready: true, limited: true }}
          meta={META}
          timeZone="Asia/Dubai"
        />
      </ToastProvider>,
      { locale: 'ar', extra: { integrations, errors } },
    );
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByText('+15550100001').getAttribute('dir')).toBe('ltr');
  });

  it('puts no physical-direction classes on the card (RTL safe)', () => {
    setup({ numbers: [number()] });
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/class="[^"]*\b(ml|mr|pl|pr|left|right|text-left|text-right)-/);
  });
});
