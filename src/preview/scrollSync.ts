import * as vscode from 'vscode';
import { ScrollSyncGate } from '../shared/scrollSyncGate';
import { docKey } from '../util/docKey';
import type { PreviewPanel } from './previewPanel';

/**
 * Bidirectional scroll sync between a source editor and its preview panel.
 *
 * - Editor -> preview: `onDidChangeTextEditorVisibleRanges` reports the top
 *   visible line, which is forwarded to the webview as `revealLine`.
 * - Preview -> editor: the webview reports its top line, which drives
 *   `revealRange` on the matching visible editor.
 *
 * The editor-side {@link ScrollSyncGate} breaks the feedback loop: calling
 * `revealRange` itself fires a visible-ranges change, so we suppress the gate
 * immediately before that call. The webview owns the symmetric guard.
 */
export class ScrollSync implements vscode.Disposable {
  private readonly editorGate = new ScrollSyncGate(150);
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly panel: PreviewPanel) {
    panel.onScroll((line) => this.onPreviewScroll(line));
    this.disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => this.onEditorScroll(e))
    );
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private matchesPanel(document: vscode.TextDocument): boolean {
    return docKey(document.uri) === docKey(this.panel.uri);
  }

  private onEditorScroll(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (!this.matchesPanel(event.textEditor.document) || event.visibleRanges.length === 0) {
      return;
    }
    const line = event.visibleRanges[0].start.line;
    if (this.editorGate.shouldSend(line, Date.now())) {
      this.panel.revealLine(line);
    }
  }

  private onPreviewScroll(line: number): void {
    const editor = vscode.window.visibleTextEditors.find((ed) => this.matchesPanel(ed.document));
    if (!editor) {
      return;
    }
    // Suppress the visible-ranges echo that revealRange is about to trigger.
    this.editorGate.suppress(Date.now());
    editor.revealRange(
      new vscode.Range(line, 0, line, 0),
      vscode.TextEditorRevealType.AtTop
    );
  }
}
