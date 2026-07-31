import * as vscode from 'vscode';
import { isFromWebviewMessage, type ThemeKind, type ToWebviewMessage } from '../shared/messages';
import type { Renderer } from '../markdown/renderer';
import { buildWebviewHtml, generateNonce } from './webviewHtml';

/** Map a VS Code color theme to the webview's theme family. */
function toThemeKind(kind: vscode.ColorThemeKind): ThemeKind {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
      return 'light';
    case vscode.ColorThemeKind.Dark:
      return 'dark';
    case vscode.ColorThemeKind.HighContrastLight:
      return 'highContrastLight';
    default:
      return 'highContrast';
  }
}

/**
 * Wraps a single {@link vscode.WebviewPanel}: owns its HTML bootstrap, message
 * dispatch, and per-panel disposables. One instance per open preview.
 */
export class PreviewPanel {
  private disposed = false;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly disposeEmitter = new vscode.EventEmitter<void>();
  private scrollHandler: ((line: number) => void) | undefined;
  private readyHandler: (() => void) | undefined;

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private document: vscode.TextDocument,
    private readonly render: Renderer,
    extensionUri: vscode.Uri
  ) {
    this.panel.webview.html = this.buildHtml(extensionUri);

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((raw) => this.handleMessage(raw))
    );
    // Not tracked in `this.disposables`: it is the trigger for dispose(), and
    // VS Code cleans up the panel's own onDidDispose listeners when it disposes.
    this.panel.onDidDispose(() => this.dispose());
  }

  get uri(): vscode.Uri {
    return this.document.uri;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Register a callback fired once when the webview first reports ready. */
  onReady(handler: () => void): void {
    this.readyHandler = handler;
  }

  /** Register the caller notified when the user scrolls the preview. */
  onScroll(handler: (line: number) => void): void {
    this.scrollHandler = handler;
  }

  /**
   * Register a callback fired once when this preview is disposed.
   *
   * Backed by our own emitter (fired deterministically inside {@link dispose})
   * rather than the panel's `onDidDispose`, so cleanup cannot be skipped by
   * VS Code's mid-delivery listener removal during teardown.
   */
  onDidDispose(callback: () => void): void {
    this.disposeEmitter.event(callback);
  }

  reveal(): void {
    if (this.disposed) {
      return;
    }
    this.panel.reveal(this.panel.viewColumn);
  }

  /**
   * Point this preview at a new document identity (after a rename) and
   * re-render so `uri` — used for scroll-sync editor matching — stays current.
   */
  retarget(document: vscode.TextDocument): void {
    this.document = document;
    this.update();
  }

  /** Re-render the (possibly changed) document and push it to the webview. */
  update(document?: vscode.TextDocument): void {
    if (document) {
      this.document = document;
    }
    const { html, toc } = this.render(this.document.getText());
    this.post({ type: 'updateContent', html, toc });
  }

  /** Scroll the preview so the given source line is at the top of the viewport. */
  revealLine(line: number): void {
    this.post({ type: 'revealLine', line });
  }

  postThemeChanged(kind: vscode.ColorThemeKind): void {
    this.post({ type: 'themeChanged', kind: toThemeKind(kind) });
  }

  postSettings(maxContentWidth: number): void {
    this.post({ type: 'settingsChanged', maxContentWidth });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    // Notify subscribers (manager cleanup, scroll sync) before tearing down, so
    // the panel is always removed from tracking even mid-teardown.
    this.disposeEmitter.fire();
    this.disposeEmitter.dispose();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }

  private post(message: ToWebviewMessage): void {
    if (this.disposed) {
      return;
    }
    // The webview can be torn down between this guard and the call; postMessage
    // then throws or rejects with "Webview is disposed". Swallow both.
    try {
      const result = this.panel.webview.postMessage(message);
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Panel disposed underneath us; nothing to deliver.
    }
  }

  private handleMessage(raw: unknown): void {
    if (!isFromWebviewMessage(raw)) {
      return;
    }
    switch (raw.type) {
      case 'ready':
        this.update();
        this.readyHandler?.();
        break;
      case 'scrollChanged':
        this.scrollHandler?.(raw.line);
        break;
      case 'tocToggled':
        // Collapse state is persisted webview-side via setState; nothing to do here.
        break;
      case 'copyText':
        vscode.env.clipboard.writeText(raw.text).then(undefined, () => undefined);
        break;
    }
  }

  private buildHtml(extensionUri: vscode.Uri): string {
    const webview = this.panel.webview;
    const asset = (folder: string, file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, folder, file)).toString();
    return buildWebviewHtml({
      cspSource: webview.cspSource,
      nonce: generateNonce(),
      scriptUri: asset('dist', 'webview.js'),
      styleUri: asset('media', 'preview.css'),
      hljsLightUri: asset('media', 'hljs-github-light.css'),
      hljsDarkUri: asset('media', 'hljs-github-dark.css')
    });
  }
}
