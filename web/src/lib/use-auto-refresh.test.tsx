// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoRefresh } from './use-auto-refresh.ts';

function Harness({ paused, onRefresh }: { paused: boolean; onRefresh: () => void }) {
  useAutoRefresh({ intervalMs: 5000, paused, onRefresh });
  return null;
}

const setHidden = (hidden: boolean) =>
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

beforeEach(() => {
  vi.useFakeTimers();
  setHidden(false);
});
afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
});

describe('useAutoRefresh', () => {
  it('asks for a refresh every 5 seconds', () => {
    const onRefresh = vi.fn();
    render(<Harness paused={false} onRefresh={onRefresh} />);
    act(() => void vi.advanceTimersByTime(4999));
    expect(onRefresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it('does nothing while paused, and resumes when the pause ends', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<Harness paused onRefresh={onRefresh} />);
    act(() => void vi.advanceTimersByTime(20_000));
    expect(onRefresh).not.toHaveBeenCalled();
    rerender(<Harness paused={false} onRefresh={onRefresh} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the tab is hidden', () => {
    const onRefresh = vi.fn();
    render(<Harness paused={false} onRefresh={onRefresh} />);
    setHidden(true);
    act(() => void vi.advanceTimersByTime(20_000));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes once when the window regains focus, unless paused', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<Harness paused={false} onRefresh={onRefresh} />);
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    rerender(<Harness paused onRefresh={onRefresh} />);
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('uses the latest callback and stops on unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = render(<Harness paused={false} onRefresh={first} />);
    rerender(<Harness paused={false} onRefresh={second} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
    act(() => void vi.advanceTimersByTime(20_000));
    expect(second).toHaveBeenCalledTimes(1);
  });
});
