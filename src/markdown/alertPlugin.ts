import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';

/** The marker must occupy the blockquote's entire first line (GitHub semantics). */
const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/;

/** Human-readable title per alert type. */
const TITLES: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution'
};

/** Index of the `blockquote_close` that matches the `blockquote_open` at `openIdx`. */
function matchingClose(tokens: Token[], openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < tokens.length; j++) {
    if (tokens[j].type === 'blockquote_open') {
      depth++;
    } else if (tokens[j].type === 'blockquote_close') {
      depth--;
      if (depth === 0) {
        return j;
      }
    }
  }
  return -1;
}

/**
 * markdown-it core rule that turns a GitHub-style alert blockquote into a styled
 * `<div>`.
 *
 * A blockquote whose first line is exactly `[!NOTE]` (or TIP / IMPORTANT /
 * WARNING / CAUTION, uppercase) becomes
 * `<div class="markdown-alert markdown-alert-note">` with a title row; any other
 * blockquote is left untouched.
 *
 * Registered with `.after('block')` — i.e. after block structure exists but
 * before the `inline` core rule parses inline content. That ordering lets us
 * strip the marker line by rewriting the inline token's `.content`; the built-in
 * `inline` rule then tokenises the marker-free text as usual. It runs before
 * `source_line` too, so the retagged `<div>` still receives its `data-line`
 * (that rule keys off the token *type* `blockquote_open`, which is unchanged).
 */
export function alertPlugin(md: MarkdownIt): void {
  md.core.ruler.after('block', 'github_alert', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') {
        continue;
      }
      const paraOpen = tokens[i + 1];
      const inline = tokens[i + 2];
      if (!paraOpen || paraOpen.type !== 'paragraph_open') {
        continue;
      }
      if (!inline || inline.type !== 'inline') {
        continue;
      }

      const newlineIdx = inline.content.indexOf('\n');
      const firstLine = newlineIdx === -1 ? inline.content : inline.content.slice(0, newlineIdx);
      const match = ALERT_MARKER.exec(firstLine);
      if (!match) {
        continue;
      }

      const type = match[1].toLowerCase();

      // Retag the blockquote wrapper as a div carrying the alert classes.
      const open = tokens[i];
      open.tag = 'div';
      open.attrJoin('class', `markdown-alert markdown-alert-${type}`);
      const closeIdx = matchingClose(tokens, i);
      if (closeIdx !== -1) {
        tokens[closeIdx].tag = 'div';
      }

      if (newlineIdx === -1) {
        // The marker was the whole first paragraph — drop it so no empty <p>
        // renders. The alert body is whatever blocks follow inside the div.
        if (tokens[i + 3]?.type === 'paragraph_close') {
          tokens.splice(i + 1, 3);
        }
      } else {
        // Marker shares its paragraph with body text; keep everything after it.
        inline.content = inline.content.slice(newlineIdx + 1);
      }

      const title = new state.Token('html_block', '', 0);
      title.block = true;
      title.content = `<p class="markdown-alert-title">${TITLES[type]}</p>\n`;
      title.map = open.map;
      tokens.splice(i + 1, 0, title);
    }
    return true;
  });
}
