import * as vscode from 'vscode';
import { classifyResource } from '../markdown/resourcePath';
import type { Renderer } from '../markdown/renderer';

export interface ExportHtmlOptions {
  readonly document: vscode.TextDocument;
  readonly extensionUri: vscode.Uri;
  readonly render: Renderer;
}

export interface StandaloneHtmlParams {
  readonly title: string;
  readonly contentHtml: string;
  readonly previewCss: string;
  readonly hljsCss: string;
}

/**
 * CSS variable defaults for `--vscode-*` tokens `preview.css` reads with no
 * inline fallback (see `media/preview.css`). Only needed here because the
 * exported file opens outside VS Code, which normally supplies these.
 */
const VSCODE_VARIABLE_DEFAULTS = `:root {
  --vscode-editor-background: #ffffff;
  --vscode-editor-foreground: #1f1f1f;
  --vscode-foreground: #1f1f1f;
  --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --vscode-input-background: #f3f3f3;
  --vscode-input-foreground: #1f1f1f;
  --vscode-textLink-foreground: #0066bf;
}`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build a complete, self-contained HTML document: no `<script>`, all CSS
 * inlined. Uses the light highlight.js theme only — see accepted limitations
 * in Contract 0004 (the source stylesheets are scoped to VS Code's
 * `body.vscode-light`/`body.vscode-dark` classes, which don't exist outside
 * a VS Code webview, so `vscode-light` is hardcoded on `<body>`).
 */
export function buildStandaloneHtml(params: StandaloneHtmlParams): string {
  const { title, contentHtml, previewCss, hljsCss } = params;
  const csp = [`default-src 'none'`, `script-src 'none'`, `style-src 'unsafe-inline'`, `img-src file: data: https:`, `font-src data:`].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${VSCODE_VARIABLE_DEFAULTS}</style>
<style>${hljsCss}</style>
<style>${previewCss}</style>
</head>
<body class="vscode-light">
<main class="markdown-body">${contentHtml}</main>
</body>
</html>`;
}

/** The `/`-separated directory containing `uri`'s path, with no trailing slash. */
function directoryPathOf(uri: vscode.Uri): string {
  const segments = uri.path.split('/');
  segments.pop();
  return segments.join('/');
}

/** `uri`'s final path segment, without its extension. */
function basenameWithoutExt(uri: vscode.Uri): string {
  const segments = uri.path.split('/');
  const last = segments[segments.length - 1] ?? 'document';
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(0, dot) : last;
}

/** Rewrites local `<img src>` references to absolute `file://` URIs. */
function buildExportResourceRewriter(document: vscode.TextDocument): (src: string) => string {
  if (document.uri.scheme !== 'file') {
    return (src) => src;
  }
  const documentDir = directoryPathOf(document.uri);
  return (src: string): string => {
    const resolved = classifyResource(src, { documentDir });
    return resolved.kind === 'external' ? src : vscode.Uri.file(resolved.path).toString();
  };
}

async function readMediaFile(extensionUri: vscode.Uri, fileName: string): Promise<string> {
  const uri = vscode.Uri.joinPath(extensionUri, 'media', fileName);
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Export `options.document` as a self-contained HTML file. Prompts the user
 * for a save location; does nothing if they cancel. Read/write failures (a
 * missing bundled CSS asset, a locked or invalid save path) are reported via
 * a warning message rather than surfacing as an unhandled rejection.
 */
export async function exportHtml(options: ExportHtmlOptions): Promise<void> {
  const { document, extensionUri, render } = options;

  const targetUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${directoryPathOf(document.uri)}/${basenameWithoutExt(document.uri)}.html`),
    filters: { HTML: ['html'] }
  });
  if (!targetUri) {
    return;
  }

  try {
    const { html } = render(document.getText(), {
      rewriteResourceSrc: buildExportResourceRewriter(document),
      allowedImageSchemes: ['file']
    });
    const [previewCss, hljsCss] = await Promise.all([
      readMediaFile(extensionUri, 'preview.css'),
      readMediaFile(extensionUri, 'hljs-github-light.css')
    ]);

    const standaloneHtml = buildStandaloneHtml({
      title: basenameWithoutExt(document.uri),
      contentHtml: html,
      previewCss,
      hljsCss
    });

    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(standaloneHtml, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Markdown Dual Preview: export failed — ${reason}`);
  }
}
