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

- **`extension.ts`** — activates once, creates a single `PreviewManager`, registers the `markdownDualPreview.open` command.
- **`preview/previewManager.ts`** — owns all open previews (capped at 1–3 via `maxPreviews` setting). Manages a `Map<docKey, PreviewPanel>`, debounces live updates at 300 ms, and re-keys panels on file renames so live-update routing stays correct.
- **`preview/previewPanel.ts`** — wraps one `vscode.WebviewPanel`. Renders content, dispatches typed messages to/from the webview via `ToWebviewMessage`/`FromWebviewMessage`. Builds a per-render `<img src>` rewriter (`buildResourceRewriter`) that resolves relative to the document's directory and its containing workspace folder, then converts local matches to webview URIs via `webview.asWebviewUri`.
- **`preview/scrollSync.ts`** — bidirectional scroll sync per panel. Editor → preview via `onDidChangeTextEditorVisibleRanges`; preview → editor via `revealRange`. Uses `ScrollSyncGate` to suppress the echo loop.
- **`preview/localRoots.ts`** — computes the `localResourceRoots` granted to a panel: the extension's `dist`/`media`, every open workspace folder, and the previewed document's own directory. Pure aside from reading `vscode.workspace.workspaceFolders`.
- **`markdown/renderer.ts`** — creates a configured `markdown-it` instance (`html: true`) with source-line and heading-slug plugins. Returns `{ html, toc }`; the rendered HTML is passed through `sanitizeDocumentHtml` before being returned, so no caller can obtain unsanitized HTML. Markdown is rendered on the host so markdown-it/highlight.js/the sanitizer never ship to the browser.
- **`markdown/sanitize.ts`** — allowlist-sanitizes a fully rendered HTML string (via `sanitize-html`) and rewrites every `<img src>` through a caller-supplied `ResourceRewriter`. Sanitizes the whole document in one pass, not per-token, because markdown-it can split a single raw-HTML element like `<details>` across multiple tokens.
- **`markdown/resourcePath.ts`** — pure, dependency-free classifier: given an `<img src>` string and a `{ documentDir, workspaceRoot }` context, decides whether it's `external` (left untouched) or `local` (resolved to an absolute path for rewriting). No `vscode` import, no I/O — fully table-tested.
- **`markdown/sourceLinePlugin.ts`** — stamps `data-line` attributes on block-level elements for scroll sync target resolution.
- **`markdown/headingSlugPlugin.ts`** — adds `id` attributes to headings using `github-slugger` for TOC anchor links.
- **`markdown/toc.ts`** — walks the token stream after parsing and builds a `TocNode[]` tree from heading tokens.
- **`util/debounce.ts`** — typed debounce utility.
- **`util/docKey.ts`** — derives a stable string key from a `vscode.Uri` (scheme + path, normalised).

### Shared (`src/shared/`)

Dependency-free modules imported by **both** bundles:

- **`messages.ts`** — typed `ToWebviewMessage`/`FromWebviewMessage` union types + a runtime type guard for messages from the (untrusted) webview.
- **`scrollSyncGate.ts`** — echo-suppression gate; prevents bidirectional scroll sync from looping. Pure class, injectable clock for unit tests.

### Webview-side (`src/webview/`)

- **`main.ts`** — entry point. Acquires `vscode` API, wires scroll controller, TOC pane, resizer, and message handler. Persists collapse/width state via `vscode.setState`.
- **`scrollController.ts`** — maps `data-line` attributes on DOM elements to source line numbers; drives `revealLine` and scroll reporting.
- **`tocPane.ts`** — renders the `TocNode[]` tree as an HTML list; highlights the active section on scroll.
- **`tocResizer.ts`** — drag-to-resize the TOC pane; auto-collapses below a pixel threshold.

### Tests

- **Unit tests** (`test/unit/`) — run with Vitest in Node, no VS Code runtime. The `vscode` module is stubbed via `test/mocks/vscode.ts` (configured as an alias in `vitest.config.ts`). Coverage excludes `src/webview/**`, `src/shared/messages.ts`, and `src/extension.ts`.
- **Integration tests** (`test/integration/`) — run inside a real VS Code instance via `@vscode/test-electron`. Pre-compiled by `tsc -p test/integration/tsconfig.json` before running.

### Content Security Policy

The webview uses a strict CSP (`cspSource` + nonce on the single inline script). All styles load as file URIs; no `unsafe-inline`. `img-src` additionally allows `https:` and `data:` so rewritten local images and remote badges both load. `form-action 'none'` is set explicitly — `default-src 'none'` does not cover form submission, and raw HTML (now enabled) can contain a `<form>`. The nonce is generated fresh per panel creation in `preview/webviewHtml.ts`.

Sanitization (`markdown/sanitize.ts`) is a second, independent layer on top of the CSP: it strips `<script>`, event-handler attributes, `<base>`, `<form>`, `<style>` attributes, and disallowed schemes before HTML ever reaches the webview.
