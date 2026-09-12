import * as vscode from 'vscode';
import { exportHtml } from './export/exportHtml';
import { createRenderer } from './markdown/renderer';
import { PreviewManager } from './preview/previewManager';

// Invoked from the Explorer/editor context menu or editor title bar with the
// clicked/active editor's URI; from the Command Palette or the keybinding
// with no argument.
async function resolveTargetDocument(
  resource: vscode.Uri | undefined
): Promise<vscode.TextDocument | undefined> {
  if (resource instanceof vscode.Uri) {
    try {
      return await vscode.workspace.openTextDocument(resource);
    } catch {
      void vscode.window.showWarningMessage(
        `Markdown Dual Preview: could not open ${resource.fsPath}.`
      );
      return undefined;
    }
  }

  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    void vscode.window.showWarningMessage('Markdown Dual Preview: open a Markdown file first.');
  }
  return document;
}

export function activate(context: vscode.ExtensionContext): void {
  const manager = new PreviewManager(context.extensionUri);
  context.subscriptions.push(manager);
  const render = createRenderer();

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownDualPreview.open', async (resource?: vscode.Uri) => {
      const document = await resolveTargetDocument(resource);
      if (!document) return;
      manager.openPreview(document);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownDualPreview.exportHtml', async (resource?: vscode.Uri) => {
      const document = await resolveTargetDocument(resource);
      if (!document) return;
      await exportHtml({ document, extensionUri: context.extensionUri, render });
    })
  );
}

export function deactivate(): void {
  // Disposables are owned by context.subscriptions and cleaned up automatically.
}
