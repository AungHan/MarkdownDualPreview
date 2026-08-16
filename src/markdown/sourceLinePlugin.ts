import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

/**
 * Block-level tokens that carry a meaningful source-line mapping and are worth
 * annotating for editor <-> preview scroll sync. Inline-only constructs are
 * skipped because they have no independent scroll target.
 */
const MAPPED_BLOCK_TYPES = new Set<string>([
  'paragraph_open',
  'heading_open',
  'list_item_open',
  'bullet_list_open',
  'ordered_list_open',
  'table_open',
  'blockquote_open',
  'code_block',
  'fence',
  'hr',
  'html_block',
  'math_block'
]);

/**
 * markdown-it plugin that stamps `data-line="<0-based source line>"` onto
 * block-level elements. The webview reads these attributes to map scroll
 * positions between the source document and the rendered preview.
 *
 * Not every token has a `map` (nested/inline constructs may not); those are
 * left unannotated, and the scroll logic tolerates the gaps by interpolating
 * between the nearest annotated elements.
 */
export function sourceLinePlugin(md: MarkdownIt): void {
  md.core.ruler.push('source_line', (state) => {
    for (const token of state.tokens as Token[]) {
      if (MAPPED_BLOCK_TYPES.has(token.type) && token.map) {
        token.attrSet('data-line', String(token.map[0]));
      }
    }
    return true;
  });
}
