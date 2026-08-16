import mermaid from 'mermaid';

let initialized = false;
let idCounter = 0;

/**
 * Mermaid's SVG output is generated in the browser, after the host-side
 * sanitizer (`markdown/sanitize.ts`) has already run on the surrounding
 * document — it never passes through that allowlist. `securityLevel: 'strict'`
 * and `htmlLabels: false` are therefore the primary defense for this content
 * type, not a defense-in-depth backstop: `strict` disables `click` directive
 * script execution and runs label text through Mermaid's own DOMPurify pass;
 * `htmlLabels: false` forces labels to render as SVG `<text>` instead of via
 * `foreignObject` + arbitrary HTML. Do not drop either setting.
 */
function ensureInitialized(): void {
  if (initialized) {
    return;
  }
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
  initialized = true;
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
 */
export async function decorateMermaidBlocks(root: HTMLElement, nonce: string): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'));
  if (blocks.length === 0) {
    return;
  }
  ensureInitialized();

  await Promise.all(
    blocks.map(async (el) => {
      const source = el.textContent ?? '';
      const id = `mermaid-diagram-${idCounter++}`;
      try {
        const { svg } = await mermaid.render(id, source);
        // Match the opening-tag prefix, not a fully-formed empty `<style>`:
        // Mermaid's SVG serialization isn't a public contract, and matching
        // only the exact attribute-less form would silently stop patching
        // the nonce if a future version adds an attribute to that tag.
        el.innerHTML = svg.replace(/<style/g, `<style nonce="${nonce}"`);
      } catch {
        el.innerHTML = '<div class="mermaid-error">Invalid diagram</div>';
      }
    })
  );
}
