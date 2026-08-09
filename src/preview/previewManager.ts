import * as vscode from 'vscode';
import { createRenderer, type Renderer } from '../markdown/renderer';
import { debounce, type Debounced } from '../util/debounce';
import { docKey } from '../util/docKey';
import { localResourceRoots } from './localRoots';
import { PreviewPanel } from './previewPanel';
import { ScrollSync } from './scrollSync';

const VIEW_TYPE = 'markdownDualPreview';
const CONFIG_SECTION = 'markdownDualPreview';
const LIVE_UPDATE_DELAY_MS = 300;
const DEFAULT_MAX_PREVIEWS = 2;
const MIN_MAX_PREVIEWS = 1;
const MAX_MAX_PREVIEWS = 3;
const DEFAULT_MAX_CONTENT_WIDTH = 0;

/**
 * Owns the set of open previews. Enforces the hard cap of two simultaneous
 * previews, reuses an existing preview when the same document is reopened, and
 * drives debounced live updates and theme changes.
 *
 * A single instance is created in `activate()` and registered in
 * `context.subscriptions`; it is not a global singleton, which keeps it unit
 * testable with a mocked `vscode`.
 */
export class PreviewManager implements vscode.Disposable {
  private readonly panels = new Map<string, PreviewPanel>();
  private readonly debouncers = new Map<string, Debounced<[vscode.TextDocument]>>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly render: Renderer;

  constructor(private readonly extensionUri: vscode.Uri, render: Renderer = createRenderer()) {
    this.render = render;
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocumentChanged(e.document)),
      vscode.workspace.onDidRenameFiles((e) => this.onFilesRenamed(e)),
      vscode.window.onDidChangeActiveColorTheme((theme) => this.onThemeChanged(theme.kind)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
          this.pushSettingsToAll();
        }
      })
    );
  }

  /** Number of open previews (for tests and internal cap checks). */
  get count(): number {
    return this.panels.size;
  }

  /**
   * The effective preview cap, read fresh from settings each time so changes
   * take effect on the next open (existing previews are never force-closed) and
   * clamped to a sane range.
   */
  get maxPreviews(): number {
    const configured = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<number>('maxPreviews', DEFAULT_MAX_PREVIEWS);
    if (!Number.isFinite(configured)) {
      return DEFAULT_MAX_PREVIEWS;
    }
    return Math.min(Math.max(Math.trunc(configured), MIN_MAX_PREVIEWS), MAX_MAX_PREVIEWS);
  }

  get maxContentWidth(): number {
    const configured = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<number>('maxContentWidth', DEFAULT_MAX_CONTENT_WIDTH);
    if (!Number.isFinite(configured) || configured < 0) {
      return DEFAULT_MAX_CONTENT_WIDTH;
    }
    return Math.trunc(configured);
  }

  openPreview(document: vscode.TextDocument): void {
    if (document.languageId !== 'markdown') {
      void vscode.window.showWarningMessage(
        'Markdown Dual Preview: the active file is not a Markdown document.'
      );
      return;
    }

    const key = docKey(document.uri);
    const existing = this.panels.get(key);
    if (existing && !existing.isDisposed) {
      existing.reveal();
      return;
    }
    if (existing) {
      // Defensive: a disposed panel should already be gone, but never reveal one.
      this.releasePanel(existing);
    }

    const cap = this.maxPreviews;
    if (this.panels.size >= cap) {
      void vscode.window.showWarningMessage(
        `Markdown Dual Preview: a maximum of ${cap} preview${cap === 1 ? '' : 's'} can be open at once. Close one to open another.`
      );
      return;
    }

    this.createPanel(document, key);
  }

  dispose(): void {
    for (const debounced of this.debouncers.values()) {
      debounced.cancel();
    }
    this.debouncers.clear();
    for (const panel of [...this.panels.values()]) {
      panel.dispose();
    }
    this.panels.clear();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private createPanel(document: vscode.TextDocument, key: string): void {
    const webviewPanel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      `Preview: ${basename(document.uri)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: localResourceRoots(this.extensionUri, document.uri)
      }
    );

    const panel = new PreviewPanel(webviewPanel, document, this.render, this.extensionUri);
    panel.onReady(() => panel.postSettings(this.maxContentWidth));
    const scrollSync = new ScrollSync(panel);
    // Release by panel identity, not by key: a rename can re-key the panel, so
    // the key captured here may be stale by the time the panel is disposed.
    panel.onDidDispose(() => {
      scrollSync.dispose();
      this.releasePanel(panel);
    });
    this.panels.set(key, panel);
  }

  private releasePanel(panel: PreviewPanel): void {
    for (const [key, tracked] of this.panels) {
      if (tracked === panel) {
        this.panels.delete(key);
        this.debouncers.get(key)?.cancel();
        this.debouncers.delete(key);
        return;
      }
    }
  }

  /**
   * Keep preview keys in step with file renames. Without this, a renamed
   * document would stop receiving live updates (its edits arrive under the new
   * URI) and reopening it would create a duplicate panel, stranding a slot.
   */
  private onFilesRenamed(event: vscode.FileRenameEvent): void {
    for (const { oldUri, newUri } of event.files) {
      this.rekey(oldUri, newUri);
    }
  }

  private rekey(oldUri: vscode.Uri, newUri: vscode.Uri): void {
    const oldKey = docKey(oldUri);
    const newKey = docKey(newUri);

    // Exact file rename.
    if (this.panels.has(oldKey)) {
      this.moveEntry(oldKey, newKey);
      const renamed = vscode.workspace.textDocuments.find((d) => docKey(d.uri) === newKey);
      if (renamed) {
        this.panels.get(newKey)?.retarget(renamed);
      }
      return;
    }

    // Folder rename: re-key every tracked descendant so live-update matching
    // and reopen-reveal keep working under the new path prefix.
    const prefix = `${oldKey}/`;
    for (const key of [...this.panels.keys()]) {
      if (key.startsWith(prefix)) {
        this.moveEntry(key, `${newKey}${key.slice(oldKey.length)}`);
      }
    }
  }

  private moveEntry(from: string, to: string): void {
    const panel = this.panels.get(from);
    if (!panel || from === to) {
      return;
    }
    this.panels.delete(from);
    this.panels.set(to, panel);
    const debounced = this.debouncers.get(from);
    if (debounced) {
      this.debouncers.delete(from);
      this.debouncers.set(to, debounced);
    }
  }

  private onDocumentChanged(document: vscode.TextDocument): void {
    const key = docKey(document.uri);
    if (!this.panels.has(key)) {
      return;
    }
    let debounced = this.debouncers.get(key);
    if (!debounced) {
      // Resolve the target key from the document at fire time so the debouncer
      // keeps working if the document is re-keyed by a rename before it fires.
      debounced = debounce((doc: vscode.TextDocument) => {
        this.panels.get(docKey(doc.uri))?.update(doc);
      }, LIVE_UPDATE_DELAY_MS);
      this.debouncers.set(key, debounced);
    }
    debounced(document);
  }

  private onThemeChanged(kind: vscode.ColorThemeKind): void {
    for (const panel of this.panels.values()) {
      panel.postThemeChanged(kind);
    }
  }

  private pushSettingsToAll(): void {
    const width = this.maxContentWidth;
    for (const panel of this.panels.values()) {
      panel.postSettings(width);
    }
  }
}

function basename(uri: vscode.Uri): string {
  const parts = uri.path.split('/');
  return parts[parts.length - 1] || uri.path;
}
