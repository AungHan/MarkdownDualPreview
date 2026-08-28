import { beforeEach, describe, expect, it } from 'vitest';
import { PreviewManager } from '../../src/preview/previewManager';
import { __test, Uri, workspace, type FakeWebviewPanel } from '../mocks/vscode';

interface FakeCheckboxDoc {
  uri: ReturnType<typeof Uri.file>;
  languageId: string;
  lineCount: number;
  getText(): string;
  lineAt(line: number): { text: string };
}

function checkboxDoc(path: string, text: string): FakeCheckboxDoc {
  const lines = text.split('\n');
  return {
    uri: Uri.file(path),
    languageId: 'markdown',
    lineCount: lines.length,
    getText: () => text,
    lineAt: (line: number) => ({ text: lines[line] })
  };
}

function openCheckboxDoc(manager: PreviewManager, d: FakeCheckboxDoc): void {
  manager.openPreview(d as unknown as Parameters<PreviewManager['openPreview']>[0]);
}

const EXT_URI = Uri.file('C:/ext');

const RESOURCE_BASE = 'https:///file+.vscode-resource.vscode-cdn.net';

interface FakeDoc {
  uri: ReturnType<typeof Uri.file>;
  languageId: string;
  getText(): string;
}

function doc(path: string, text: string, languageId = 'markdown'): FakeDoc {
  return { uri: Uri.file(path), languageId, getText: () => text };
}

function open(manager: PreviewManager, d: FakeDoc): void {
  manager.openPreview(d as unknown as Parameters<PreviewManager['openPreview']>[0]);
}

function readyAndGetUpdate(panel: FakeWebviewPanel): { html: string } {
  panel.webview.__fireMessage({ type: 'ready' });
  const update = panel.webview.posted.find(
    (m): m is { type: string; html: string } =>
      typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'updateContent'
  );
  if (!update) {
    throw new Error('no updateContent message posted');
  }
  return update;
}

beforeEach(() => __test.reset());

describe('previewPanel image rewriting', () => {
  it('rewrites a relative Markdown image src to a webview URI', () => {
    workspace.workspaceFolders = [{ uri: Uri.file('C:/project') }];
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/project/docs/readme.md', '![screenshot](./img/shot.png)\n'));
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain(`src="${RESOURCE_BASE}/C:/project/docs/img/shot.png"`);
  });

  it('rewrites a parent-relative image path correctly', () => {
    workspace.workspaceFolders = [{ uri: Uri.file('C:/project') }];
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/project/docs/sub/page.md', '![](../assets/logo.png)\n'));
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain(`src="${RESOURCE_BASE}/C:/project/docs/assets/logo.png"`);
  });

  it('leaves remote https image src untouched', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/project/readme.md', '![badge](https://img.shields.io/badge.svg)\n'));
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain('src="https://img.shields.io/badge.svg"');
  });

  it('leaves data URI image src untouched', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/project/readme.md', '![pixel](data:image/gif;base64,R0lGODlhAQABAA==)\n'));
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain('src="data:image/gif;base64,R0lGODlhAQABAA=="');
  });

  it('rewrites raw HTML img src the same as Markdown syntax', () => {
    workspace.workspaceFolders = [{ uri: Uri.file('C:/project') }];
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/project/readme.md', '<img src="./logo.png" alt="logo">\n'));
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain(`src="${RESOURCE_BASE}/C:/project/logo.png"`);
  });

  it('resolves workspace-root-relative paths via workspaceRoot', () => {
    workspace.workspaceFolders = [{ uri: Uri.file('C:/myrepo') }];
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/myrepo/docs/guide.md', '![](/assets/diagram.png)\n'));
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain(`src="${RESOURCE_BASE}/C:/myrepo/assets/diagram.png"`);
  });

  it('leaves all image src untouched for untitled documents', () => {
    const manager = new PreviewManager(EXT_URI);
    const d: FakeDoc = {
      uri: Uri.parse('untitled:Untitled-1'),
      languageId: 'markdown',
      getText: () => '![](./local.png)\n'
    };
    open(manager, d);
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain('src="./local.png"');
  });

  it('resolves relative path when document is outside any workspace folder', () => {
    workspace.workspaceFolders = [{ uri: Uri.file('C:/other') }];
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/standalone/notes.md', '![](pic.png)\n'));
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain(`src="${RESOURCE_BASE}/C:/standalone/pic.png"`);
  });

  it('treats workspace-root-relative path as external when no workspace matches', () => {
    workspace.workspaceFolders = [{ uri: Uri.file('C:/other') }];
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/standalone/notes.md', '![](/assets/x.png)\n'));
    const update = readyAndGetUpdate(__test.createdPanels[0]);
    expect(update.html).toContain('src="/assets/x.png"');
  });
});

describe('previewPanel checkbox toggling', () => {
  it('toggles [ ] to [x] when checkboxToggled reports checked: true', async () => {
    const manager = new PreviewManager(EXT_URI);
    openCheckboxDoc(manager, checkboxDoc('C:/todo.md', '- [ ] first item\n'));
    const panel = __test.createdPanels[0];
    panel.webview.__fireMessage({ type: 'ready' });

    panel.webview.__fireMessage({ type: 'checkboxToggled', line: 0, checked: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(workspace.appliedEdits).toHaveLength(1);
    expect(workspace.appliedEdits[0].operations).toEqual([
      { uri: Uri.file('C:/todo.md'), range: { startLine: 0, startChar: 2, endLine: 0, endChar: 5 }, newText: '[x]' }
    ]);
  });

  it('toggles [x] to [ ] when checkboxToggled reports checked: false', async () => {
    const manager = new PreviewManager(EXT_URI);
    openCheckboxDoc(manager, checkboxDoc('C:/todo.md', '- [x] done item\n'));
    const panel = __test.createdPanels[0];
    panel.webview.__fireMessage({ type: 'ready' });

    panel.webview.__fireMessage({ type: 'checkboxToggled', line: 0, checked: false });
    await Promise.resolve();
    await Promise.resolve();

    expect(workspace.appliedEdits).toHaveLength(1);
    expect(workspace.appliedEdits[0].operations[0].newText).toBe('[ ]');
  });

  it('finds a checkbox a few lines past the reported line (multi-line list item)', async () => {
    const manager = new PreviewManager(EXT_URI);
    openCheckboxDoc(
      manager,
      checkboxDoc('C:/todo.md', '- item wraps\n  onto a second line\n  [ ] not actually a checkbox marker line 3\n')
    );
    const panel = __test.createdPanels[0];
    panel.webview.__fireMessage({ type: 'ready' });

    panel.webview.__fireMessage({ type: 'checkboxToggled', line: 0, checked: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(workspace.appliedEdits).toHaveLength(1);
    expect(workspace.appliedEdits[0].operations[0]).toEqual({
      uri: Uri.file('C:/todo.md'),
      range: { startLine: 2, startChar: 2, endLine: 2, endChar: 5 },
      newText: '[x]'
    });
  });

  it('applies no edit when the reported line has no checkbox pattern', async () => {
    const manager = new PreviewManager(EXT_URI);
    openCheckboxDoc(manager, checkboxDoc('C:/todo.md', 'just plain text\nmore text\n'));
    const panel = __test.createdPanels[0];
    panel.webview.__fireMessage({ type: 'ready' });

    panel.webview.__fireMessage({ type: 'checkboxToggled', line: 0, checked: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(workspace.appliedEdits).toHaveLength(0);
  });
});
