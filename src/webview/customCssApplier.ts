const CUSTOM_CSS_STYLE_ID = 'custom-css';

/**
 * Replaces the page's custom-CSS `<style>` with `css`, or removes it entirely
 * when `css` is empty. Uses `.textContent`, not `.innerHTML` — the value is
 * inserted as a single text node, so it can never break out into surrounding
 * markup no matter what it contains. `nonce` must be the page's own script
 * nonce, allowed by the CSP's `style-src 'nonce-...'` clause (added for
 * Mermaid's per-diagram `<style>` blocks — reused here rather than adding a
 * second CSP allowance).
 */
export function applyCustomCss(css: string, nonce: string): void {
  document.getElementById(CUSTOM_CSS_STYLE_ID)?.remove();
  if (css === '') {
    return;
  }
  const style = document.createElement('style');
  style.id = CUSTOM_CSS_STYLE_ID;
  style.nonce = nonce;
  style.textContent = css;
  document.head.appendChild(style);
}
