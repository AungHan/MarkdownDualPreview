import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

const DOLLARS = '$$';

/**
 * markdown-it block rule for `$$...$$` display math. Deliberately hand-rolled
 * instead of using `markdown-it-texmath`: that plugin's `'dollars'` delimiter
 * set enables inline `$...$` matching too, with no option to disable it —
 * which would render prose currency like `$5` as math. This rule only ever
 * matches a `$$` that opens at the start of a line, so `$5`/`$10` never match.
 *
 * An opening `$$` with no closing `$$` before the end of the block (or of the
 * document) is left unmatched — the line falls through to the paragraph rule
 * and renders as literal text, rather than auto-closing like a fence does.
 *
 * Registered with `alt: ['paragraph', 'reference', 'blockquote', 'list']` —
 * the same terminator list markdown-it's own `fence` rule uses — so a `$$`
 * that immediately follows a paragraph/list-item/blockquote line (no blank
 * line separator) correctly ends that construct instead of being swallowed
 * into it as literal text.
 */
export function mathBlockPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'fence',
    'math_block',
    (state: StateBlock, startLine, endLine, silent) => {
      const pos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];

      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      if (pos + DOLLARS.length > max || state.src.slice(pos, pos + DOLLARS.length) !== DOLLARS) {
        return false;
      }

      const restOfLine = state.src.slice(pos + DOLLARS.length, max).trim();

      // Single-line form: `$$ E=mc^2 $$`
      if (restOfLine.endsWith(DOLLARS) && restOfLine.length > DOLLARS.length) {
        const content = restOfLine.slice(0, -DOLLARS.length).trim();
        if (content.length > 0) {
          if (silent) {
            return true;
          }
          const token = state.push('math_block', '', 0);
          token.content = content;
          token.map = [startLine, startLine + 1];
          state.line = startLine + 1;
          return true;
        }
      }

      // Multi-line form: scan forward for a line that is exactly `$$`.
      let nextLine = startLine;
      let haveEndMarker = false;
      while (nextLine + 1 < endLine) {
        nextLine++;
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineEnd = state.eMarks[nextLine];
        if (state.src.slice(lineStart, lineEnd).trim() === DOLLARS) {
          haveEndMarker = true;
          break;
        }
      }

      if (!haveEndMarker) {
        return false;
      }
      if (silent) {
        return true;
      }

      const token = state.push('math_block', '', 0);
      token.content = state.getLines(startLine + 1, nextLine, state.blkIndent, false).trim();
      token.map = [startLine, nextLine + 1];
      state.line = nextLine + 1;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  );
}
