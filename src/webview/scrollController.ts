import { ScrollSyncGate } from '../shared/scrollSyncGate';

interface LineEntry {
  readonly line: number;
  readonly el: HTMLElement;
}

interface HeadingEntry {
  readonly slug: string;
  readonly el: HTMLElement;
}

export interface ScrollController {
  /** Rebuild the source-line and heading indexes after content changes. */
  rebuild(): void;
  /** Scroll so the given source line sits at the top of the viewport. */
  revealLine(line: number): void;
  /** The source line currently anchored at the top (for update preservation). */
  currentTopLine(): number | null;
}

/**
 * Owns the webview side of scroll sync: maps between rendered `[data-line]`
 * elements and source lines, reports user scrolls (echo-suppressed), and tracks
 * the active heading for nav highlighting.
 */
export function createScrollController(
  contentEl: HTMLElement,
  postScroll: (line: number) => void,
  onActiveSlug: (slug: string | null) => void
): ScrollController {
  const gate = new ScrollSyncGate(120);
  let lineIndex: LineEntry[] = [];
  let headingIndex: HeadingEntry[] = [];
  let rafPending = false;

  function offsetOf(el: HTMLElement): number {
    return el.getBoundingClientRect().top - contentEl.getBoundingClientRect().top + contentEl.scrollTop;
  }

  function rebuild(): void {
    lineIndex = [];
    contentEl.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => {
      const line = Number(el.dataset.line);
      if (!Number.isNaN(line)) {
        lineIndex.push({ line, el });
      }
    });
    lineIndex.sort((a, b) => a.line - b.line);

    headingIndex = [];
    contentEl
      .querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')
      .forEach((el) => headingIndex.push({ slug: el.id, el }));

    updateActiveHeading();
  }

  /** Largest index whose line is <= target (binary search); -1 if none. */
  function floorIndex(line: number): number {
    let lo = 0;
    let hi = lineIndex.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineIndex[mid].line <= line) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  function revealLine(line: number): void {
    if (lineIndex.length === 0) {
      return;
    }
    const idx = floorIndex(line);
    let target: number;
    if (idx < 0) {
      target = 0;
    } else if (idx >= lineIndex.length - 1) {
      target = offsetOf(lineIndex[idx].el);
    } else {
      const lower = lineIndex[idx];
      const upper = lineIndex[idx + 1];
      const lowerTop = offsetOf(lower.el);
      const upperTop = offsetOf(upper.el);
      const span = upper.line - lower.line;
      const ratio = span > 0 ? (line - lower.line) / span : 0;
      target = lowerTop + (upperTop - lowerTop) * ratio;
    }
    gate.suppress(Date.now());
    contentEl.scrollTo({ top: target });
    updateActiveHeading();
  }

  function currentTopLine(): number | null {
    if (lineIndex.length === 0) {
      return null;
    }
    const top = contentEl.scrollTop;
    let candidate = lineIndex[0].line;
    for (const entry of lineIndex) {
      if (offsetOf(entry.el) <= top + 4) {
        candidate = entry.line;
      } else {
        break;
      }
    }
    return candidate;
  }

  function updateActiveHeading(): void {
    const top = contentEl.scrollTop;
    let active: string | null = null;
    for (const heading of headingIndex) {
      if (offsetOf(heading.el) <= top + 8) {
        active = heading.slug;
      } else {
        break;
      }
    }
    onActiveSlug(active);
  }

  function onScroll(): void {
    if (rafPending) {
      return;
    }
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      updateActiveHeading();
      const line = currentTopLine();
      if (line !== null && gate.shouldSend(line, Date.now())) {
        postScroll(line);
      }
    });
  }

  contentEl.addEventListener('scroll', onScroll, { passive: true });

  return { rebuild, revealLine, currentTopLine };
}
