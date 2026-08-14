import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { localResourceRoots } from '../../src/preview/localRoots';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVscode = vscode as any;

function toStrings(uris: vscode.Uri[]): string[] {
  return uris.map((u) => u.toString());
}

describe('localResourceRoots', () => {
  const extensionUri = vscode.Uri.file('/ext');

  beforeEach(() => {
    mockVscode.__test.reset();
  });

  afterEach(() => {
    mockVscode.__test.reset();
  });

  it('always includes dist and media under the extension root', () => {
    const documentUri = vscode.Uri.file('/untracked/doc.md');
    const roots = toStrings(localResourceRoots(extensionUri, documentUri));
    expect(roots).toContain(vscode.Uri.joinPath(extensionUri, 'dist').toString());
    expect(roots).toContain(vscode.Uri.joinPath(extensionUri, 'media').toString());
  });

  it('includes the directory containing the document', () => {
    const documentUri = vscode.Uri.file('/home/user/project/docs/readme.md');
    const roots = toStrings(localResourceRoots(extensionUri, documentUri));
    expect(roots).toContain(vscode.Uri.file('/home/user/project/docs').toString());
  });

  it('includes every open workspace folder', () => {
    mockVscode.workspace.workspaceFolders = [
      { uri: vscode.Uri.file('/home/user/project-a') },
      { uri: vscode.Uri.file('/home/user/project-b') }
    ];
    const documentUri = vscode.Uri.file('/home/user/project-a/readme.md');
    const roots = toStrings(localResourceRoots(extensionUri, documentUri));
    expect(roots).toContain(vscode.Uri.file('/home/user/project-a').toString());
    expect(roots).toContain(vscode.Uri.file('/home/user/project-b').toString());
  });

  it('collapses the duplicate when the document sits at the root of a workspace folder', () => {
    mockVscode.workspace.workspaceFolders = [{ uri: vscode.Uri.file('/home/user/project') }];
    const documentUri = vscode.Uri.file('/home/user/project/readme.md');
    const roots = toStrings(localResourceRoots(extensionUri, documentUri));
    const matches = roots.filter((r) => r === vscode.Uri.file('/home/user/project').toString());
    expect(matches).toHaveLength(1);
  });

  it('contributes no directory root for an untitled document, and does not throw', () => {
    const documentUri = vscode.Uri.parse('untitled:Untitled-1');
    expect(() => localResourceRoots(extensionUri, documentUri)).not.toThrow();
    const roots = localResourceRoots(extensionUri, documentUri);
    expect(roots.every((r) => r.scheme !== 'untitled')).toBe(true);
  });

  it('never grants the filesystem root itself as a resource root', () => {
    const documentUri = vscode.Uri.file('/readme.md');
    const roots = localResourceRoots(extensionUri, documentUri);
    expect(roots.some((r) => r.path === '/' || r.path === '')).toBe(false);
  });

  it('returns only dist and media when no workspace folder is open', () => {
    const documentUri = vscode.Uri.file('/tmp/doc.md');
    const roots = toStrings(localResourceRoots(extensionUri, documentUri));
    expect(roots).toContain(vscode.Uri.joinPath(extensionUri, 'dist').toString());
    expect(roots).toContain(vscode.Uri.joinPath(extensionUri, 'media').toString());
    expect(roots).toContain(vscode.Uri.file('/tmp').toString());
  });
});
