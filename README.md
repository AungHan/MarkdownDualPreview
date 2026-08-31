# Markdown Dual Preview

Preview up to **three** Markdown files side by side, each with an embedded
**section navigation pane**.

## Features

- Custom Markdown preview via [markdown-it](https://github.com/markdown-it/markdown-it)
- Local images and sanitized raw HTML (`<details>`, tables, etc.)
- Up to 3 previews at once, side by side with your editor
- Collapsible navigation pane with active-section highlighting and filtering
- Live update as you type, with bidirectional scroll sync
- Syntax highlighting ([highlight.js](https://highlightjs.org/)) that follows your VS Code theme
- Copy-code button on fenced code blocks
- Ctrl + scroll to zoom (50%–300%, persisted per panel)
- Math (` ```math `, `$$...$$`) via [KaTeX](https://katex.org/)
- Diagrams (` ```mermaid `) via [Mermaid](https://mermaid.js.org/)
- GitHub-style alerts (`> [!NOTE]`, `[!TIP]`, `[!WARNING]`, etc.)
- YAML front matter shown as a collapsible metadata table
- Emoji shortcodes (`:smile:`)
- Interactive task list checkboxes, synced to the source file
- Section breadcrumb bar
- Reading stats (word count, est. reading time)
- Export to standalone HTML — dark-mode-aware highlighting, print-tuned CSS, optional image embedding

## Usage

1. Open a Markdown (`.md`) file, **or** right-click a Markdown file in the Explorer.
2. Run **Open Dual Preview** — from the editor title bar (the preview icon), the
   Command Palette (`Markdown Dual Preview: Open Dual Preview`), or the Explorer
   right-click menu.
3. Repeat for additional files to view up to three previews at once.
4. To export, run **Markdown Dual Preview: Export to HTML** from the Command
   Palette while a Markdown file is active, pick a save location, then choose
   whether to embed local images or link to them.

## Settings

| Setting | Default | Description |
|---|---|---|
| `markdownDualPreview.maxPreviews` | `2` | Maximum previews open at once (1–3). Lowering it doesn't close previews already open. |
| `markdownDualPreview.maxContentWidth` | `0` | Maximum width of the rendered content in pixels. `0` means full width. Set to e.g. `900` to constrain the text column for readability. |

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

- **Extension host** (`src/markdown/*`) renders Markdown to sanitized HTML + a TOC tree, posted to the webview. Keeps markdown-it/highlight.js/the sanitizer out of the browser bundle.
- **`src/preview/`** manages preview panels, the multi-preview cap, live updates, and local image resource roots.
- **Webview** (`src/webview/*`) renders content, nav pane, scroll sync, code-copy, checkboxes, breadcrumb, and zoom, under a strict CSP.
- **`src/export/exportHtml.ts`** renders the same document to a self-contained, scriptless standalone HTML file.
