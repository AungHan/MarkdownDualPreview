# Markdown Dual Preview

Preview up to **three** Markdown files side by side, each with an embedded
**section navigation pane**.

## Features

- **Custom Markdown preview** rendered with [markdown-it](https://github.com/markdown-it/markdown-it).
- **Local images and safe raw HTML** — `![](./docs/shot.png)` and workspace-relative
  images render correctly, and common README HTML (`<details>`, `<br>`, `<kbd>`,
  HTML tables) renders as elements instead of literal text. Rendered HTML is passed
  through an allowlist sanitizer, so `<script>` tags and event-handler attributes are
  always stripped.
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
- **Copy code button** — hover over any fenced code block to reveal a **Copy**
  button; it briefly shows **Copied!** on success.
- **Ctrl + scroll zoom** — hold `Ctrl` and scroll inside a preview to zoom the
  content between 50% and 300% in 10% steps. Zoom level is saved per panel and
  restored when the panel is reopened.
- **Math** — ` ```math ` fenced blocks and `$$...$$` blocks render as typeset
  MathML via [KaTeX](https://katex.org/). Inline `$...$` math is not supported
  (see Known limitations). A malformed formula shows an inline error instead of
  breaking the rest of the document.
- **Diagrams** — ` ```mermaid ` fenced blocks render as SVG diagrams (flowcharts,
  sequence diagrams, class diagrams, and more) via [Mermaid](https://mermaid.js.org/).
  A malformed diagram shows an inline error instead of breaking the rest of the
  document.
- **GitHub-style alerts** — `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`,
  and `> [!CAUTION]` blockquotes render as color-coded callouts.
- **YAML front matter** rendered as a collapsible metadata table at the top of the
  document instead of literal `---` text.
- **Emoji shortcodes** — `:smile:`, `:wave:`, and the rest of the GitHub emoji set
  render as Unicode characters. Unrecognized shortcodes are left as literal text.
- **Interactive task list checkboxes** — clicking a `- [ ]` / `- [x]` checkbox in
  the preview toggles it directly in the source file.
- **Section breadcrumb** — a sticky bar above the content shows the heading
  ancestor chain for the section currently in view (e.g. `Guide > Setup >
  Installation`); click a segment to jump to it.
- **Table of contents filtering** — type in the nav pane's search box to narrow
  the heading list to matching sections (and their ancestors).
- **Reading stats** — word count and estimated reading time shown in the preview
  footer.
- **Export to HTML** — render the active document to a self-contained, static
  HTML file (all CSS inlined, no JavaScript) via **Markdown Dual Preview: Export
  to HTML** in the Command Palette.

## Usage

1. Open a Markdown (`.md`) file, **or** right-click a Markdown file in the Explorer.
2. Run **Open Dual Preview** — from the editor title bar (the preview icon), the
   Command Palette (`Markdown Dual Preview: Open Dual Preview`), or the Explorer
   right-click menu.
3. Repeat for additional files to view up to three previews at once.
4. To export, run **Markdown Dual Preview: Export to HTML** from the Command
   Palette while a Markdown file is active, then pick a save location.

## Settings

| Setting | Default | Description |
|---|---|---|
| `markdownDualPreview.maxPreviews` | `2` | Maximum previews open at once (1–3). Lowering it doesn't close previews already open. |
| `markdownDualPreview.maxContentWidth` | `0` | Maximum width of the rendered content in pixels. `0` means full width. Set to e.g. `900` to constrain the text column for readability. |

## Known limitations (v1)

- **Previews close on a window reload** and reopen with one click; session state
  (scroll, nav collapse) is retained while the window stays open.
- **The set of folders a preview can load images from is fixed when it opens.** If you
  add a workspace folder, or a rename moves the document to a new directory, close and
  reopen the preview to pick up the new folder.
- **Raw HTML blocks have no scroll-sync anchor**, so scrolling through one interpolates
  between the nearest Markdown elements above and below it.
- **`<picture>` renders via its `<img>` fallback only**; `<source srcset>` candidates are
  not rewritten to local files and are dropped.
- **Inline `$...$` math is not supported** — only block ` ```math ` fences and `$$...$$`
  render as math, so `$5`/`$10` in prose is never misread as a formula.
- **Math blocks have no sub-formula scroll-sync anchor**, same granularity as a code block:
  the whole ` ```math `/`$$...$$` block maps to one source line.
- **Mermaid diagrams don't follow VS Code's active color theme** — they render with
  Mermaid's default theme regardless of light/dark mode.
- **Mermaid `click` interactivity is disabled** (diagram source is untrusted input,
  same trust level as raw HTML) and diagrams have no pan/zoom/export controls.
- **Diagrams have no sub-diagram scroll-sync anchor**, same granularity as a code
  block: the whole ` ```mermaid ` fence maps to one source line.
- **Exported HTML has no PDF option** — open the exported file in a browser and
  use its Print > Save as PDF if you need one.
- **Exported HTML always uses the light syntax-highlighting theme**, regardless
  of the browser's or OS's dark mode setting.
- **Exported HTML resolves local images to absolute `file://` paths** — they load
  when opened on the same machine, but the file isn't portable to another
  computer and the paths are visible in the HTML source.
- **Mermaid diagrams export as their raw source text**, not rendered SVG — diagram
  rendering requires the browser-side Mermaid script, which the export
  intentionally omits (no JavaScript in exported files).

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
  HTML + table-of-contents tree is posted to the webview. This keeps markdown-it,
  highlight.js, and the HTML sanitizer out of the browser bundle and makes the
  pipeline unit testable. `sanitize.ts` allowlist-sanitizes the fully rendered
  document (raw HTML is enabled) and rewrites local `<img src>` references —
  from both Markdown syntax and raw HTML — to webview-loadable URIs via
  `resourcePath.ts`, a pure module that classifies each reference as remote or
  workspace-local.
- `src/preview/previewManager.ts` enforces the two-preview cap, reuses an existing
  preview when the same file is reopened, and drives live updates and theming.
  `localRoots.ts` computes the folders each panel may load local images from: the
  extension's own `dist`/`media`, every open workspace folder, and the document's
  own directory.
- The webview (`src/webview/*`) injects content, builds the nav pane, and handles
  scroll sync under a strict Content-Security-Policy (nonce-allowed script, all
  styles loaded as files). `codeCopy.ts` attaches hover-reveal copy buttons to
  every `<pre>` element after each content update. `checkboxDecorator.ts` wires
  task-list checkbox clicks back to the extension host, which validates the
  exact `[ ]`/`[x]` marker before editing the source. `breadcrumb.ts` derives
  the heading ancestor chain from the same table-of-contents tree the nav pane
  uses. `zoomController.ts` maps Ctrl+wheel events to CSS `zoom` and persists
  the level via `vscode.setState`.
- `src/export/exportHtml.ts` reuses the same host-side renderer to produce a
  self-contained HTML file: all CSS is inlined and the document ships with no
  `<script>` tag and its own `script-src 'none'` Content-Security-Policy.
