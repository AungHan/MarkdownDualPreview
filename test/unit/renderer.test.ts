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

  it('renders a ```math fence as MathML', () => {
    const render = createRenderer();
    const { html } = render('```math\nE=mc^2\n```\n');
    expect(html).toContain('<math');
    expect(html).not.toContain('<code class="hljs');
  });

  it('renders a $$...$$ block as MathML via the custom block rule', () => {
    const render = createRenderer();
    const { html } = render('$$\nE=mc^2\n$$\n');
    expect(html).toContain('<math');
  });

  it('renders a single-line $$...$$ block as MathML', () => {
    const render = createRenderer();
    const { html } = render('$$ E=mc^2 $$\n');
    expect(html).toContain('<math');
  });

  it('does not treat inline $5 / $10 currency text as math', () => {
    const render = createRenderer();
    const { html } = render('The price is $5, not $10.\n');
    expect(html).toContain('$5');
    expect(html).toContain('$10');
    expect(html).not.toContain('<math');
  });

  it('renders a multi-line $$...$$ block, joining the lines as one formula source', () => {
    const render = createRenderer();
    const { html } = render('$$\na + b\n= c\n$$\n');
    expect(html).toContain('<math');
  });

  it('leaves an unterminated $$ block as literal text rather than erroring', () => {
    const render = createRenderer();
    const { html } = render('$$\nno closing delimiter\n');
    expect(html).not.toContain('<math');
    expect(html).toContain('$$');
  });

  it('stamps data-line on a $$ math block for scroll sync', () => {
    const render = createRenderer();
    const { html } = render('intro\n\n$$\nE=mc^2\n$$\n');
    expect(html).toMatch(/data-line="2"/);
  });

  it('renders a $$ block immediately following a paragraph line with no blank line between', () => {
    const render = createRenderer();
    const { html } = render('Some text\n$$\nE=mc^2\n$$\n');
    expect(html).toContain('<math');
    expect(html).not.toContain('$$');
  });

  it('renders a $$ block immediately following a list item with no blank line between', () => {
    const render = createRenderer();
    const { html } = render('- item text\n  $$\n  E=mc^2\n  $$\n');
    expect(html).toContain('<math');
  });

  it('renders a $$ block immediately following a blockquote line with no blank line between', () => {
    const render = createRenderer();
    const { html } = render('> text\n$$\nE=mc^2\n$$\n');
    expect(html).toContain('<math');
  });

  it('renders a ```mermaid fence as an unrendered placeholder with escaped source', () => {
    const render = createRenderer();
    const { html } = render('```mermaid\ngraph TD; A-->B;\n```\n');
    expect(html).toContain('<pre class="mermaid"');
    expect(html).toContain('graph TD; A--&gt;B;');
    expect(html).not.toContain('<code class="hljs');
  });

  it('preserves data-line on a mermaid fence placeholder', () => {
    const render = createRenderer();
    const { html } = render('intro\n\n```mermaid\ngraph TD; A-->B;\n```\n');
    expect(html).toMatch(/<pre class="mermaid" data-line="2"/);
  });

  it('does not run mermaid source through hljs even if it looks like a known language', () => {
    const render = createRenderer();
    const { html } = render('```mermaid\nclass Foo\n```\n');
    expect(html).not.toContain('hljs-');
  });

  it('renders a :smile: shortcode as a Unicode emoji character', () => {
    const render = createRenderer();
    const { html } = render('Hello :smile:\n');
    expect(html).not.toContain(':smile:');
    expect(html).toContain('😄');
  });

  it('leaves an unknown emoji shortcode as literal text', () => {
    const render = createRenderer();
    const { html } = render('This is :notreal: text.\n');
    expect(html).toContain(':notreal:');
  });

  it('renders emoji inside a heading in both HTML and TOC text', () => {
    const render = createRenderer();
    const { html, toc } = render('# Hello :wave:\n');
    expect(html).toContain('👋');
    expect(toc[0].text).toContain('👋');
  });

  it('renders an unchecked task list item as a checkbox input', () => {
    const render = createRenderer();
    const { html } = render('- [ ] unchecked item\n');
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
    expect(html).not.toMatch(/<input[^>]*checked/);
  });

  it('renders a checked task list item as a checked checkbox input', () => {
    const render = createRenderer();
    const { html } = render('- [x] checked item\n');
    expect(html).toMatch(/<input[^>]*checked[^>]*type="checkbox"/);
  });

  it('carries data-line on task list items for scroll sync', () => {
    const render = createRenderer();
    const { html } = render('- [ ] first item\n');
    expect(html).toMatch(/<li[^>]*data-line="0"/);
  });

  it('renders nested task lists correctly', () => {
    const render = createRenderer();
    const { html } = render('- [ ] parent\n  - [x] child\n');
    const checkboxCount = (html.match(/type="checkbox"/g) ?? []).length;
    expect(checkboxCount).toBe(2);
  });
});
