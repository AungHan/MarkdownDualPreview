const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const STEP = 0.1;

export interface ZoomController {
  /** Current zoom level (1 = 100%). */
  level(): number;
  /** Restore a previously persisted level. */
  setLevel(level: number): void;
}

/**
 * Ctrl+wheel zoom on the content pane. Plain wheel (no Ctrl) scrolls normally.
 * The zoom level is applied via CSS `zoom` on {@link contentEl}.
 */
export function createZoomController(
  contentEl: HTMLElement,
  onChange: (level: number) => void
): ZoomController {
  let current = 1;

  function apply(level: number): void {
    current = clamp(level);
    contentEl.style.zoom = String(current);
    onChange(current);
  }

  contentEl.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) {
        return;
      }
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      apply(current + direction * STEP);
    },
    { passive: false }
  );

  return {
    level: () => current,
    setLevel: (level) => {
      current = clamp(level);
      contentEl.style.zoom = String(current);
    }
  };
}

function clamp(value: number): number {
  return Math.min(Math.max(Math.round(value * 100) / 100, MIN_ZOOM), MAX_ZOOM);
}
