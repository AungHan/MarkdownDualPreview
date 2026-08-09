// The "common" subset registers ~35 widely used languages instead of all ~190,
// cutting the bundle by ~1 MB. Unmatched languages fall back to escaped text.
import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';
import type { TocNode } from '../shared/messages';
import { headingSlugPlugin } from './headingSlugPlugin';
import { type ResourceRewriter, sanitizeDocumentHtml } from './sanitize';
import { sourceLinePlugin } from './sourceLinePlugin';
import { extractToc } from './toc';

export interface RenderResult {
  readonly html: string;
  readonly toc: readonly TocNode[];
}

export interface RenderOptions {
  /** Rewrites local `<img src>` references to webview-loadable URIs. Defaults to identity. */
  readonly rewriteResourceSrc?: ResourceRewriter;
}

/** A configured render function: Markdown text in, HTML + TOC tree out. */
export type Renderer = (markdown: string, options?: RenderOptions) => RenderResult;

const identityRewriter: ResourceRewriter = (src) => src;

/** Restrict a fenced-code language token to a safe CSS class fragment. */
function sanitizeLang(lang: string): string {
  return lang.replace(/[^\w-]/g, '');
}

/**
 * Create a Markdown renderer.
 *
 * Design notes:
 * - `html: true` — raw HTML embedded in Markdown is parsed and rendered. The
 *   full rendered document is passed through {@link sanitizeDocumentHtml}
 *   before being returned, so no caller can obtain unsanitized HTML. Sanitizing
 *   the whole string (rather than per-token) is required because markdown-it
 *   can split a single HTML element like `<details>` across multiple tokens.
 * - A custom `fence` renderer is used (instead of markdown-it's `highlight`
 *   option) so the `data-line` attribute stamped by {@link sourceLinePlugin}
 *   survives onto the `<pre>` element for scroll sync, while still applying
 *   highlight.js classes.
 */
export function createRenderer(): Renderer {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  md.use(sourceLinePlugin);
  md.use(headingSlugPlugin);

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const lang = info.split(/\s+/g)[0] ?? '';
    const code = token.content;

    const dataLine = token.attrGet('data-line');
    const lineAttr = dataLine !== null ? ` data-line="${dataLine}"` : '';

    let body: string;
    let langClass = '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        body = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        langClass = ` language-${sanitizeLang(lang)}`;
      } catch {
        // highlight.js can throw on pathological input; fall back to plain text.
        body = md.utils.escapeHtml(code);
      }
    } else {
      body = md.utils.escapeHtml(code);
    }

    return `<pre${lineAttr}><code class="hljs${langClass}">${body}</code></pre>\n`;
  };

  return (markdown: string, options?: RenderOptions): RenderResult => {
    const tokens = md.parse(markdown, {});
    const toc = extractToc(tokens);
    const rawHtml = md.renderer.render(tokens, md.options, {});
    const html = sanitizeDocumentHtml(rawHtml, options?.rewriteResourceSrc ?? identityRewriter);
    return { html, toc };
  };
}
