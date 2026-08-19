import type { TocNode } from '../shared/messages';

export interface TocView {
  /** Highlight the nav entry for `slug`, clearing any previous highlight. */
  setActive(slug: string | null): void;
  /**
   * Hide entries that neither match `query` nor have a matching descendant.
   * Empty/whitespace `query` restores the full tree.
   */
  filter(query: string): void;
}

/** A nav entry paired with the data needed to filter it. */
interface FilterEntry {
  readonly li: HTMLElement;
  /** Lowercased heading text for case-insensitive substring matching. */
  readonly text: string;
  readonly children: readonly FilterEntry[];
}

/**
 * Render the nested table of contents into `listEl`.
 *
 * Heading labels are inserted via `textContent` (never `innerHTML`) so user
 * content can never inject markup into the nav. Clicks scroll the matching
 * section into view entirely webview-side — no round trip to the extension.
 */
export function renderToc(listEl: HTMLElement, toc: readonly TocNode[]): TocView {
  listEl.textContent = '';
  const slugToLink = new Map<string, HTMLElement>();

  const build = (nodes: readonly TocNode[], parent: HTMLElement): FilterEntry[] => {
    const entries: FilterEntry[] = [];
    for (const node of nodes) {
      const li = document.createElement('li');

      const link = document.createElement('a');
      link.className = `toc-link toc-level-${node.level}`;
      link.textContent = node.text;
      link.href = `#${node.slug}`;
      link.dataset.slug = node.slug;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById(node.slug)?.scrollIntoView({ block: 'start' });
      });
      li.appendChild(link);
      slugToLink.set(node.slug, link);

      let children: FilterEntry[] = [];
      if (node.children.length > 0) {
        const childList = document.createElement('ul');
        children = build(node.children, childList);
        li.appendChild(childList);
      }
      parent.appendChild(li);
      entries.push({ li, text: node.text.toLowerCase(), children });
    }
    return entries;
  };
  const roots = build(toc, listEl);

  // Show an entry when it matches or any descendant does, so a match keeps its
  // ancestor context. A matching parent does NOT force its children visible.
  const applyFilter = (entries: readonly FilterEntry[], query: string): boolean => {
    let anyVisible = false;
    for (const entry of entries) {
      const childVisible = applyFilter(entry.children, query);
      const visible = query === '' || entry.text.includes(query) || childVisible;
      entry.li.classList.toggle('toc-hidden', !visible);
      anyVisible = anyVisible || visible;
    }
    return anyVisible;
  };

  let activeEl: HTMLElement | null = null;
  return {
    setActive(slug: string | null): void {
      if (activeEl) {
        activeEl.classList.remove('active');
      }
      activeEl = slug ? slugToLink.get(slug) ?? null : null;
      activeEl?.classList.add('active');
    },
    filter(query: string): void {
      applyFilter(roots, query.trim().toLowerCase());
    }
  };
}
