import mermaid from 'mermaid';

let currentThemeName: 'default' | 'dark' | null = null;
let idCounter = 0;
let renderGeneration = 0;

/** 'dark' for vscode-dark/vscode-high-contrast, 'default' otherwise — same light/dark grouping the hljs stylesheets use. */
function detectMermaidTheme(): 'default' | 'dark' {
  const classList = document.body.classList;
  return classList.contains('vscode-dark') || classList.contains('vscode-high-contrast') ? 'dark' : 'default';
}

/**
 * Mermaid's SVG output is generated in the browser, after the host-side
 * sanitizer (`markdown/sanitize.ts`) has already run on the surrounding
 * document — it never passes through that allowlist. `securityLevel: 'strict'`
 * and `htmlLabels: false` are therefore the primary defense for this content
 * type, not a defense-in-depth backstop: `strict` disables `click` directive
 * script execution and runs label text through Mermaid's own DOMPurify pass;
 * `htmlLabels: false` forces labels to render as SVG `<text>` instead of via
 * `foreignObject` + arbitrary HTML. Do not drop either setting.
 *
 * Re-initializes only when the detected theme differs from the last applied
 * one — `mermaid.initialize()` is safe to call repeatedly, but a redundant
 * call on every render would be wasted work.
 */
function ensureThemeApplied(): void {
  const theme = detectMermaidTheme();
  if (theme === currentThemeName) {
    return;
  }
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme });
  currentThemeName = theme;
}

/**
 * Finds every `.mermaid` placeholder block under {@link root} (stamped by the
 * host's fence renderer with the raw diagram source as escaped text content)
 * and replaces each one's content with its rendered SVG in place — the
 * element node and its `data-line` attribute are preserved so scroll sync
 * keeps working.
 *
 * One malformed diagram shows an inline error and does not stop the rest of
 * the document from rendering.
 *
 * `nonce` is patched onto any `<style>` tag Mermaid's SVG output embeds (its
 * per-diagram theme CSS) — the page's CSP has no `'unsafe-inline'` on
 * `style-src`, so an unpatched `<style>` would be silently blocked.
 *
 * Safe to call again on an already-rendered element (a `themeChanged`
 * re-render): the diagram source is stashed in `data-mermaid-source` before
 * the first render overwrites `textContent` with SVG, so later calls read
 * from there instead of re-parsing the now-rendered markup.
 *
 * If a call is still in flight when a newer call starts (e.g. two
 * `themeChanged` messages arrive back to back), each render's result is
 * applied only if no newer call has started since — otherwise a slow
 * stale-theme render could overwrite a faster up-to-date one after the fact.
 */
export async function decorateMermaidBlocks(root: HTMLElement, nonce: string): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'));
  if (blocks.length === 0) {
    return;
  }
  ensureThemeApplied();
  const generation = ++renderGeneration;

  await Promise.all(
    blocks.map(async (el) => {
      const source = el.dataset.mermaidSource ?? el.textContent ?? '';
      el.dataset.mermaidSource = source;
      const id = `mermaid-diagram-${idCounter++}`;
      try {
        const { svg } = await mermaid.render(id, source);
        if (generation !== renderGeneration) {
          return;
        }
        // Match the opening-tag prefix, not a fully-formed empty `<style>`:
        // Mermaid's SVG serialization isn't a public contract, and matching
        // only the exact attribute-less form would silently stop patching
        // the nonce if a future version adds an attribute to that tag.
        el.innerHTML = svg.replace(/<style/g, `<style nonce="${nonce}"`);
      } catch {
        if (generation !== renderGeneration) {
          return;
        }
        el.innerHTML = '<div class="mermaid-error">Invalid diagram</div>';
      }
    })
  );
}
