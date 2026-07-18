import type Token from 'markdown-it/lib/token.mjs';
import type { TocNode } from '../shared/messages';

/** A heading flattened out of the token stream, before tree nesting. */
export interface FlatHeading {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
  readonly slug: string;
  readonly line: number;
}

const HEADING_TAG = /^h([1-6])$/;

/**
 * Extract a plain-text label from an inline token, dropping markup so the TOC
 * shows "Hello world" rather than "**Hello** world".
 */
export function inlineText(inline: Token | undefined): string {
  if (!inline || !inline.children) {
    return '';
  }
  let text = '';
  for (const child of inline.children) {
    if (child.type === 'text' || child.type === 'code_inline') {
      text += child.content;
    } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
      text += ' ';
    }
  }
  return text.trim();
}

/**
 * Walk the token stream produced by markdown-it and collect the headings.
 * Slugs are read from the `id` attribute that {@link headingSlugPlugin} set
 * during parsing, guaranteeing they match the rendered HTML ids exactly.
 */
export function extractHeadings(tokens: readonly Token[]): FlatHeading[] {
  const headings: FlatHeading[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'heading_open') {
      continue;
    }
    const match = HEADING_TAG.exec(token.tag);
    if (!match) {
      continue;
    }
    const level = Number(match[1]) as FlatHeading['level'];
    const slug = token.attrGet('id') ?? '';
    const line = token.map ? token.map[0] : 0;
    const text = inlineText(tokens[i + 1]);
    headings.push({ level, text, slug, line });
  }
  return headings;
}

/**
 * Build a nested tree from a flat, in-document-order heading list.
 *
 * Uses a stack keyed by level so skipped levels (e.g. an h1 followed directly
 * by an h3) still nest sensibly: each heading attaches to the nearest previous
 * heading with a strictly smaller level, otherwise it becomes a root.
 */
export function buildTocTree(headings: readonly FlatHeading[]): TocNode[] {
  const roots: MutableTocNode[] = [];
  const stack: MutableTocNode[] = [];

  for (const heading of headings) {
    const node: MutableTocNode = { ...heading, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}

interface MutableTocNode {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  slug: string;
  line: number;
  children: MutableTocNode[];
}

/** Convenience: extract headings and nest them in one call. */
export function extractToc(tokens: readonly Token[]): TocNode[] {
  return buildTocTree(extractHeadings(tokens));
}
