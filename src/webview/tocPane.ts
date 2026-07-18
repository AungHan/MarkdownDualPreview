import type { TocNode } from '../shared/messages';

export interface TocView {
  /** Highlight the nav entry for `slug`, clearing any previous highlight. */
  setActive(slug: string | null): void;
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

  const build = (nodes: readonly TocNode[], parent: HTMLElement): void => {
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

      if (node.children.length > 0) {
        const childList = document.createElement('ul');
        build(node.children, childList);
        li.appendChild(childList);
      }
      parent.appendChild(li);
    }
  };
  build(toc, listEl);

  let activeEl: HTMLElement | null = null;
  return {
    setActive(slug: string | null): void {
      if (activeEl) {
        activeEl.classList.remove('active');
      }
      activeEl = slug ? slugToLink.get(slug) ?? null : null;
      activeEl?.classList.add('active');
    }
  };
}
