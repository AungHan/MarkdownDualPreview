import type { TocNode } from '../shared/messages';

export interface BreadcrumbView {
  /** Update the breadcrumb to show the ancestor chain to `slug`. */
  update(slug: string | null): void;
  /** Replace the TocNode tree (called on each content update). */
  setTree(toc: readonly TocNode[]): void;
}

/**
 * Find the ancestor chain from root to the node matching `slug`, inclusive.
 * Returns an empty array when `slug` is `null` or not present in the tree.
 */
export function findAncestorPath(
  toc: readonly TocNode[],
  slug: string | null
): ReadonlyArray<{ text: string; slug: string }> {
  if (slug === null) {
    return [];
  }
  const search = (
    nodes: readonly TocNode[]
  ): ReadonlyArray<{ text: string; slug: string }> | null => {
    for (const node of nodes) {
      if (node.slug === slug) {
        return [{ text: node.text, slug: node.slug }];
      }
      const childPath = search(node.children);
      if (childPath) {
        return [{ text: node.text, slug: node.slug }, ...childPath];
      }
    }
    return null;
  };
  return search(toc) ?? [];
}

/**
 * Create a breadcrumb bar inside `containerEl`. Segments are plain `<a>`
 * elements built with `textContent` (never `innerHTML`), matching the
 * security pattern used by `tocPane.ts`. Empty when there is no active
 * heading — CSS `#breadcrumb:empty` hides the bar in that state.
 */
export function createBreadcrumb(containerEl: HTMLElement): BreadcrumbView {
  let toc: readonly TocNode[] = [];

  return {
    setTree(newToc: readonly TocNode[]): void {
      toc = newToc;
    },
    update(slug: string | null): void {
      containerEl.textContent = '';
      const path = findAncestorPath(toc, slug);
      path.forEach((segment, index) => {
        if (index > 0) {
          const separator = document.createElement('span');
          separator.className = 'breadcrumb-separator';
          separator.textContent = ' > ';
          containerEl.appendChild(separator);
        }
        const link = document.createElement('a');
        link.className = 'breadcrumb-link';
        link.textContent = segment.text;
        link.href = `#${segment.slug}`;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          document.getElementById(segment.slug)?.scrollIntoView({ block: 'start' });
        });
        containerEl.appendChild(link);
      });
    }
  };
}
