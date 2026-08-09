import { randomBytes } from 'node:crypto';

/** Resolved inputs for the webview shell (all URIs already webview-safe). */
export interface WebviewHtmlParams {
  readonly cspSource: string;
  readonly nonce: string;
  readonly scriptUri: string;
  readonly styleUri: string;
  readonly hljsLightUri: string;
  readonly hljsDarkUri: string;
}

/** Generate a cryptographically random nonce for the CSP script allowance. */
export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Build the static HTML shell for a preview webview.
 *
 * Pure and side-effect free so it can be unit tested. The strict CSP forbids
 * inline scripts/styles: the single script is nonce-allowed, and every stylesheet
 * is loaded from `cspSource` via `asWebviewUri`. Document HTML is injected later
 * by the webview script from messages, not baked in here.
 */
export function buildWebviewHtml(params: WebviewHtmlParams): string {
  const { cspSource, nonce, scriptUri, styleUri, hljsLightUri, hljsDarkUri } = params;
  const csp = [
    `default-src 'none'`,
    `style-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${cspSource} https: data:`,
    `font-src ${cspSource}`,
    // default-src 'none' does not cover form submission; raw HTML is now
    // rendered (see markdown/sanitize.ts), so this is closed explicitly.
    `form-action 'none'`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <link rel="stylesheet" href="${hljsLightUri}">
  <link rel="stylesheet" href="${hljsDarkUri}">
  <title>Markdown Preview</title>
</head>
<body>
  <div id="app">
    <nav id="toc-pane" aria-label="Document sections">
      <div id="toc-header">
        <button id="toc-toggle" type="button" title="Toggle navigation" aria-expanded="true">&#9776;</button>
        <span id="toc-title">Contents</span>
      </div>
      <ul id="toc-list"></ul>
    </nav>
    <div id="toc-resizer" role="separator" aria-orientation="vertical" title="Drag to resize"></div>
    <main id="content" class="markdown-body" tabindex="0"></main>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
