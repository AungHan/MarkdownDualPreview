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
  readonly hljsDarkCss: string;
}

/** Local image references over this size are left as `file://` even when embedding is chosen. */
const MAX_EMBED_BYTES = 5 * 1024 * 1024;

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

/** Dark-mode counterpart to {@link VSCODE_VARIABLE_DEFAULTS}, VS Code's own Dark+ defaults. */
const VSCODE_DARK_VARIABLE_DEFAULTS = `:root {
  --vscode-editor-background: #1e1e1e;
  --vscode-editor-foreground: #cccccc;
  --vscode-foreground: #cccccc;
  --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --vscode-input-background: #3c3c3c;
  --vscode-input-foreground: #cccccc;
  --vscode-textLink-foreground: #3794ff;
}`;

/**
 * The dark hljs stylesheet's rules are scoped to `body.vscode-dark`/
 * `body.vscode-high-contrast` (see `media/hljs-github-dark.css`), classes the
 * export never sets — it always emits a single `body.vscode-light`. Re-scope
 * those selectors so the rules can apply under a `prefers-color-scheme` media
 * query instead. The negative lookahead keeps `vscode-high-contrast-light`
 * (a light-theme selector, never present in this file) from matching.
 */
export function rescopeDarkCssForExport(darkCss: string): string {
  return darkCss.replace(/body\.vscode-dark|body\.vscode-high-contrast(?!-)/g, 'body.vscode-light');
}

/**
 * `preview.css`'s side padding lives on `#content` (the live webview's element
 * id) — the export's `<main class="markdown-body">` has no such id, so it
 * inherits none of it and renders flush against the browser viewport edges.
 * This scopes readable margins/width to the export only, leaving the live
 * webview's own layout (and its `maxContentWidth` setting) untouched.
 */
export function buildLayoutCss(): string {
  return `.markdown-body {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 40px 64px;
}`;
}

