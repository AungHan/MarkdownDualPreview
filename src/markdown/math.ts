import katex from 'katex';
import { escapeHtml } from 'markdown-it/lib/common/utils.mjs';

/**
 * Render one LaTeX source string to sanitizer-safe HTML.
 *
 * Uses `output: 'mathml'` (never `'html'`/`'htmlAndMathml'`): KaTeX's HTML
 * output positions every glyph with inline `style` attributes, which the
 * sanitizer allowlist and CSP both reject outright. MathML has zero `style`
 * attributes and delegates layout to the browser's native MathML renderer.
 *
 * Malformed LaTeX is caught and rendered as a plain, sanitizer-safe error
 * element rather than KaTeX's own `errorColor`-styled output (which would
 * reintroduce the inline-style problem) or a thrown exception.
 */
export function renderMath(source: string, displayMode: boolean): string {
  try {
    return katex.renderToString(source, {
      output: 'mathml',
      displayMode,
      throwOnError: true,
      strict: 'warn'
    });
  } catch {
    return `<div class="math-error">Invalid math: <code>${escapeHtml(source)}</code></div>`;
  }
}
