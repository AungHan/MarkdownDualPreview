import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../src/markdown/renderer';

describe('createRenderer', () => {
  it('stamps data-line attributes on block elements', () => {
    const render = createRenderer();
    const { html } = render('# Title\n\nA paragraph.\n');
    expect(html).toMatch(/<h1[^>]*data-line="0"/);
    expect(html).toMatch(/<p data-line="2"/);
  });

  it('assigns heading id slugs that match the TOC', () => {
    const render = createRenderer();
    const { html, toc } = render('# Hello World\n');
    expect(html).toContain('id="hello-world"');
    expect(toc[0].slug).toBe('hello-world');
    expect(toc[0].text).toBe('Hello World');
    expect(toc[0].line).toBe(0);
  });

  it('deduplicates repeated heading slugs', () => {
    const render = createRenderer();
    const { html, toc } = render('# Setup\n\n# Setup\n\n# Setup\n');
    expect(html).toContain('id="setup"');
    expect(html).toContain('id="setup-1"');
    expect(html).toContain('id="setup-2"');
    expect(toc.map((n) => n.slug)).toEqual(['setup', 'setup-1', 'setup-2']);
  });

  it('produces identical slugs across successive renders (fresh slugger per render)', () => {
    const render = createRenderer();
    const first = render('# Setup\n\n# Setup\n');
    const second = render('# Setup\n\n# Setup\n');
    expect(second.toc.map((n) => n.slug)).toEqual(first.toc.map((n) => n.slug));
    expect(second.toc.map((n) => n.slug)).toEqual(['setup', 'setup-1']);
  });

  it('highlights fenced code for a known language', () => {
    const render = createRenderer();
    const { html } = render('```js\nconst x = 1;\n```\n');
    expect(html).toContain('<code class="hljs language-js">');
    expect(html).toContain('hljs-keyword');
  });

  it('falls back to escaped text for an unknown language', () => {
    const render = createRenderer();
    const { html } = render('```made-up-lang\n<b> & "q"\n```\n');
    expect(html).toContain('<code class="hljs">');
    expect(html).toContain('&lt;b&gt; &amp; &quot;q&quot;');
  });

  it('preserves data-line on fenced code blocks', () => {
    const render = createRenderer();
    const { html } = render('intro\n\n```js\nconst x = 1;\n```\n');
    expect(html).toMatch(/<pre data-line="2"/);
  });

  it('escapes raw HTML instead of rendering it (html: false)', () => {
    const render = createRenderer();
    const { html } = render('<script>alert(1)</script>\n');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('extracts plain text from formatted headings', () => {
    const render = createRenderer();
    const { toc } = render('## **Bold** and `code`\n');
    expect(toc[0].text).toBe('Bold and code');
    expect(toc[0].slug).toBe('bold-and-code');
  });
});
