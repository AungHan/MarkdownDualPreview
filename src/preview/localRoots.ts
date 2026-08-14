import * as vscode from 'vscode';

/**
 * The directories a preview webview is permitted to load files from:
 * the extension's own `dist` and `media`, every open workspace folder, and
 * the directory containing the previewed document.
 */
export function localResourceRoots(
  extensionUri: vscode.Uri,
  documentUri: vscode.Uri
): vscode.Uri[] {
  const roots = [
    vscode.Uri.joinPath(extensionUri, 'dist'),
    vscode.Uri.joinPath(extensionUri, 'media'),
    ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri)
  ];

  const documentDir = directoryOf(documentUri);
  if (documentDir) {
    roots.push(documentDir);
  }

  return dedupe(roots);
}

/**
 * The directory containing `documentUri`, or `undefined` for non-`file` schemes
 * (e.g. `untitled:`) where there is no filesystem directory to grant access to.
 */
function directoryOf(documentUri: vscode.Uri): vscode.Uri | undefined {
  if (documentUri.scheme !== 'file') {
    return undefined;
  }
  const segments = documentUri.path.split('/');
  segments.pop();
  const dirPath = segments.join('/');
  if (dirPath === '' || dirPath === '/') {
    // No parent below the filesystem root; never grant that as a resource root.
    return undefined;
  }
  return vscode.Uri.file(dirPath);
}

function dedupe(uris: vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  const result: vscode.Uri[] = [];
  for (const uri of uris) {
    const key = `${uri.scheme}:${uri.path.replace(/\/$/, '')}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(uri);
    }
  }
  return result;
}
