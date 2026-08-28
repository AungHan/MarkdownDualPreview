import { describe, expect, it } from 'vitest';
import { findAncestorPath } from '../../src/webview/breadcrumb';
import type { TocNode } from '../../src/shared/messages';

function node(partial: Partial<TocNode> & Pick<TocNode, 'slug' | 'text' | 'level'>): TocNode {
  return { line: 0, children: [], ...partial };
}

describe('findAncestorPath', () => {
  it('returns an empty path for a null slug', () => {
    const toc: TocNode[] = [node({ level: 1, text: 'Intro', slug: 'intro' })];
    expect(findAncestorPath(toc, null)).toEqual([]);
  });

  it('returns a single entry for a root-level heading', () => {
    const toc: TocNode[] = [node({ level: 1, text: 'Intro', slug: 'intro' })];
    expect(findAncestorPath(toc, 'intro')).toEqual([{ text: 'Intro', slug: 'intro' }]);
  });

  it('returns the full chain for a nested heading', () => {
    const toc: TocNode[] = [
      node({
        level: 1,
        text: 'Guide',
        slug: 'guide',
        children: [
          node({
            level: 2,
            text: 'Getting Started',
            slug: 'getting-started',
            children: [node({ level: 3, text: 'Installation', slug: 'installation' })]
          })
        ]
      })
    ];
    expect(findAncestorPath(toc, 'installation')).toEqual([
      { text: 'Guide', slug: 'guide' },
      { text: 'Getting Started', slug: 'getting-started' },
      { text: 'Installation', slug: 'installation' }
    ]);
  });

  it('returns an empty path when the slug is not found in the tree', () => {
    const toc: TocNode[] = [node({ level: 1, text: 'Intro', slug: 'intro' })];
    expect(findAncestorPath(toc, 'missing')).toEqual([]);
  });
});
