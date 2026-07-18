import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/util/debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('invokes only once after the quiet window with the last arguments', () => {
    const calls: number[] = [];
    const fn = debounce((n: number) => calls.push(n), 300);
    fn(1);
    fn(2);
    fn(3);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(300);
    expect(calls).toEqual([3]);
  });

  it('cancel() clears a pending invocation', () => {
    const calls: number[] = [];
    const fn = debounce((n: number) => calls.push(n), 300);
    fn(1);
    fn.cancel();
    vi.advanceTimersByTime(500);
    expect(calls).toEqual([]);
  });

  it('restarts the timer on each call', () => {
    const calls: number[] = [];
    const fn = debounce((n: number) => calls.push(n), 300);
    fn(1);
    vi.advanceTimersByTime(200);
    fn(2);
    vi.advanceTimersByTime(200);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(calls).toEqual([2]);
  });
});
