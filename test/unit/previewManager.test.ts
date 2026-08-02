import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewManager } from '../../src/preview/previewManager';
import { __test, env, Uri, window, workspace, type FakeWebviewPanel } from '../mocks/vscode';

function updatesPostedSince(panel: FakeWebviewPanel, since: number): unknown[] {
  return panel.webview.posted
    .slice(since)
    .filter((m) => (m as { type?: unknown }).type === 'updateContent');
}

const EXT_URI = Uri.file('C:/ext');

interface FakeDoc {
  uri: ReturnType<typeof Uri.file>;
  languageId: string;
  getText(): string;
}

function doc(path: string, languageId = 'markdown', text = '# Hello\n'): FakeDoc {
  return { uri: Uri.file(path), languageId, getText: () => text };
}

// The manager types its API against the real vscode.TextDocument; the fake
// carries exactly the fields it touches.
function open(manager: PreviewManager, d: FakeDoc): void {
  manager.openPreview(d as unknown as Parameters<PreviewManager['openPreview']>[0]);
}

beforeEach(() => __test.reset());

describe('PreviewManager', () => {
  it('opens a preview for a markdown document', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    expect(manager.count).toBe(1);
    expect(__test.createdPanels).toHaveLength(1);
  });

  it('rejects non-markdown documents with a warning', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.txt', 'plaintext'));
    expect(manager.count).toBe(0);
    expect(window.warningMessages).toHaveLength(1);
  });

  it('reveals the existing panel instead of opening a duplicate (case-insensitive)', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/Docs/A.md'));
    open(manager, doc('c:/docs/a.md'));
    expect(manager.count).toBe(1);
    expect(__test.createdPanels).toHaveLength(1);
    expect(__test.createdPanels[0].revealCalls).toBe(1);
  });

  it('opens up to the default cap (2) and blocks the next with a warning', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    open(manager, doc('C:/b.md'));
    expect(manager.count).toBe(2);
    open(manager, doc('C:/c.md'));
    expect(manager.count).toBe(2);
    expect(__test.createdPanels).toHaveLength(2);
    expect(window.warningMessages).toHaveLength(1);
  });

  it('honors a raised cap of 3 from settings', () => {
    workspace.configValues.set('markdownDualPreview.maxPreviews', 3);
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    open(manager, doc('C:/b.md'));
    open(manager, doc('C:/c.md'));
    expect(manager.count).toBe(3);
    open(manager, doc('C:/d.md'));
    expect(manager.count).toBe(3);
    expect(window.warningMessages).toHaveLength(1);
  });

  it('clamps an out-of-range cap to at most 3', () => {
    workspace.configValues.set('markdownDualPreview.maxPreviews', 99);
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    open(manager, doc('C:/b.md'));
    open(manager, doc('C:/c.md'));
    open(manager, doc('C:/d.md'));
    expect(manager.count).toBe(3);
  });

  it('clamps a zero cap up to 1', () => {
    workspace.configValues.set('markdownDualPreview.maxPreviews', 0);
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    expect(manager.count).toBe(1);
    open(manager, doc('C:/b.md'));
    expect(manager.count).toBe(1);
  });

  it('frees a slot when a panel is disposed, allowing a new preview', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    open(manager, doc('C:/b.md'));
    const first: FakeWebviewPanel = __test.createdPanels[0];
    first.dispose();
    expect(manager.count).toBe(1);
    open(manager, doc('C:/c.md'));
    expect(manager.count).toBe(2);
    expect(__test.createdPanels).toHaveLength(3);
  });

  it('reopening a closed preview creates a fresh panel and never reveals the disposed one', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    const first = __test.createdPanels[0];

    // Simulate the user closing the preview tab. Cleanup must run even though
    // disposal tears down listeners mid-delivery.
    first.dispose();
    expect(manager.count).toBe(0);

    open(manager, doc('C:/a.md'));
    expect(manager.count).toBe(1);
    expect(__test.createdPanels).toHaveLength(2);
    expect(first.revealCalls).toBe(0);
  });

  it('sends content when the webview reports ready', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md', 'markdown', '# Ready\n'));
    const panel = __test.createdPanels[0];
    panel.webview.__fireMessage({ type: 'ready' });
    const update = panel.webview.posted.find(
      (m): m is { type: string; html: string } =>
        typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'updateContent'
    );
    expect(update?.html).toContain('id="ready"');
  });

  it('live-updates a tracked document after the debounce window', () => {
    vi.useFakeTimers();
    try {
      const manager = new PreviewManager(EXT_URI);
      const d = doc('C:/a.md', 'markdown', '# Changed\n');
      open(manager, d);
      const panel = __test.createdPanels[0];
      const before = panel.webview.posted.length;
      workspace.onDidChangeTextDocumentEmitter.fire({ document: d });
      vi.advanceTimersByTime(300);
      expect(updatesPostedSince(panel, before).length).toBeGreaterThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-keys a preview when its file is renamed (no duplicate, no stranded slot)', () => {
    const manager = new PreviewManager(EXT_URI);
    const oldDoc = doc('C:/a.md');
    open(manager, oldDoc);
    const panel = __test.createdPanels[0];

    const newDoc = doc('C:/renamed.md');
    workspace.textDocuments.push(newDoc);
    workspace.onDidRenameFilesEmitter.fire({ files: [{ oldUri: oldDoc.uri, newUri: newDoc.uri }] });

    // Reopening the renamed document reveals the existing panel rather than
    // creating a second one that would consume the other slot.
    open(manager, newDoc);
    expect(manager.count).toBe(1);
    expect(__test.createdPanels).toHaveLength(1);
    expect(panel.revealCalls).toBe(1);
  });

  it('keeps live-updating a renamed document under its new uri', () => {
    vi.useFakeTimers();
    try {
      const manager = new PreviewManager(EXT_URI);
      const oldDoc = doc('C:/a.md');
      open(manager, oldDoc);
      const panel = __test.createdPanels[0];

      const newDoc = doc('C:/renamed.md', 'markdown', '# New name\n');
      workspace.textDocuments.push(newDoc);
      workspace.onDidRenameFilesEmitter.fire({
        files: [{ oldUri: oldDoc.uri, newUri: newDoc.uri }]
      });

      const before = panel.webview.posted.length;
      workspace.onDidChangeTextDocumentEmitter.fire({ document: newDoc });
      vi.advanceTimersByTime(300);
      expect(updatesPostedSince(panel, before).length).toBeGreaterThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads maxContentWidth from settings, defaulting to 0', () => {
    const manager = new PreviewManager(EXT_URI);
    expect(manager.maxContentWidth).toBe(0);
  });

  it('reads a positive maxContentWidth from settings', () => {
    workspace.configValues.set('markdownDualPreview.maxContentWidth', 900);
    const manager = new PreviewManager(EXT_URI);
    expect(manager.maxContentWidth).toBe(900);
  });

  it('clamps negative maxContentWidth to 0', () => {
    workspace.configValues.set('markdownDualPreview.maxContentWidth', -100);
    const manager = new PreviewManager(EXT_URI);
    expect(manager.maxContentWidth).toBe(0);
  });

  it('truncates fractional maxContentWidth', () => {
    workspace.configValues.set('markdownDualPreview.maxContentWidth', 850.7);
    const manager = new PreviewManager(EXT_URI);
    expect(manager.maxContentWidth).toBe(850);
  });

  it('posts settingsChanged when webview reports ready', () => {
    workspace.configValues.set('markdownDualPreview.maxContentWidth', 700);
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    const panel = __test.createdPanels[0];
    panel.webview.__fireMessage({ type: 'ready' });
    const settings = panel.webview.posted.find(
      (m): m is { type: string; maxContentWidth: number } =>
        typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'settingsChanged'
    );
    expect(settings?.maxContentWidth).toBe(700);
  });

  it('pushes settingsChanged to all panels on config change', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    open(manager, doc('C:/b.md'));
    const panelA = __test.createdPanels[0];
    const panelB = __test.createdPanels[1];
    const beforeA = panelA.webview.posted.length;
    const beforeB = panelB.webview.posted.length;

    workspace.configValues.set('markdownDualPreview.maxContentWidth', 600);
    workspace.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: (section: string) => section === 'markdownDualPreview'
    });

    const settingsA = panelA.webview.posted
      .slice(beforeA)
      .find((m) => (m as { type?: unknown }).type === 'settingsChanged');
    const settingsB = panelB.webview.posted
      .slice(beforeB)
      .find((m) => (m as { type?: unknown }).type === 'settingsChanged');
    expect((settingsA as { maxContentWidth: number }).maxContentWidth).toBe(600);
    expect((settingsB as { maxContentWidth: number }).maxContentWidth).toBe(600);
  });

  it('copies text to clipboard when webview posts copyText', () => {
    const manager = new PreviewManager(EXT_URI);
    open(manager, doc('C:/a.md'));
    const panel = __test.createdPanels[0];
    panel.webview.__fireMessage({ type: 'ready' });
    panel.webview.__fireMessage({ type: 'copyText', text: 'console.log("hi")' });
    expect(env.clipboard.written).toContain('console.log("hi")');
  });
});
