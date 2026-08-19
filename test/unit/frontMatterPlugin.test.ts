import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../src/markdown/renderer';

describe('front matter', () => {
  it('renders a leading --- block as a collapsed metadata table', () => {
    const render = createRenderer();
    const { html } = render('---\ntitle: Hello\nauthor: Jane\n---\n\n# Body\n');
    expect(html).toContain('<details class="front-matter"');
    expect(html).toContain('<summary>Metadata</summary>');
    expect(html).toContain('<th>title</th>');
    expect(html).toContain('<td>Hello</td>');
    expect(html).toContain('<th>author</th>');
    expect(html).toContain('<td>Jane</td>');
    // Collapsed by default: no `open` attribute.
    expect(html).not.toContain('<details class="front-matter" open');
  });

  it('joins a simple YAML list into one cell', () => {
    const render = createRenderer();
    const { html } = render('---\ntags:\n  - alpha\n  - beta\n---\n\ntext\n');
    expect(html).toContain('<th>tags</th>');
    expect(html).toContain('<td>alpha, beta</td>');
  });

  it('strips surrounding quotes from a scalar value', () => {
    const render = createRenderer();
    const { html } = render('---\ntitle: "Quoted Title"\n---\n\ntext\n');
    expect(html).toContain('<td>Quoted Title</td>');
  });

  it('keeps absolute source lines correct for content after the block', () => {
    const render = createRenderer();
    const { html } = render('---\ntitle: Hi\n---\n\n# Heading\n');
    // `# Heading` is on source line 4; front matter must not shift the numbering.
    expect(html).toMatch(/<h1[^>]*data-line="4"/);
  });

  it('treats a --- outside line 0 as a thematic break, not front matter', () => {
    const render = createRenderer();
    const { html } = render('# Title\n\n---\n\nmore\n');
    expect(html).not.toContain('front-matter');
    expect(html).toContain('<hr');
  });

  it('falls through to a thematic break when the leading --- is unterminated', () => {
    const render = createRenderer();
    const { html } = render('---\ntitle: Hi\n\nno closing fence\n');
    expect(html).not.toContain('front-matter');
  });

  it('renders no chrome when nothing parses', () => {
    const render = createRenderer();
    const { html } = render('---\n---\n\ntext\n');
    expect(html).not.toContain('front-matter');
  });

  it('does not delete ordinary Markdown between a leading --- and a later ---', () => {
    const render = createRenderer();
    // Opens with a thematic break and has another --- later, but no metadata
    // rows: the fenced region must NOT be swallowed — the prose has to survive.
    const { html } = render('---\n\nJust a sentence.\n\n---\n\n# Heading\n');
    expect(html).not.toContain('front-matter');
    expect(html).toContain('Just a sentence.');
    expect(html).toContain('<hr');
    expect(html).toContain('Heading');
  });
});
