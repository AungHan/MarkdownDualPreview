import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildImageDataUriMap,
  buildLayoutCss,
  buildStandaloneHtml,
  exportHtml,
  rescopeDarkCssForExport
} from '../../src/export/exportHtml';
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
  workspace.fsFiles.set(
    Uri.joinPath(EXT_URI, 'media', 'hljs-github-dark.css').toString(),
    new TextEncoder().encode('body.vscode-dark .hljs, body.vscode-high-contrast .hljs { color: yellow; }')
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
      hljsCss: '.hljs { color: blue; }',
      hljsDarkCss: ''
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
      hljsCss: '.hljs { color: blue; }',
      hljsDarkCss: ''
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
      hljsCss: '',
      hljsDarkCss: ''
    });
    expect(html).not.toContain('<script');
  });

  it('sets the document title from the title parameter', () => {
    const html = buildStandaloneHtml({
      title: 'Release Notes',
      contentHtml: '<p>hello</p>',
      previewCss: '',
      hljsCss: '',
      hljsDarkCss: ''
    });
    expect(html).toContain('<title>Release Notes</title>');
  });

  it('includes a restrictive CSP meta tag with no script-src allowance', () => {
    const html = buildStandaloneHtml({
      title: 'My Doc',
      contentHtml: '<p>hello</p>',
      previewCss: '',
      hljsCss: '',
      hljsDarkCss: ''
    });
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(`script-src 'none'`);
  });

  it('gates the re-scoped dark hljs theme and dark variable defaults behind prefers-color-scheme', () => {
    const html = buildStandaloneHtml({
      title: 'My Doc',
      contentHtml: '<p>hello</p>',
      previewCss: '',
      hljsCss: '.hljs { color: black; }',
      hljsDarkCss: 'body.vscode-dark .hljs, body.vscode-high-contrast .hljs { color: yellow; }'
    });
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain('body.vscode-light .hljs, body.vscode-light .hljs { color: yellow; }');
    expect(html).toContain('--vscode-editor-background: #1e1e1e');
    // Light hljs rule stays unconditional, ahead of the dark-scoped block.
    expect(html.indexOf('.hljs { color: black; }')).toBeLessThan(
      html.indexOf('body.vscode-light .hljs, body.vscode-light .hljs { color: yellow; }')
    );
  });

  it('gives .markdown-body side padding and a readable max-width (preview.css scopes padding to #content, absent in export)', () => {
    const html = buildStandaloneHtml({
      title: 'My Doc',
      contentHtml: '<p>hello</p>',
      previewCss: '',
      hljsCss: '',
      hljsDarkCss: ''
    });
    expect(html).toContain('max-width: 900px');
    expect(html).toContain('margin: 0 auto');
    expect(html).toMatch(/\.markdown-body\s*\{[^}]*padding:/);
  });

  it('includes print-tuned CSS to avoid splitting code/tables across a page break', () => {
    const html = buildStandaloneHtml({
      title: 'My Doc',
      contentHtml: '<p>hello</p>',
      previewCss: '',
      hljsCss: '',
      hljsDarkCss: ''
    });
    expect(html).toContain('@media print');
    expect(html).toContain('break-inside: avoid');
  });
});

describe('buildLayoutCss', () => {
  it('scopes max-width, centering margin, and padding to .markdown-body', () => {
    const css = buildLayoutCss();
    expect(css).toContain('.markdown-body');
    expect(css).toContain('max-width: 900px');
    expect(css).toContain('margin: 0 auto');
  });
});

