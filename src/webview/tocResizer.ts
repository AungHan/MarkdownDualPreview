export interface TocResizerOptions {
  readonly pane: HTMLElement;
  readonly resizer: HTMLElement;
  /** Upper bound on width; dragging wider than this has no effect. */
  readonly maxWidth: number;
  /** Below this width the pane collapses instead of shrinking further. */
  readonly collapseThreshold: number;
  /** Persist a committed expanded width. */
  readonly onWidthChange: (width: number) => void;
  /** Collapse the pane, as if the toggle button were clicked. */
  readonly onCollapse: () => void;
}

/**
 * Make the navigation pane horizontally resizable by dragging its right edge.
 *
 * Width is driven by the `--toc-width` custom property (so the collapsed class
 * can still override it) and clamped to `maxWidth`. Dragging narrower than
 * `collapseThreshold` collapses the pane rather than leaving an unusable sliver.
 */
export function initTocResizer(options: TocResizerOptions): void {
  const { pane, resizer, maxWidth, collapseThreshold, onWidthChange, onCollapse } = options;

  resizer.addEventListener('pointerdown', (event: PointerEvent) => {
    if (pane.classList.contains('collapsed')) {
      return;
    }
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = pane.getBoundingClientRect().width;
    let committedWidth = startWidth;

    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add('toc-resizing');

    const cleanup = (): void => {
      document.body.classList.remove('toc-resizing');
      resizer.releasePointerCapture(event.pointerId);
      resizer.removeEventListener('pointermove', onMove);
      resizer.removeEventListener('pointerup', onUp);
      resizer.removeEventListener('lostpointercapture', onUp);
    };

    const onMove = (moveEvent: PointerEvent): void => {
      const desired = startWidth + (moveEvent.clientX - startX);
      if (desired < collapseThreshold) {
        cleanup();
        onCollapse();
        return;
      }
      committedWidth = Math.min(desired, maxWidth);
      pane.style.setProperty('--toc-width', `${committedWidth}px`);
    };

    const onUp = (): void => {
      cleanup();
      onWidthChange(committedWidth);
    };

    resizer.addEventListener('pointermove', onMove);
    resizer.addEventListener('pointerup', onUp);
    resizer.addEventListener('lostpointercapture', onUp);
  });
}
