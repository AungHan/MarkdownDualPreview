# Markdown Dual Preview

Preview up to **three** Markdown files side by side, each with an embedded
**section navigation pane**.

## Features

- **Custom Markdown preview** rendered with [markdown-it](https://github.com/markdown-it/markdown-it).
- **Multiple previews at once** — open previews beside your editor for up to three
  files simultaneously (2 by default, configurable). Opening beyond the cap is
  blocked with a message until you close one.
- **Embedded navigation pane** in every preview: a collapsible sidebar listing the
  document's headings. Click a heading to jump to it; the active section is
  highlighted as you scroll.
- **Live update** — the preview and its navigation refresh as you type (debounced).
- **Bidirectional scroll sync** between the source editor and its preview.
- **Syntax highlighting** for fenced code blocks via
  [highlight.js](https://highlightjs.org/), with GitHub-style theming that adapts
  to your VS Code light / dark / high-contrast theme.

## Usage

1. Open a Markdown (`.md`) file, **or** right-click a Markdown file in the Explorer.
2. Run **Open Dual Preview** — from the editor title bar (the preview icon), the
   Command Palette (`Markdown Dual Preview: Open Dual Preview`), or the Explorer
   right-click menu.
3. Repeat for additional files to view up to three previews at once.

## Settings

| Setting | Default | Description |
|---|---|---|
| `markdownDualPreview.maxPreviews` | `2` | Maximum previews open at once (1–3). Lowering it doesn't close previews already open. |

## Known limitations (v1)

- **Raw HTML in Markdown is escaped**, not rendered (`html: false`), so no HTML
  sanitization is required. Standard Markdown — including fenced code, tables, and
  task lists — renders normally.
- **Previews close on a window reload** and reopen with one click; session state
  (scroll, nav collapse) is retained while the window stays open.

## Development

```bash
npm install
npm run build        # bundle with esbuild
npm run watch        # rebuild on change (used by F5)
npm run typecheck    # tsc --noEmit for host + webview
npm test             # vitest unit tests
npm run test:integration   # @vscode/test-electron (launches VS Code)
```

Press **F5** in VS Code to launch an Extension Development Host with the extension
loaded.

## Architecture

- Markdown is rendered in the **extension host** (`src/markdown/*`); the resulting
  HTML + table-of-contents tree is posted to the webview. This keeps markdown-it
  and highlight.js out of the browser bundle and makes the pipeline unit testable.
- `src/preview/previewManager.ts` enforces the two-preview cap, reuses an existing
  preview when the same file is reopened, and drives live updates and theming.
- The webview (`src/webview/*`) injects content, builds the nav pane, and handles
  scroll sync under a strict Content-Security-Policy (nonce-allowed script, all
  styles loaded as files).
