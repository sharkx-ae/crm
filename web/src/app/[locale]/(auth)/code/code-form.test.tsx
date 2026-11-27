// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import auth from '../../../../../messages/en/auth.json';
import { renderIntl } from '../../../../test/render.tsx';
import { CodeForm } from './code-form.tsx';

const verifyCode = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/actions/auth.ts', () => ({
  verifyCode,
  resendCode: vi.fn(),
  logout: vi.fn(),
}));

beforeEach(() => verifyCode.mockReset().mockResolvedValue(undefined));

const show = () =>
  renderIntl(<CodeForm maskedEmail="u***@test.local" loginHref="/en/login" />, {
    extra: { auth },
  });
const type = async (code: string) => {
  const boxes = screen.getAllByRole('textbox');
  await userEvent.click(boxes[0] as HTMLElement);
  await userEvent.paste(code);
};

describe('CodeForm: trust this device', () => {
  it('offers the box, unchecked by default, with its hint', () => {
    show();
    const box = screen.getByRole('checkbox', { name: /Don't ask for a code on this device/ });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Only tick this on your own device.')).toBeTruthy();
  });

  it('sends trustDevice: false when the box is left alone', async () => {
    show();
    await type('123456');
    await waitFor(() =>
      expect(verifyCode).toHaveBeenCalledWith({ code: '123456', trustDevice: false }),
    );
  });

  it('sends trustDevice: true when ticked', async () => {
    show();
    await userEvent.click(screen.getByRole('checkbox'));
    await type('654321');
    await waitFor(() =>
      expect(verifyCode).toHaveBeenCalledWith({ code: '654321', trustDevice: true }),
    );
  });
});