describe('rescopeDarkCssForExport', () => {
  it('rewrites body.vscode-dark selectors to body.vscode-light', () => {
    const out = rescopeDarkCssForExport('body.vscode-dark .hljs { color: yellow; }');
    expect(out).toBe('body.vscode-light .hljs { color: yellow; }');
  });

  it('rewrites body.vscode-high-contrast (but not -light) selectors to body.vscode-light', () => {
    const out = rescopeDarkCssForExport('body.vscode-high-contrast .hljs { color: yellow; }');
    expect(out).toBe('body.vscode-light .hljs { color: yellow; }');
  });

  it('leaves an unrelated body.vscode-high-contrast-light selector untouched', () => {
    const out = rescopeDarkCssForExport('body.vscode-high-contrast-light .hljs { color: black; }');
    expect(out).toBe('body.vscode-high-contrast-light .hljs { color: black; }');
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

  it('preserves a local image as a file:// URI when the embed prompt is dismissed (default: link, not abort)', async () => {
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

  it('embeds a local image as a data: URI when the embed choice is picked', async () => {
    registerMediaFixtures();
    workspace.fsFiles.set(
      Uri.file('C:/project/img/shot.png').toString(),
      new Uint8Array([1, 2, 3, 4])
    );
    window.saveDialogResult = Uri.file('C:/project/readme.html');
    window.quickPickResult = 'Embed images (portable, larger file)';
    await exportHtml({
      document: doc('C:/project/readme.md', '![shot](./img/shot.png)\n') as unknown as Parameters<
        typeof exportHtml
      >[0]['document'],
      extensionUri: EXT_URI,
      render: createRenderer()
    });
    expect(workspace.writtenFiles).toHaveLength(1);
    const text = Buffer.from(workspace.writtenFiles[0].content).toString('utf8');
    expect(text).not.toContain('file:///C:/project/img/shot.png');
    expect(text).toContain(`src="data:image/png;base64,${Buffer.from([1, 2, 3, 4]).toString('base64')}"`);
  });

  it('embeds a non-ASCII-named image (markdown-it percent-encodes the src before the rewriter sees it)', async () => {
    registerMediaFixtures();
    workspace.fsFiles.set(Uri.file('C:/project/img/café.png').toString(), new Uint8Array([5, 6]));
    window.saveDialogResult = Uri.file('C:/project/readme.html');
    window.quickPickResult = 'Embed images (portable, larger file)';
    await exportHtml({
      document: doc('C:/project/readme.md', '![shot](./img/café.png)\n') as unknown as Parameters<
        typeof exportHtml
      >[0]['document'],
      extensionUri: EXT_URI,
      render: createRenderer()
    });
    const text = Buffer.from(workspace.writtenFiles[0].content).toString('utf8');
    expect(text).toContain(`src="data:image/png;base64,${Buffer.from([5, 6]).toString('base64')}"`);
  });

  it('does not prompt for embed choice and leaves images untouched for a non-file document', async () => {
    registerMediaFixtures();
    window.saveDialogResult = Uri.file('C:/project/readme.html');
    window.quickPickResult = 'Embed images (portable, larger file)';
    await exportHtml({
      document: {
        uri: Uri.parse('untitled:Untitled-1'),
        getText: () => '![shot](./local.png)\n'
      } as unknown as Parameters<typeof exportHtml>[0]['document'],
      extensionUri: EXT_URI,
      render: createRenderer()
    });
    const text = Buffer.from(workspace.writtenFiles[0].content).toString('utf8');
    expect(text).toContain('src="./local.png"');
  });

  it('falls back to file:// for an oversized image even when embed is chosen', async () => {
    registerMediaFixtures();
    workspace.fsFiles.set(Uri.file('C:/project/img/shot.png').toString(), new Uint8Array([1, 2, 3, 4]));
    workspace.fsFileSizeOverrides.set(Uri.file('C:/project/img/shot.png').toString(), 6 * 1024 * 1024);
    window.saveDialogResult = Uri.file('C:/project/readme.html');
    window.quickPickResult = 'Embed images (portable, larger file)';
    await exportHtml({
      document: doc('C:/project/readme.md', '![shot](./img/shot.png)\n') as unknown as Parameters<
        typeof exportHtml
      >[0]['document'],
      extensionUri: EXT_URI,
      render: createRenderer()
    });
    const text = Buffer.from(workspace.writtenFiles[0].content).toString('utf8');
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

describe('buildImageDataUriMap', () => {
  it('resolves a local image under the size cap to a data: URI', async () => {
    workspace.fsFiles.set(Uri.file('C:/project/img/shot.png').toString(), new Uint8Array([1, 2, 3]));
    const map = await buildImageDataUriMap('![shot](./img/shot.png)\n', 'C:/project');
    expect(map.get('./img/shot.png')).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString('base64')}`);
  });

  it('omits a local image over the size cap', async () => {
    workspace.fsFiles.set(Uri.file('C:/project/img/big.png').toString(), new Uint8Array([1]));
    workspace.fsFileSizeOverrides.set(Uri.file('C:/project/img/big.png').toString(), 6 * 1024 * 1024);
    const map = await buildImageDataUriMap('![big](./img/big.png)\n', 'C:/project');
    expect(map.has('./img/big.png')).toBe(false);
  });

  it('never embeds a local reference with an unrecognized (non-image) extension', async () => {
    workspace.fsFiles.set(Uri.file('C:/project/.env').toString(), new TextEncoder().encode('SECRET=1'));
    const map = await buildImageDataUriMap('![x](./.env)\n', 'C:/project');
    expect(map.has('./.env')).toBe(false);
  });

  it('never resolves a remote https: or data: source', async () => {
    const map = await buildImageDataUriMap(
      '![a](https://example.com/a.png) ![b](data:image/gif;base64,AAAA)\n',
      'C:/project'
    );
    expect(map.size).toBe(0);
  });

  it('returns an empty map without touching the filesystem when there are no images', async () => {
    const map = await buildImageDataUriMap('# Just a heading\n', 'C:/project');
    expect(map.size).toBe(0);
  });

  it('picks up a raw HTML <img src> reference the same as Markdown syntax', async () => {
    workspace.fsFiles.set(Uri.file('C:/project/logo.png').toString(), new Uint8Array([9]));
    const map = await buildImageDataUriMap('<img src="./logo.png" alt="logo">\n', 'C:/project');
    expect(map.get('./logo.png')).toBe(`data:image/png;base64,${Buffer.from([9]).toString('base64')}`);
  });

  it('extracts the real src, not a data-src lazy-load attribute, from a multi-attribute <img>', async () => {
    workspace.fsFiles.set(Uri.file('C:/project/placeholder.gif').toString(), new Uint8Array([1]));
    workspace.fsFiles.set(Uri.file('C:/project/real.jpg').toString(), new Uint8Array([2]));
    const map = await buildImageDataUriMap(
      '<img src="./placeholder.gif" data-src="./real.jpg">\n',
      'C:/project'
    );
    expect(map.has('./placeholder.gif')).toBe(true);
    expect(map.has('./real.jpg')).toBe(false);
  });

  it('silently skips a local reference that fails to read (missing file)', async () => {
    // No fixture registered for missing.png — fs.stat rejects.
    const map = await buildImageDataUriMap('![x](./missing.png)\n', 'C:/project');
    expect(map.has('./missing.png')).toBe(false);
  });
});
