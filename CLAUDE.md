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

Single unit test file: `npx vitest run test/unit/toc.test.ts`

## Architecture

Two TypeScript compilation targets, bundled independently by esbuild:

| Target | Entry | Output | Runtime |
|--------|-------|--------|---------|
| Extension host | `src/extension.ts` | `dist/extension.js` | Node 18, CJS |
| Webview | `src/webview/main.ts` | `dist/webview.js` | Browser IIFE |

Each has its own `tsconfig.json` (`./tsconfig.json` host, `src/webview/tsconfig.json` webview — includes DOM libs).

### Host-side (`src/`)

- **`extension.ts`** — activates once, creates `PreviewManager`, registers `markdownDualPreview.open`/`exportHtml` commands.
- **`export/exportHtml.ts`** — renders the doc with the same stateless `Renderer` used for preview into a dependency-free standalone HTML file (no `<script>`, `script-src 'none'` CSP). Prompts embed-vs-link images via `showQuickPick` (`file:` docs only; dismiss = link, not abort). Dark-theme hljs CSS is re-scoped to the export's fixed `vscode-light` body class and gated behind `@media (prefers-color-scheme: dark)`. Images over `MAX_EMBED_BYTES` (5 MB) fall back to `file://` instead of embedding.
- **`preview/previewManager.ts`** — owns open previews (capped via `maxPreviews`), debounces live updates 300 ms, re-keys panels on rename.
- **`preview/previewPanel.ts`** — wraps one `WebviewPanel`; renders content, routes typed messages. `toggleCheckbox()` regex-matches the exact marker on the reported line before editing — never trusts a raw line number blindly.
- **`preview/scrollSync.ts`** — bidirectional scroll sync; `ScrollSyncGate` suppresses the echo loop.
- **`preview/localRoots.ts`** — computes `localResourceRoots` for a panel (extension dist/media, workspace folders, doc's own dir).
- **`markdown/renderer.ts`** — configured `markdown-it` (source-line, heading-slug, math-block, emoji, task-lists plugins). Custom fence renderer branches for `math`/`mermaid` before the highlight.js fallback. Output always passes through `sanitizeDocumentHtml` before returning.
- **`markdown/sanitize.ts`** — allowlist-sanitizes the full rendered HTML (`sanitize-html`) in one pass and rewrites every `<img src>`. Allowlist includes KaTeX's MathML tag set.
- **`markdown/resourcePath.ts`** — pure classifier: `<img src>` → `external` or `local`. No `vscode` import, no I/O.
- **`markdown/sourceLinePlugin.ts`** / **`headingSlugPlugin.ts`** — stamp `data-line`/heading `id` for scroll sync and TOC anchors.
- **`markdown/toc.ts`** — builds `TocNode[]` tree from heading tokens.
- **`markdown/math.ts`** — `renderMath()` via KaTeX, `output: 'mathml'` only (HTML mode's inline `style` attrs violate CSP/sanitizer). Malformed LaTeX renders as `.math-error`.
- **`markdown/mathBlockPlugin.ts`** — hand-rolled `$$...$$` block rule (not `markdown-it-texmath`, which can't enable display-only `$$` without also enabling inline `$...$` and misfiring on prose currency).
- **`util/debounce.ts`** / **`util/docKey.ts`** — typed debounce; stable string key from a `vscode.Uri`.

### Shared (`src/shared/`)

- **`messages.ts`** — typed `ToWebviewMessage`/`FromWebviewMessage` unions + runtime guard for (untrusted) webview messages.
- **`scrollSyncGate.ts`** — echo-suppression gate, pure class with injectable clock.

### Webview-side (`src/webview/`)

- **`main.ts`** — entry point; wires scroll controller, TOC pane, resizer, message handler; persists collapse/width via `vscode.setState`.
- **`scrollController.ts`** — maps `data-line` to source lines; drives `revealLine`/scroll reporting.
- **`tocPane.ts`** — renders `TocNode[]` as a list, highlights active section.
- **`breadcrumb.ts`** — sticky heading-ancestor bar above `#content`; `findAncestorPath()` is the pure tree-walk.
- **`checkboxDecorator.ts`** — posts `checkboxToggled` from a clicked task-list checkbox's source line.
- **`tocResizer.ts`** — drag-to-resize TOC pane, auto-collapses below a threshold.
- **`mermaidRenderer.ts`** — `decorateMermaidBlocks(root, nonce)` renders `.mermaid` placeholders to SVG client-side (only feature whose output is generated *after* the host sanitizer runs — Mermaid needs real DOM measurement). `securityLevel: 'strict'` + `htmlLabels: false` + `suppressErrorRendering: true` on `mermaid.initialize()` are load-bearing — don't drop any (the last one makes parse errors reject `render()` instead of resolving with Mermaid's own error SVG, so the `.mermaid-error` catch branch actually runs). `detectMermaidTheme()` follows `document.body`'s `vscode-dark`/`vscode-high-contrast` classes (same grouping hljs uses); `main.ts`'s `themeChanged` handler re-renders diagrams in place on theme change, reading source from `el.dataset.mermaidSource` (stashed before the first render overwrites `textContent`). A `renderGeneration` counter drops stale results if a newer render starts before an older one resolves. `<style>` tags in the SVG get the page's script nonce patched in.

### Tests

- **Unit** (`test/unit/`) — Vitest, no VS Code runtime; `vscode` stubbed via `test/mocks/vscode.ts`. Coverage excludes `src/webview/**`, `src/shared/messages.ts`, `src/extension.ts`.
- **Integration** (`test/integration/`) — real VS Code via `@vscode/test-electron`; pre-compiled by its own `tsconfig.json`.

### Content Security Policy

- Export HTML: separate CSP (`script-src 'none'`), no nonce — `'unsafe-inline'` on `style-src` is safe there only because scripts are fully blocked.
- Webview: strict CSP, `cspSource` + nonce on the one inline script, no `unsafe-inline`. `img-src` allows `https:`/`data:`. `form-action 'none'` set explicitly. `style-src` also allows `'nonce-${nonce}'` solely for Mermaid's per-diagram `<style>` blocks.
- `markdown/sanitize.ts` is an independent second layer on top of the CSP (strips `<script>`, event handlers, `<base>`, `<form>`, disallowed schemes).
