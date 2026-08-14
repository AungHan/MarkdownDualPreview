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
    // `<` and `&` must stay entity-escaped (or the fence content would parse as
    // markup); a bare quote in text content is valid HTML and round-trips as-is.
    expect(html).toContain('&lt;b&gt; &amp; "q"');
  });

  it('preserves data-line on fenced code blocks', () => {
    const render = createRenderer();
    const { html } = render('intro\n\n```js\nconst x = 1;\n```\n');
    expect(html).toMatch(/<pre data-line="2"/);
  });

  it('renders safe raw HTML as elements instead of escaping it', () => {
    const render = createRenderer();
    const { html } = render('<details><summary>x</summary>body</details>\n');
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>x</summary>');
  });

  it('strips raw <script> tags rather than rendering or escaping them', () => {
    const render = createRenderer();
    const { html } = render('<script>alert(1)</script>\n');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
  });

  it('does not throw and leaves image src untouched when called with no options', () => {
    const render = createRenderer();
    const { html } = render('![alt](./a.png)\n');
    expect(html).toContain('src="./a.png"');
  });

  it('applies rewriteResourceSrc to a Markdown-authored image', () => {
    const render = createRenderer();
    const { html } = render('![alt](./a.png)\n', {
      rewriteResourceSrc: (src) => `https://rewritten.test/${src}`
    });
    expect(html).toContain('src="https://rewritten.test/./a.png"');
  });

  it('extracts plain text from formatted headings', () => {
    const render = createRenderer();
    const { toc } = render('## **Bold** and `code`\n');
    expect(toc[0].text).toBe('Bold and code');
    expect(toc[0].slug).toBe('bold-and-code');
  });
});
