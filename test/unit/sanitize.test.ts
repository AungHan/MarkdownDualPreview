import { describe, expect, it } from 'vitest';
import { sanitizeDocumentHtml } from '../../src/markdown/sanitize';

const identity = (src: string): string => src;
// Real rewriters always produce an https: webview URI (see D4); scheme
// validation runs after transformTags, so a non-URL string would be dropped.
const rewritten = (src: string): string => `https://rewritten.test/${encodeURIComponent(src)}`;

describe('sanitizeDocumentHtml — strips dangerous content', () => {
  it('strips <script> tags and their content', () => {
    const out = sanitizeDocumentHtml('<script>alert(1)</script>', identity);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips onerror and other event handler attributes from img', () => {
    const out = sanitizeDocumentHtml('<img src="x" onerror="alert(1)">', identity);
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('strips javascript: hrefs', () => {
    const out = sanitizeDocumentHtml('<a href="javascript:alert(1)">x</a>', identity);
    expect(out).not.toContain('javascript:');
  });

  it('strips <base> tags', () => {
    const out = sanitizeDocumentHtml('<base href="https://evil.test/">', identity);
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('<base');
  });

  it('strips <form> and its action, discarding the form wrapper', () => {
    const out = sanitizeDocumentHtml(
      '<form action="https://evil.test"><input name="x"></form>',
      identity
    );
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('action=');
  });

  it('strips <iframe> tags', () => {
    const out = sanitizeDocumentHtml('<iframe src="https://evil.test"></iframe>', identity);
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('<iframe');
  });

  it('strips style attributes', () => {
    const out = sanitizeDocumentHtml(
      '<div style="background:url(https://evil.test/pixel)">x</div>',
      identity
    );
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('style=');
  });

  it('strips <meta> refresh redirects', () => {
    const out = sanitizeDocumentHtml(
      '<meta http-equiv="refresh" content="0;url=https://evil.test">',
      identity
    );
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('<meta');
  });

  it('strips <object>, <embed>, and <applet>', () => {
    const out = sanitizeDocumentHtml(
      '<object data="https://evil.test"></object><embed src="https://evil.test"><applet code="Evil"></applet>',
      identity
    );
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('Evil');
  });

  it('strips <link> and <style> tags', () => {
    const out = sanitizeDocumentHtml(
      '<link rel="stylesheet" href="https://evil.test/x.css"><style>body{}</style>',
      identity
    );
    expect(out).not.toContain('evil.test');
    expect(out).not.toContain('<style');
  });

  it('strips <source> tags inside <picture>', () => {
    const out = sanitizeDocumentHtml(
      '<picture><source srcset="./dark.png"><img src="./light.png"></picture>',
      identity
    );
    expect(out).not.toContain('<source');
  });
});

describe('sanitizeDocumentHtml — preserves our own renderer output', () => {
  it('preserves data-line on block elements', () => {
    const out = sanitizeDocumentHtml('<p data-line="2">text</p>', identity);
    expect(out).toContain('data-line="2"');
  });

  it('preserves id on headings', () => {
    const out = sanitizeDocumentHtml('<h1 id="hello-world" data-line="0">Hello</h1>', identity);
    expect(out).toContain('id="hello-world"');
  });

  it('preserves hljs classes on code and spans', () => {
    const out = sanitizeDocumentHtml(
      '<pre data-line="0"><code class="hljs language-js"><span class="hljs-keyword">const</span> x = 1;</code></pre>',
      identity
    );
    expect(out).toContain('class="hljs language-js"');
    expect(out).toContain('class="hljs-keyword"');
  });

  it('leaves escaped script text inside a fenced code block untouched', () => {
    const escaped = '<pre data-line="0"><code class="hljs">&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>';
    const out = sanitizeDocumentHtml(escaped, identity);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toMatch(/<script(?!Test)/);
  });

  it('preserves <details><summary> across the token boundary', () => {
    const out = sanitizeDocumentHtml('<details><summary>x</summary>body</details>', identity);
    expect(out).toContain('<details>');
    expect(out).toContain('<summary>x</summary>');
    expect(out).toContain('body');
    expect(out).toContain('</details>');
  });

  it('round-trips entities without double-escaping', () => {
    const out = sanitizeDocumentHtml('<p>A &amp; B</p>', identity);
    expect(out).toContain('A &amp; B');
    expect(out).not.toContain('&amp;amp;');
  });
});

describe('sanitizeDocumentHtml — image rewriting', () => {
  it('calls rewriteSrc for a Markdown-authored image and applies the result', () => {
    const out = sanitizeDocumentHtml('<img src="./a.png" alt="a">', rewritten);
    expect(out).toContain(`src="${rewritten('./a.png')}"`);
  });

  it('calls rewriteSrc for a raw-HTML-authored image identically', () => {
    const out = sanitizeDocumentHtml('<p>text</p><img src="./b.png">', rewritten);
    expect(out).toContain(`src="${rewritten('./b.png')}"`);
  });

  it('does not call rewriteSrc for an img with no src and does not throw', () => {
    let called = false;
    const spy = (src: string): string => {
      called = true;
      return src;
    };
    expect(() => sanitizeDocumentHtml('<img alt="no src">', spy)).not.toThrow();
    expect(called).toBe(false);
  });

  it('adds noopener noreferrer and target=_blank to anchors', () => {
    const out = sanitizeDocumentHtml('<a href="https://example.com">x</a>', identity);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});
