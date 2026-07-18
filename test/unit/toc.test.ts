import { describe, expect, it } from 'vitest';
import { buildTocTree, type FlatHeading } from '../../src/markdown/toc';

function h(level: FlatHeading['level'], text: string): FlatHeading {
  return { level, text, slug: text.toLowerCase(), line: 0 };
}

describe('buildTocTree', () => {
  it('returns an empty array for no headings', () => {
    expect(buildTocTree([])).toEqual([]);
  });

  it('nests h2 under h1', () => {
    const tree = buildTocTree([h(1, 'A'), h(2, 'B')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].text).toBe('A');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].text).toBe('B');
  });

  it('keeps same-level headings as siblings', () => {
    const tree = buildTocTree([h(1, 'A'), h(1, 'B')]);
    expect(tree.map((n) => n.text)).toEqual(['A', 'B']);
  });

  it('handles skipped levels (h1 -> h3) by nesting under the nearest smaller level', () => {
    const tree = buildTocTree([h(1, 'A'), h(3, 'B')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].text).toBe('B');
    expect(tree[0].children[0].level).toBe(3);
  });

  it('pops back up to the correct parent when levels decrease', () => {
    const tree = buildTocTree([h(1, 'A'), h(2, 'B'), h(3, 'C'), h(2, 'D')]);
    expect(tree[0].children.map((n) => n.text)).toEqual(['B', 'D']);
    expect(tree[0].children[0].children.map((n) => n.text)).toEqual(['C']);
  });

  it('treats a leading deep heading as a root', () => {
    const tree = buildTocTree([h(6, 'deep'), h(1, 'top')]);
    expect(tree.map((n) => n.text)).toEqual(['deep', 'top']);
  });
});
