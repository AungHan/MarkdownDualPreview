/** A debounced function with explicit cancellation, used for cleanup on dispose. */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

/**
 * Debounce `fn` by `delayMs`: only the final call within a quiet window runs,
 * using the arguments from that final call.
 *
 * `cancel()` clears any pending invocation — essential when a preview panel is
 * disposed so we never post a re-render to a dead webview.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: A | undefined;

  const debounced = ((...args: A): void => {
    pendingArgs = args;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      const callArgs = pendingArgs;
      pendingArgs = undefined;
      if (callArgs) {
        fn(...callArgs);
      }
    }, delayMs);
  }) as Debounced<A>;

  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    pendingArgs = undefined;
  };

  return debounced;
}
