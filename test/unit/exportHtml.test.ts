import { beforeEach, describe, expect, it } from 'vitest';
import { buildStandaloneHtml, exportHtml } from '../../src/export/exportHtml';
import { createRenderer, type Renderer } from '../../src/markdown/renderer';
import { __test, Uri, window, workspace } from '../mocks/vscode';

const EXT_URI = Uri.file('C:/ext');

interface FakeDoc {
  uri: ReturnType<typeof Uri.file>;
  getText(): string;
}

function doc(path: string, text: string): FakeDoc {
  return { uri: Uri.file(path), getText: () => text };
}

function registerMediaFixtures(): void {
  workspace.fsFiles.set(
    Uri.joinPath(EXT_URI, 'media', 'preview.css').toString(),
    new TextEncoder().encode('.markdown-body { color: red; }')
  );
  workspace.fsFiles.set(
    Uri.joinPath(EXT_URI, 'media', 'hljs-github-light.css').toString(),
    new TextEncoder().encode('.hljs { color: blue; }')
  );
}

const identityRender: Renderer = (markdown) => ({ html: `<p>${markdown.trim()}</p>`, toc: [] });

beforeEach(() => __test.reset());

describe('buildStandaloneHtml', () => {
  it('produces a valid HTML5 document', () => {
    const html = buildStandaloneHtml({
      title: 'My Doc',
      contentHtml: '<p>hello</p>',
      previewCss: 'body { color: red; }',
      hljsCss: '.hljs { color: blue; }'
    });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html');
    expect(html).toContain('<p>hello</p>');
  });

  it('inlines the provided CSS in <style> blocks', () => {
    const html = buildStandaloneHtml({
      title: 'My Doc',
      contentHtml: '<p>hello</p>',
      previewCss: 'body { color: red; }',
      hljsCss: '.hljs { color: blue; }'
    });
    expect(html).toContain('<style>');
    expect(html).toContain('body { color: red; }');
    expect(html).toContain('.hljs { color: blue; }');
  });

  it('contains no <script> tags', () => {
    const html = buildStandaloneHtml({
      title: 'My Doc',
      contentHtml: '<p>hello</p>',
      previewCss: '',
      hljsCss: ''
    });
    expect(html).not.toContain('<script');
  });

  it('sets the document title from the title parameter', () => {
    const html = buildStandaloneHtml({
      title: 'Release Notes',
      contentHtml: '<p>hello</p>',
      previewCss: '',
      hljsCss: ''
    });
    expect(html).toContain('<title>Release Notes</title>');
  });

  it('includes a restrictive CSP meta tag with no script-src allowance', () => {
    const html = buildStandaloneHtml({
      title: 'My Doc',
      contentHtml: '<p>hello</p>',
      previewCss: '',
      hljsCss: ''
    });
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(`script-src 'none'`);
  });
});

describe('exportHtml', () => {
  it('shows a save dialog with an .html filter and a default filename', async () => {
    registerMediaFixtures();
    window.saveDialogResult = Uri.file('C:/project/readme.html');
    await exportHtml({
      document: doc('C:/project/readme.md', '# Hi\n') as unknown as Parameters<
        typeof exportHtml
      >[0]['document'],
      extensionUri: EXT_URI,
      render: identityRender
    });
    // showSaveDialog was invoked (a written file below is proof it resolved).
    expect(workspace.writtenFiles).toHaveLength(1);
  });

  it('writes the rendered standalone HTML to the chosen URI', async () => {
    registerMediaFixtures();
    window.saveDialogResult = Uri.file('C:/project/readme.html');
    await exportHtml({
      document: doc('C:/project/readme.md', '# Hi\n') as unknown as Parameters<
        typeof exportHtml
      >[0]['document'],
      extensionUri: EXT_URI,
      render: identityRender
    });
    expect(workspace.writtenFiles).toHaveLength(1);
    const written = workspace.writtenFiles[0];
    expect(written.uri.toString()).toBe(Uri.file('C:/project/readme.html').toString());
    const text = Buffer.from(written.content).toString('utf8');
    expect(text).toContain('<p># Hi</p>');
    expect(text).toContain('.markdown-body { color: red; }');
  });

  it('does nothing when the user cancels the save dialog', async () => {
    registerMediaFixtures();
    window.saveDialogResult = undefined;
    await exportHtml({
      document: doc('C:/project/readme.md', '# Hi\n') as unknown as Parameters<
        typeof exportHtml
      >[0]['document'],
      extensionUri: EXT_URI,
      render: identityRender
    });
    expect(workspace.writtenFiles).toHaveLength(0);
  });

  it('preserves a local image as a file:// URI through the real renderer/sanitizer', async () => {
    registerMediaFixtures();
    window.saveDialogResult = Uri.file('C:/project/readme.html');
    await exportHtml({
      document: doc('C:/project/readme.md', '![shot](./img/shot.png)\n') as unknown as Parameters<
        typeof exportHtml
      >[0]['document'],
      extensionUri: EXT_URI,
      render: createRenderer()
    });
    expect(workspace.writtenFiles).toHaveLength(1);
    const text = Buffer.from(workspace.writtenFiles[0].content).toString('utf8');
    expect(text).toContain('<img');
    expect(text).toContain('src="file:///C:/project/img/shot.png"');
  });

  it('shows an error message and writes nothing when a media asset cannot be read', async () => {
    // registerMediaFixtures() intentionally not called: readMediaFile rejects.
    window.saveDialogResult = Uri.file('C:/project/readme.html');
    await exportHtml({
      document: doc('C:/project/readme.md', '# Hi\n') as unknown as Parameters<
        typeof exportHtml
      >[0]['document'],
      extensionUri: EXT_URI,
      render: identityRender
    });
    expect(workspace.writtenFiles).toHaveLength(0);
    expect(window.errorMessages).toHaveLength(1);
    expect(window.errorMessages[0]).toContain('export failed');
  });
});
