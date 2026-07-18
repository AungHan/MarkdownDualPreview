import { describe, expect, it } from 'vitest';
import { ScrollSyncGate } from '../../src/shared/scrollSyncGate';

describe('ScrollSyncGate', () => {
  it('sends a fresh value outside any suppression window', () => {
    const gate = new ScrollSyncGate(100);
    expect(gate.shouldSend(10, 1000)).toBe(true);
  });

  it('suppresses sends inside the window after applying a peer scroll', () => {
    const gate = new ScrollSyncGate(100);
    gate.suppress(1000);
    expect(gate.shouldSend(42, 1050)).toBe(false);
  });

  it('allows sends once the window has passed', () => {
    const gate = new ScrollSyncGate(100);
    gate.suppress(1000);
    expect(gate.shouldSend(42, 1050)).toBe(false);
    expect(gate.shouldSend(42, 1101)).toBe(true);
  });

  it('dedupes consecutive identical values', () => {
    const gate = new ScrollSyncGate(100);
    expect(gate.shouldSend(5, 1000)).toBe(true);
    expect(gate.shouldSend(5, 2000)).toBe(false);
    expect(gate.shouldSend(6, 3000)).toBe(true);
  });

  it('reset clears state', () => {
    const gate = new ScrollSyncGate(100);
    gate.shouldSend(5, 1000);
    gate.reset();
    expect(gate.shouldSend(5, 1001)).toBe(true);
  });
});
