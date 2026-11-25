// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import errors from '../../../messages/en/errors.json';
import leads from '../../../messages/en/leads.json';
import { renderIntl } from '../../test/render.tsx';
import { ToastProvider } from '../ui/toast.tsx';
import { MarkControl } from './mark-control.tsx';

const refresh = vi.fn();
const markLead = vi.fn();
const leadReasons = vi.fn();

vi.mock('../../lib/i18n/navigation.ts', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('../../lib/actions/leads.ts', () => ({
  markLead: (...a: unknown[]) => markLead(...a),
  leadReasons: (...a: unknown[]) => leadReasons(...a),
}));

const P = '11111111-1111-4111-8111-111111111111';
const L = '22222222-2222-4222-8222-222222222222';
const REASONS = ['No budget', 'Wrong location'];

function setup(props: Partial<React.ComponentProps<typeof MarkControl>> = {}) {
  return renderIntl(
    <ToastProvider>
      <MarkControl
        projectId={P}
        lead={{ id: L, label: 'Sara Benali', status: 'new' }}
        reasons={REASONS}
        {...props}
      />
    </ToastProvider>,
    { extra: { leads, errors } },
  );
}
const ok = (view: 'staff' | 'client', outboxQueued: number) => ({
  ok: true,
  data: { view, outboxQueued, lead: {} },
});

beforeEach(() => {
  vi.clearAllMocks();
  markLead.mockResolvedValue(ok('staff', 0));
});

describe('MarkControl', () => {
  it('shows New (never a target), MQL, SQL and Not qualified; the current one is pressed', () => {
    setup({ lead: { id: L, label: 'Sara Benali', status: 'mql' } });
    expect(screen.getByRole('button', { name: 'New' })).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: /Mark Sara Benali as MQL/ }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: /as SQL/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('MQL marks straight away, refreshes, and a staff toast adds the outbox line when rows were queued', async () => {
    markLead.mockResolvedValue(ok('staff', 2));
    setup();
    await userEvent.click(screen.getByRole('button', { name: /as MQL/ }));
    await waitFor(() =>
      expect(markLead).toHaveBeenCalledWith({
        projectId: P,
        leadId: L,
        to: 'mql',
        reason: undefined,
      }),
    );
    expect(
      await screen.findByText(
        'Marked Sara Benali as MQL. Sent to the ad platform within 60 seconds.',
      ),
    ).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it('a client toast, or a staff mark with nothing queued, has no outbox line', async () => {
    markLead.mockResolvedValue(ok('client', 3));
    setup();
    await userEvent.click(screen.getByRole('button', { name: /as SQL/ }));
    expect(await screen.findByText('Marked Sara Benali as SQL.')).toBeTruthy();
  });

  it('marking the status it already has does nothing', async () => {
    setup({ lead: { id: L, label: 'Sara Benali', status: 'sql' } });
    await userEvent.click(screen.getByRole('button', { name: /as SQL/ }));
    expect(markLead).not.toHaveBeenCalled();
  });

  it('Not qualified asks for a reason from the list first, and only then marks', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /as Not qualified/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Why is this lead not qualified?' });
    expect(markLead).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'Wrong location');
    await userEvent.click(screen.getByRole('button', { name: 'Mark not qualified' }));
    await waitFor(() =>
      expect(markLead).toHaveBeenCalledWith({
        projectId: P,
        leadId: L,
        to: 'not_qualified',
        reason: 'Wrong location',
      }),
    );
    await waitFor(() => expect(dialog.isConnected).toBe(false));
  });

  it('cancelling the reason dialog marks nothing', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /as Not qualified/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(markLead).not.toHaveBeenCalled();
  });

  it('the inline form has no New button and loads the reasons only when Not qualified is asked for', async () => {
    leadReasons.mockResolvedValue({ ok: true, data: REASONS });
    setup({ inline: true, reasons: undefined });
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull();
    expect(leadReasons).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /as Not qualified/ }));
    await waitFor(() => expect(leadReasons).toHaveBeenCalledWith({ projectId: P, leadId: L }));
    expect(await screen.findByRole('option', { name: 'No budget' })).toBeTruthy();
  });

  it('an api error shows its translated message and does not refresh', async () => {
    markLead.mockResolvedValue({ ok: false, error: { code: 'FORBIDDEN' } });
    setup();
    await userEvent.click(screen.getByRole('button', { name: /as MQL/ }));
    expect(await screen.findByText('You do not have access to this.')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
