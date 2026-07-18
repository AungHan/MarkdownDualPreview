import * as vscode from 'vscode';
import { PreviewManager } from './preview/previewManager';

export function activate(context: vscode.ExtensionContext): void {
  const manager = new PreviewManager(context.extensionUri);
  context.subscriptions.push(manager);

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownDualPreview.open', async (resource?: vscode.Uri) => {
      // Invoked from the Explorer context menu with the clicked file's URI;
      // from the editor title bar / Command Palette with no argument.
      if (resource instanceof vscode.Uri) {
        try {
          const document = await vscode.workspace.openTextDocument(resource);
          manager.openPreview(document);
        } catch {
          void vscode.window.showWarningMessage(
            `Markdown Dual Preview: could not open ${resource.fsPath}.`
          );
        }
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage('Markdown Dual Preview: open a Markdown file first.');
        return;
      }
      manager.openPreview(editor.document);
    })
  );
}

export function deactivate(): void {
  // Disposables are owned by context.subscriptions and cleaned up automatically.
}
