/**
 * Echo-suppression gate for bidirectional scroll sync.
 *
 * The feedback-loop hazard: side A tells side B to scroll to a line; B scrolls,
 * which fires B's own scroll event, which would tell A to scroll, and so on.
 * Each side owns a gate. Before applying a value RECEIVED from the peer it calls
 * {@link suppress}; its own scroll observer then calls {@link shouldSend}, which
 * returns false while inside the suppression window or when the value is
 * unchanged from the last one sent.
 *
 * Pure and dependency-free so it can be unit tested with injected timestamps.
 */
export class ScrollSyncGate {
  private suppressUntil = 0;
  private lastSent: number | null = null;

  constructor(private readonly windowMs = 100) {}

  /** Open a suppression window; call right before applying a peer-driven scroll. */
  suppress(now: number): void {
    this.suppressUntil = now + this.windowMs;
  }

  /** Whether a locally observed scroll to `value` should be forwarded to the peer. */
  shouldSend(value: number, now: number): boolean {
    if (now < this.suppressUntil) {
      return false;
    }
    if (this.lastSent === value) {
      return false;
    }
    this.lastSent = value;
    return true;
  }

  reset(): void {
    this.suppressUntil = 0;
    this.lastSent = null;
  }
}
