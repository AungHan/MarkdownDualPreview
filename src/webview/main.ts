import type { FromWebviewMessage, ToWebviewMessage } from '../shared/messages';
import { createScrollController } from './scrollController';
import { initTocResizer } from './tocResizer';
import { renderToc, type TocView } from './tocPane';

const DEFAULT_TOC_WIDTH = 260;
const TOC_COLLAPSE_THRESHOLD = 120;

interface PersistedState {
  collapsed?: boolean;
  width?: number;
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

function post(message: FromWebviewMessage): void {
  vscodeApi.postMessage(message);
}

let tocView: TocView | null = null;
const scroll = createScrollController(
  contentEl,
  (line) => post({ type: 'scrollChanged', line }),
  (slug) => tocView?.setActive(slug)
);

// Restore collapse + width persisted across webview reloads within a session.
const savedState = vscodeApi.getState() as PersistedState | undefined;
let paneWidth = clampWidth(savedState?.width ?? DEFAULT_TOC_WIDTH);
tocPaneEl.style.setProperty('--toc-width', `${paneWidth}px`);
if (savedState?.collapsed) {
  tocPaneEl.classList.add('collapsed');
}
syncToggleAria();

function clampWidth(width: number): number {
  return Math.min(Math.max(width, TOC_COLLAPSE_THRESHOLD), DEFAULT_TOC_WIDTH);
}

function persistState(): void {
  const state: PersistedState = {
    collapsed: tocPaneEl.classList.contains('collapsed'),
    width: paneWidth
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

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'updateContent': {
      // Preserve reading position across live-update re-renders.
      const anchor = scroll.currentTopLine();
      contentEl.innerHTML = message.html;
      tocView = renderToc(tocListEl, message.toc);
      scroll.rebuild();
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
  }
});

post({ type: 'ready' });
