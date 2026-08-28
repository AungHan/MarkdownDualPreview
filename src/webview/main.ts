import type { FromWebviewMessage, ToWebviewMessage } from '../shared/messages';
import { createBreadcrumb } from './breadcrumb';
import { decorateCheckboxes } from './checkboxDecorator';
import { decorateCodeBlocks } from './codeCopy';
import { decorateMermaidBlocks } from './mermaidRenderer';
import { createScrollController } from './scrollController';
import { createZoomController } from './zoomController';
import { initTocResizer } from './tocResizer';
import { renderToc, type TocView } from './tocPane';
import { computeReadingStats, formatReadingStats } from './wordCount';

const DEFAULT_TOC_WIDTH = 260;
const TOC_COLLAPSE_THRESHOLD = 120;

// Must be read synchronously at module top level — `document.currentScript`
// is only valid during the script's initial (non-async) execution.
const scriptNonce = (document.currentScript as HTMLScriptElement | null)?.nonce ?? '';

interface PersistedState {
  collapsed?: boolean;
  width?: number;
  zoom?: number;
}

interface VsCodeApi {
  postMessage(message: FromWebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

function requireEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`markdown-dual-preview: missing #${id} element`);
  }
  return el;
}

const contentEl = requireEl('content');
const tocListEl = requireEl('toc-list');
const tocPaneEl = requireEl('toc-pane');
const toggleBtn = requireEl('toc-toggle');
const resizerEl = requireEl('toc-resizer');
const tocFilterEl = requireEl('toc-filter') as HTMLInputElement;
const footerEl = requireEl('preview-footer');
const breadcrumbEl = requireEl('breadcrumb');

function post(message: FromWebviewMessage): void {
  vscodeApi.postMessage(message);
}

let tocView: TocView | null = null;
// Session-transient TOC filter; re-applied after every live re-render, never persisted.
let tocFilter = '';
const breadcrumb = createBreadcrumb(breadcrumbEl);
const scroll = createScrollController(
  contentEl,
  (line) => post({ type: 'scrollChanged', line }),
  (slug) => {
    tocView?.setActive(slug);
    breadcrumb.update(slug);
  }
);
const zoom = createZoomController(contentEl, () => persistState());

// Restore collapse + width persisted across webview reloads within a session.
const savedState = vscodeApi.getState() as PersistedState | undefined;
let paneWidth = clampWidth(savedState?.width ?? DEFAULT_TOC_WIDTH);
tocPaneEl.style.setProperty('--toc-width', `${paneWidth}px`);
if (savedState?.collapsed) {
  tocPaneEl.classList.add('collapsed');
}
if (savedState?.zoom) {
  zoom.setLevel(savedState.zoom);
}
syncToggleAria();

function clampWidth(width: number): number {
  return Math.min(Math.max(width, TOC_COLLAPSE_THRESHOLD), DEFAULT_TOC_WIDTH);
}

function persistState(): void {
  const state: PersistedState = {
    collapsed: tocPaneEl.classList.contains('collapsed'),
    width: paneWidth,
    zoom: zoom.level()
  };
  vscodeApi.setState(state);
}

function setCollapsed(collapsed: boolean): void {
  tocPaneEl.classList.toggle('collapsed', collapsed);
  syncToggleAria();
  persistState();
  post({ type: 'tocToggled', collapsed });
}

toggleBtn.addEventListener('click', () => {
  setCollapsed(!tocPaneEl.classList.contains('collapsed'));
});

initTocResizer({
  pane: tocPaneEl,
  resizer: resizerEl,
  maxWidth: DEFAULT_TOC_WIDTH,
  collapseThreshold: TOC_COLLAPSE_THRESHOLD,
  onWidthChange: (width) => {
    paneWidth = width;
    persistState();
  },
  onCollapse: () => setCollapsed(true)
});

function syncToggleAria(): void {
  toggleBtn.setAttribute('aria-expanded', String(!tocPaneEl.classList.contains('collapsed')));
}

tocFilterEl.addEventListener('input', () => {
  tocFilter = tocFilterEl.value;
  tocView?.filter(tocFilter);
});
tocFilterEl.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    tocFilterEl.value = '';
    tocFilter = '';
    tocView?.filter('');
  }
});

function updateReadingStats(): void {
  footerEl.textContent = formatReadingStats(computeReadingStats(contentEl.textContent ?? ''));
}

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'updateContent': {
      // Preserve reading position across live-update re-renders.
      const anchor = scroll.currentTopLine();
      contentEl.innerHTML = message.html;
      // Count author content before decorators inject chrome (Copy buttons,
      // Mermaid SVG) into #content and inflate the reading stats.
      updateReadingStats();
      tocView = renderToc(tocListEl, message.toc);
      tocView.filter(tocFilter);
      breadcrumb.setTree(message.toc);
      scroll.rebuild();
      decorateCodeBlocks(contentEl, (text) => post({ type: 'copyText', text }));
      decorateCheckboxes(contentEl, (line, checked) => post({ type: 'checkboxToggled', line, checked }));
      void decorateMermaidBlocks(contentEl, scriptNonce);
      if (anchor !== null) {
        scroll.revealLine(anchor);
      }
      break;
    }
    case 'revealLine':
      scroll.revealLine(message.line);
      break;
    case 'themeChanged':
      // VS Code toggles the body theme class automatically; the scoped hljs
      // stylesheets react to it, so no explicit work is needed here.
      break;
    case 'settingsChanged': {
      const width = message.maxContentWidth > 0 ? `${message.maxContentWidth}px` : 'none';
      contentEl.style.maxWidth = width;
      break;
    }
  }
});

post({ type: 'ready' });
