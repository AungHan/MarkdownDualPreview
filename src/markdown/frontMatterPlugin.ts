import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

const FENCE = '---';

/** One rendered metadata row. */
interface FrontMatterRow {
  readonly key: string;
  readonly value: string;
}

/**
 * markdown-it block rule for a leading YAML front-matter fence (`---` … `---`).
 *
 * Only matches a `---` that opens on the document's very first line — the same
 * convention VS Code's built-in preview and every static-site generator use. A
 * `---` anywhere else stays a thematic break, and an unterminated leading `---`
 * falls through to the `hr` rule as well.
 *
 * The fenced lines are consumed in place (the cursor advances past them) rather
 * than stripped from the source beforehand, so every later block keeps its true
 * absolute source line — `data-line` scroll-sync math is unaffected.
 *
 * Consumption is gated on the fenced region parsing into at least one metadata
 * row. Without that gate, a document that merely opens with a `---` thematic
 * break and contains a later `---` would be swallowed whole and rendered as
 * nothing — silently deleting ordinary Markdown. When no row parses, the rule
 * declines and the `---` falls through to the `hr` rule as an ordinary break.
 */
export function frontMatterPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'hr',
    'front_matter',
    (state: StateBlock, startLine, endLine, silent) => {
      if (startLine !== 0) {
        return false;
      }
      if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
      }
      const pos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (state.src.slice(pos, max).trim() !== FENCE) {
        return false;
      }

      // Scan for the closing `---` line.
      let nextLine = startLine;
      let haveClose = false;
      while (nextLine + 1 < endLine) {
        nextLine++;
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineEnd = state.eMarks[nextLine];
        if (state.src.slice(lineStart, lineEnd).trim() === FENCE) {
          haveClose = true;
          break;
        }
      }

      if (!haveClose) {
        return false;
      }

      // Only claim the block if it actually reads as metadata; otherwise leave
      // the Markdown for normal rendering (getLines/parse are side-effect free,
      // so running them under `silent` validation is safe).
      const rows = parseFrontMatter(
        state.getLines(startLine + 1, nextLine, state.blkIndent, false)
      );
      if (rows.length === 0) {
        return false;
      }
      if (silent) {
        return true;
      }

      const token = state.push('front_matter', '', 0);
      token.meta = { rows };
      token.map = [startLine, nextLine + 1];
      state.line = nextLine + 1;
      return true;
    }
  );
}

/**
 * Parse flat YAML front matter: `key: value` pairs and simple `- item` lists.
 * Anything it cannot interpret (nested maps, multi-line scalars) is skipped
 * rather than throwing — the goal is a readable summary, not a YAML engine.
 */
function parseFrontMatter(src: string): FrontMatterRow[] {
  const lines = src.split('\n');
  const rows: FrontMatterRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const pair = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (!pair) {
      i++;
      continue;
    }
    const key = pair[1].trim();
    let value = pair[2].trim();

    if (value === '') {
      // A blank value may be followed by an indented `- item` list.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const item = /^\s*-\s+(.*)$/.exec(lines[j]);
        if (!item) {
          break;
        }
        items.push(item[1].trim());
        j++;
      }
      if (items.length > 0) {
        rows.push({ key, value: items.join(', ') });
        i = j;
        continue;
      }
    }

    rows.push({ key, value: value.replace(/^["']|["']$/g, '') });
    i++;
  }
  return rows;
}

/**
 * Render already-parsed front-matter rows as a collapsed `<details>` metadata
 * table. Rows are produced by the block rule (which only emits a token when at
 * least one parsed), so this never receives an empty set. Every key and value is
 * escaped by the caller-supplied `escape` before it lands in the HTML (which
 * still passes through the document sanitizer afterwards).
 */
export function renderFrontMatter(
  rows: readonly FrontMatterRow[],
  dataLine: string | null,
  escape: (value: string) => string
): string {
  if (rows.length === 0) {
    return '';
  }
  const body = rows
    .map((row) => `<tr><th>${escape(row.key)}</th><td>${escape(row.value)}</td></tr>`)
    .join('');
  const lineAttr = dataLine !== null ? ` data-line="${dataLine}"` : '';
  return (
    `<details class="front-matter"${lineAttr}><summary>Metadata</summary>` +
    `<table class="front-matter-table"><tbody>${body}</tbody></table></details>\n`
  );
}
