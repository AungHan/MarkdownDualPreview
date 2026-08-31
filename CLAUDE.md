# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install               # install dependencies
npm run build             # bundle extension + webview with esbuild (dev)
npm run build:production  # minified production bundle
npm run watch             # rebuild on change (used by F5 / Extension Development Host)
npm run typecheck         # tsc --noEmit for host tsconfig + webview tsconfig
npm test                  # vitest unit tests (fast, no VS Code needed)
npm run test:watch        # vitest in watch mode
npm run test:coverage     # vitest with v8 coverage
npm run test:integration  # launches VS Code via @vscode/test-electron
npm run package           # production build + vsce package (.vsix)
```

Press **F5** in VS Code to launch an Extension Development Host; it runs `npm run watch` as a pre-launch task automatically.

To run a single unit test file:
```bash
npx vitest run test/unit/toc.test.ts
```

## Architecture

Two separate TypeScript compilation targets, bundled independently by esbuild:

| Target | Entry | Output | Runtime |
|--------|-------|--------|---------|
| Extension host | `src/extension.ts` | `dist/extension.js` | Node 18, CJS |
| Webview | `src/webview/main.ts` | `dist/webview.js` | Browser IIFE |

Each has its own `tsconfig.json` (`./tsconfig.json` for host, `src/webview/tsconfig.json` for the webview). The webview tsconfig includes DOM libs; the host tsconfig does not.

### Host-side (`src/`)

- **`extension.ts`** — activates once, creates a single `PreviewManager`, registers the `markdownDualPreview.open` and `markdownDualPreview.exportHtml` commands.
- **`export/exportHtml.ts`** — `exportHtml()` prompts for a save location via `showSaveDialog`, then (for a `file:` document) whether to embed local images or link them via `showQuickPick`; dismissing either prompt falls back to "don't embed" rather than aborting (only cancelling the save dialog aborts the export). Renders the active document with the same stateless `Renderer` used for preview, inlines `preview.css` and both highlight.js themes (read from `media/` via `workspace.fs.readFile`) into a single dependency-free HTML string via `buildStandaloneHtml()`, and writes it with `workspace.fs.writeFile`. The export has no `<script>` tag and a `script-src 'none'` CSP — it is a static reading artifact, not a second webview. The export's `<body>` is always hardcoded `class="vscode-light"` (the source hljs stylesheets are scoped to `body.vscode-light`/`body.vscode-dark`, classes only a real webview sets), but `rescopeDarkCssForExport()` rewrites the dark theme's `body.vscode-dark`/`body.vscode-high-contrast` selectors onto that same `vscode-light` class and `buildStandaloneHtml()` gates the result (plus a dark `:root` variable-defaults block) behind `@media (prefers-color-scheme: dark)`, so exported code blocks do follow OS/browser dark mode despite the fixed body class. `buildLayoutCss()` gives `.markdown-body` a max-width/centering/padding, since `preview.css`'s own side padding is scoped to the live webview's `#content` id — absent on the export's `<main class="markdown-body">` — which otherwise renders flush against the browser viewport with no margins. `buildPrintCss()` adds static `@media print` rules (`break-inside: avoid` on `pre`/`table`/`blockquote`/`figure`, `break-after: avoid` on headings). Local `<img src>` references resolve to absolute `file://` URIs by default; when embedding is chosen, `buildImageDataUriMap()` regex-scans the raw markdown for Markdown- and HTML-syntax image references, resolves each `classifyResource`-local one to a base64 `data:` URI via `workspace.fs.stat`+`readFile` (skipping — and falling back to `file://` for — anything over `MAX_EMBED_BYTES`, 5 MB), and `buildExportResourceRewriter()`'s returned function checks that map before its `file://` fallback. The map is built as a synchronous-lookup step *before* `render()` runs because `sanitize-html`'s `transformTags` callback (which is what actually calls the rewriter) cannot be async.
- **`preview/previewManager.ts`** — owns all open previews (capped at 1–3 via `maxPreviews` setting). Manages a `Map<docKey, PreviewPanel>`, debounces live updates at 300 ms, and re-keys panels on file renames so live-update routing stays correct.
- **`preview/previewPanel.ts`** — wraps one `vscode.WebviewPanel`. Renders content, dispatches typed messages to/from the webview via `ToWebviewMessage`/`FromWebviewMessage`. Builds a per-render `<img src>` rewriter (`buildResourceRewriter`) that resolves relative to the document's directory and its containing workspace folder, then converts local matches to webview URIs via `webview.asWebviewUri`. Handles the `checkboxToggled` message from a clicked task-list checkbox: `toggleCheckbox()` regex-matches the exact `[ ]`/`[x]` marker on the reported source line (forward-searching a few lines as a safety margin) before applying a 3-character `WorkspaceEdit` — it never blindly writes to a webview-reported line number.
- **`preview/scrollSync.ts`** — bidirectional scroll sync per panel. Editor → preview via `onDidChangeTextEditorVisibleRanges`; preview → editor via `revealRange`. Uses `ScrollSyncGate` to suppress the echo loop.
- **`preview/localRoots.ts`** — computes the `localResourceRoots` granted to a panel: the extension's `dist`/`media`, every open workspace folder, and the previewed document's own directory. Pure aside from reading `vscode.workspace.workspaceFolders`.
- **`markdown/renderer.ts`** — creates a configured `markdown-it` instance (`html: true`) with source-line, heading-slug, and math-block plugins, plus `markdown-it-emoji` (`emoji.full` — shortcode-to-Unicode, no HTML output, no sanitizer changes needed) and `markdown-it-task-lists` (configured `{ enabled: true, label: false }` — note `enabled: true` means the plugin omits the `disabled` attribute itself, so task-list checkboxes are already interactive in the raw render; no ambient `.d.ts` exists upstream, see `markdown/markdown-it-task-lists.d.ts`). The custom `fence` renderer has dedicated branches for ` ```math ` (renders via `renderMath`) and ` ```mermaid ` (emits a `<pre class="mermaid" data-line="N">` placeholder with escaped source as text content — rendered client-side, see `webview/mermaidRenderer.ts`) ahead of the highlight.js fallback. Returns `{ html, toc }`; the rendered HTML is passed through `sanitizeDocumentHtml` before being returned, so no caller can obtain unsanitized HTML. Markdown is rendered on the host so markdown-it/highlight.js/katex/the sanitizer never ship to the browser.
- **`markdown/sanitize.ts`** — allowlist-sanitizes a fully rendered HTML string (via `sanitize-html`) and rewrites every `<img src>` through a caller-supplied `ResourceRewriter`. Sanitizes the whole document in one pass, not per-token, because markdown-it can split a single raw-HTML element like `<details>` across multiple tokens. The tag/attribute allowlist includes the MathML element set KaTeX's `output: 'mathml'` mode emits, with MathML presentation attributes scoped to those tags only (never `'*'`).
- **`markdown/resourcePath.ts`** — pure, dependency-free classifier: given an `<img src>` string and a `{ documentDir, workspaceRoot }` context, decides whether it's `external` (left untouched) or `local` (resolved to an absolute path for rewriting). No `vscode` import, no I/O — fully table-tested.
- **`markdown/sourceLinePlugin.ts`** — stamps `data-line` attributes on block-level elements for scroll sync target resolution.
- **`markdown/headingSlugPlugin.ts`** — adds `id` attributes to headings using `github-slugger` for TOC anchor links.
- **`markdown/toc.ts`** — walks the token stream after parsing and builds a `TocNode[]` tree from heading tokens. `inlineText()` includes `emoji`-type inline tokens alongside `text`/`code_inline`, so an emoji shortcode in a heading appears in both the rendered HTML and the TOC label.
- **`markdown/math.ts`** — `renderMath(source, displayMode)` wraps `katex.renderToString()` with `output: 'mathml'` (never `'html'`/`'htmlAndMathml'` — KaTeX's HTML mode positions glyphs with inline `style` attributes, which both the sanitizer allowlist and CSP reject). Malformed LaTeX is caught and rendered as a `.math-error` element instead of throwing or using KaTeX's own `errorColor` styling.
- **`markdown/mathBlockPlugin.ts`** — hand-rolled markdown-it block rule for `$$...$$` display math. Not `markdown-it-texmath`: that plugin's `'dollars'` delimiter set has no way to enable display `$$` without also enabling inline `$...$`, which would render prose currency (`$5`) as math. This rule only matches `$$` at the start of a line and requires a `$$` closing line/suffix, so it never matches bare `$` text. An unterminated `$$` falls through to the paragraph rule as literal text rather than auto-closing. Registered with the same `alt` terminator list markdown-it's `fence` rule uses, so a `$$` block immediately following a paragraph/list-item/blockquote (no blank line) still ends that construct correctly.
- **`util/debounce.ts`** — typed debounce utility.
- **`util/docKey.ts`** — derives a stable string key from a `vscode.Uri` (scheme + path, normalised).

### Shared (`src/shared/`)

Dependency-free modules imported by **both** bundles:

- **`messages.ts`** — typed `ToWebviewMessage`/`FromWebviewMessage` union types + a runtime type guard for messages from the (untrusted) webview. `checkboxToggled` (`{ line, checked }`) reports a clicked task-list checkbox back to the host.
- **`scrollSyncGate.ts`** — echo-suppression gate; prevents bidirectional scroll sync from looping. Pure class, injectable clock for unit tests.

### Webview-side (`src/webview/`)

- **`main.ts`** — entry point. Acquires `vscode` API, wires scroll controller, TOC pane, resizer, and message handler. Persists collapse/width state via `vscode.setState`.
- **`scrollController.ts`** — maps `data-line` attributes on DOM elements to source line numbers; drives `revealLine` and scroll reporting.
- **`tocPane.ts`** — renders the `TocNode[]` tree as an HTML list; highlights the active section on scroll.
- **`breadcrumb.ts`** — `createBreadcrumb()` renders a sticky bar above `#content` showing the heading ancestor chain to the active section (e.g. `Guide > Getting Started > Installation`), rebuilt from the `TocNode[]` tree on every `updateContent` and updated on the same `onActiveSlug` callback the TOC pane's `setActive` already uses. `findAncestorPath()` is the pure tree-walk, exported separately for unit testing. Segments are inserted via `textContent`, matching `tocPane.ts`'s security pattern; the bar hides itself via CSS `#breadcrumb:empty` when no heading is active.
- **`checkboxDecorator.ts`** — `decorateCheckboxes()` attaches `change` listeners to every rendered task-list checkbox, finding its source line from the closest `[data-line]` ancestor (stamped by `sourceLinePlugin` on `list_item_open`) and posting `{ type: 'checkboxToggled', line, checked }`. No `disabled` attribute needs removing — `markdown-it-task-lists` with `enabled: true` never adds one.
- **`tocResizer.ts`** — drag-to-resize the TOC pane; auto-collapses below a pixel threshold.
- **`mermaidRenderer.ts`** — `decorateMermaidBlocks(root, nonce)` finds `.mermaid` placeholder elements and replaces each one's content with SVG from `mermaid.render()`, preserving the element node and its `data-line`. This is the one feature in the codebase whose output is generated *after* the host-side sanitizer has already run — Mermaid needs real DOM measurement (`getBBox`), so it cannot render host-side like KaTeX. `sanitizeDocumentHtml` never sees this content; `securityLevel: 'strict'` + `htmlLabels: false` on `mermaid.initialize()` are the actual control for it (do not drop either). A `<style>` tag in the rendered SVG (Mermaid's per-diagram theme CSS) is patched with the page's script nonce before insertion, since CSP has no `'unsafe-inline'` on `style-src`. `detectMermaidTheme()` reads `document.body.classList` (same `vscode-dark`/`vscode-high-contrast` vs. `vscode-light`/`vscode-high-contrast-light` grouping the hljs stylesheets use) and `ensureThemeApplied()` re-calls `mermaid.initialize()` with Mermaid's built-in `'dark'`/`'default'` theme only when that grouping actually changed since the last call — `main.ts`'s `themeChanged` handler calls `decorateMermaidBlocks` again to re-render existing diagrams under the new theme. Each diagram's original source is stashed in `el.dataset.mermaidSource` before the first render overwrites `textContent` with SVG, so a theme-change re-render reads the diagram source, not the previous SVG output.