/** Static print tuning: avoid splitting code/tables/quotes across a page break. */
export function buildPrintCss(): string {
  return `@media print {
  pre, table, blockquote, figure {
    break-inside: avoid;
  }
  h1, h2, h3, h4, h5, h6 {
    break-after: avoid;
  }
  body {
    margin: 0.5in;
  }
}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build a complete, self-contained HTML document: no `<script>`, all CSS
 * inlined. `<body>` is always `vscode-light` (the source stylesheets are
 * scoped to VS Code's `body.vscode-light`/`body.vscode-dark` classes, which
 * don't exist outside a VS Code webview), but the dark hljs theme and dark
 * `--vscode-*` variable defaults are still included, re-scoped onto that same
 * class and gated behind `@media (prefers-color-scheme: dark)` — see
 * Contract 0005 D1/D2.
 */
export function buildStandaloneHtml(params: StandaloneHtmlParams): string {
  const { title, contentHtml, previewCss, hljsCss, hljsDarkCss } = params;
  const csp = [`default-src 'none'`, `script-src 'none'`, `style-src 'unsafe-inline'`, `img-src file: data: https:`, `font-src data:`].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${VSCODE_VARIABLE_DEFAULTS}</style>
<style>@media (prefers-color-scheme: dark) { ${VSCODE_DARK_VARIABLE_DEFAULTS} }</style>
<style>${hljsCss}</style>
<style>@media (prefers-color-scheme: dark) { ${rescopeDarkCssForExport(hljsDarkCss)} }</style>
<style>${previewCss}</style>
<style>${buildLayoutCss()}</style>
<style>${buildPrintCss()}</style>
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

/** Matches a Markdown image's URL, ignoring an optional `"title"` suffix. */
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
/**
 * Matches a raw HTML `<img src="...">` attribute. The negative lookbehind
 * keeps `\bsrc` from also matching a `data-src` (or similar) lazy-load
 * attribute — `\b` alone matches right after the hyphen.
 */
const HTML_IMG_SRC_PATTERN = /<img\b[^>]*?(?<![\w-])src\s*=\s*["']([^"']+)["']/gi;

/** Collects every distinct image `src`/URL referenced in `markdown` (Markdown or raw HTML syntax). */
function extractImageSources(markdown: string): string[] {
  const sources = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    sources.add(match[1]);
  }
  for (const match of markdown.matchAll(HTML_IMG_SRC_PATTERN)) {
    sources.add(match[1]);
  }
  return [...sources];
}

const MIME_TYPES_BY_EXT: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon'
};

/** Returns `undefined` for an unrecognized extension — callers must not embed those. */
function mimeTypeForPath(path: string): string | undefined {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return MIME_TYPES_BY_EXT[ext];
}

/**
 * Resolves every local image `extractImageSources` finds in `markdown` to a
 * base64 `data:` URI, keyed by the original `src` string so the rewriter can
 * do a synchronous lookup during rendering (`sanitize-html`'s `transformTags`
 * cannot be async — see Contract 0005 D4). An image over {@link MAX_EMBED_BYTES},
 * missing, or unreadable is simply left out of the map; the rewriter's
 * `file://` fallback handles the gap.
 */
export async function buildImageDataUriMap(
  markdown: string,
  documentDir: string
): Promise<ReadonlyMap<string, string>> {
  const map = new Map<string, string>();
  for (const src of extractImageSources(markdown)) {
    const resolved = classifyResource(src, { documentDir });
    if (resolved.kind !== 'local') {
      continue;
    }
    // Only ever embed a recognized image extension — otherwise a crafted
    // reference to an arbitrary local file (e.g. `.env`, `.pem`) would have
    // its raw bytes read and base64'd into the exported HTML.
    const mime = mimeTypeForPath(resolved.path);
    if (!mime) {
      continue;
    }
    try {
      const uri = vscode.Uri.file(resolved.path);
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_EMBED_BYTES) {
        continue;
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      map.set(src, `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`);
    } catch {
      // Missing or unreadable file — leave it out of the map, falls back to file://.
    }
  }
  return map;
}

function tryDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Rewrites local `<img src>` references, preferring an embedded `data:` URI when one is available. */
function buildExportResourceRewriter(
  document: vscode.TextDocument,
  dataUriMap?: ReadonlyMap<string, string>
): (src: string) => string {
  if (document.uri.scheme !== 'file') {
    return (src) => src;
  }
  const documentDir = directoryPathOf(document.uri);
  return (src: string): string => {
    // A Markdown-syntax image's src arrives here already percent-encoded by
    // markdown-it's own link normalization, but buildImageDataUriMap's keys
    // are the raw, un-encoded text extracted from the source — decode before
    // the lookup so a non-ASCII path (e.g. `café.png`) still matches. A raw
    // HTML `<img src>` is never re-encoded, so this is a harmless no-op there.
    const embedded = dataUriMap?.get(src) ?? dataUriMap?.get(tryDecodeUriComponent(src));
    if (embedded) {
      return embedded;
    }
    const resolved = classifyResource(src, { documentDir });
    return resolved.kind === 'external' ? src : vscode.Uri.file(resolved.path).toString();
  };
}

async function readMediaFile(extensionUri: vscode.Uri, fileName: string): Promise<string> {
  const uri = vscode.Uri.joinPath(extensionUri, 'media', fileName);
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

const EMBED_IMAGES_LABEL = 'Embed images (portable, larger file)';
const LINK_IMAGES_LABEL = 'Link to local files';

/**
 * Export `options.document` as a self-contained HTML file. Prompts for a save
 * location, then (for a `file:` document) whether to embed local images as
 * `data:` URIs or keep them as `file://` links; dismissing either prompt is
 * treated as "don't embed" rather than aborting. Read/write failures (a
 * missing bundled CSS asset, a locked or invalid save path) are reported via
 * an error message rather than surfacing as an unhandled rejection.
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

  // Only a `file:` document can have local images to embed or link — asking
  // for any other scheme (e.g. an untitled buffer) would be a no-op prompt.
  const embedChoice =
    document.uri.scheme === 'file'
      ? await vscode.window.showQuickPick([LINK_IMAGES_LABEL, EMBED_IMAGES_LABEL], {
          placeHolder: 'How should local images be included in the exported file?'
        })
      : undefined;
  const embedImages = embedChoice === EMBED_IMAGES_LABEL;

  try {
    const dataUriMap =
      embedImages && document.uri.scheme === 'file'
        ? await buildImageDataUriMap(document.getText(), directoryPathOf(document.uri))
        : undefined;

    const { html } = render(document.getText(), {
      rewriteResourceSrc: buildExportResourceRewriter(document, dataUriMap),
      allowedImageSchemes: ['file']
    });
    const [previewCss, hljsCss, hljsDarkCss] = await Promise.all([
      readMediaFile(extensionUri, 'preview.css'),
      readMediaFile(extensionUri, 'hljs-github-light.css'),
      readMediaFile(extensionUri, 'hljs-github-dark.css')
    ]);

    const standaloneHtml = buildStandaloneHtml({
      title: basenameWithoutExt(document.uri),
      contentHtml: html,
      previewCss,
      hljsCss,
      hljsDarkCss
    });

    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(standaloneHtml, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Markdown Dual Preview: export failed — ${reason}`);
  }
}