### Tests

- **Unit tests** (`test/unit/`) — run with Vitest in Node, no VS Code runtime. The `vscode` module is stubbed via `test/mocks/vscode.ts` (configured as an alias in `vitest.config.ts`). Coverage excludes `src/webview/**`, `src/shared/messages.ts`, and `src/extension.ts`.
- **Integration tests** (`test/integration/`) — run inside a real VS Code instance via `@vscode/test-electron`. Pre-compiled by `tsc -p test/integration/tsconfig.json` before running.

### Content Security Policy

The exported standalone HTML (`export/exportHtml.ts`) carries its own, separate CSP (`default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; ...`) — it is not a webview and has no nonce; `'unsafe-inline'` is safe there only because `script-src 'none'` independently blocks all script execution.

The webview uses a strict CSP (`cspSource` + nonce on the single inline script). All styles load as file URIs; no `unsafe-inline`. `img-src` additionally allows `https:` and `data:` so rewritten local images and remote badges both load. `form-action 'none'` is set explicitly — `default-src 'none'` does not cover form submission, and raw HTML (now enabled) can contain a `<form>`. The nonce is generated fresh per panel creation in `preview/webviewHtml.ts`.

`style-src` additionally allows `'nonce-${nonce}'` (the same nonce as the script tag) — this exists solely so Mermaid's per-diagram `<style>` blocks (patched with that nonce in `webview/mermaidRenderer.ts` before insertion) aren't silently blocked; every other stylesheet keeps loading via `cspSource` alone. `script-src` is not widened for Mermaid — it bundles into `dist/webview.js`, which already carries the script tag's nonce.

Sanitization (`markdown/sanitize.ts`) is a second, independent layer on top of the CSP: it strips `<script>`, event-handler attributes, `<base>`, `<form>`, `<style>` attributes, and disallowed schemes before HTML ever reaches the webview.
