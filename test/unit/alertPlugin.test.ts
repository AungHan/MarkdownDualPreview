import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../src/markdown/renderer';

describe('GitHub alerts', () => {
  it('renders a [!NOTE] blockquote as a styled alert div with a title', () => {
    const render = createRenderer();
    const { html } = render('> [!NOTE]\n> Useful information.\n');
    expect(html).toContain('class="markdown-alert markdown-alert-note"');
    expect(html).toContain('<p class="markdown-alert-title">Note</p>');
    expect(html).toContain('Useful information.');
    expect(html).not.toContain('[!NOTE]');
    expect(html).not.toContain('<blockquote');
  });

  it('renders all five GitHub alert types', () => {
    const render = createRenderer();
    const cases: ReadonlyArray<[string, string]> = [
      ['NOTE', 'note'],
      ['TIP', 'tip'],
      ['IMPORTANT', 'important'],
      ['WARNING', 'warning'],
      ['CAUTION', 'caution']
    ];
    for (const [marker, type] of cases) {
      const { html } = render(`> [!${marker}]\n> body\n`);
      expect(html).toContain(`markdown-alert markdown-alert-${type}`);
    }
  });

  it('does not transform a lowercase [!note] marker', () => {
    const render = createRenderer();
    const { html } = render('> [!note]\n> body\n');
    expect(html).not.toContain('markdown-alert');
    expect(html).toContain('<blockquote');
  });

  it('does not transform a marker that is not alone on the first line', () => {
    const render = createRenderer();
    const { html } = render('> Heads up [!NOTE]\n> body\n');
    expect(html).not.toContain('markdown-alert');
    expect(html).toContain('<blockquote');
  });

  it('leaves an ordinary blockquote untouched', () => {
    const render = createRenderer();
    const { html } = render('> just a quote\n');
    expect(html).not.toContain('markdown-alert');
    expect(html).toContain('<blockquote');
    expect(html).toContain('just a quote');
  });

  it('preserves inline formatting inside the alert body', () => {
    const render = createRenderer();
    const { html } = render('> [!TIP]\n> See **bold** and [a link](https://example.com).\n');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.com"');
  });

  it('handles a marker on its own paragraph followed by a separate body paragraph', () => {
    const render = createRenderer();
    const { html } = render('> [!WARNING]\n>\n> Danger below.\n');
    expect(html).toContain('markdown-alert markdown-alert-warning');
    expect(html).toContain('Danger below.');
    expect(html).not.toContain('[!WARNING]');
  });

  it('preserves data-line on the alert div for scroll sync', () => {
    const render = createRenderer();
    const { html } = render('intro\n\n> [!NOTE]\n> body\n');
    expect(html).toContain('class="markdown-alert markdown-alert-note"');
    expect(html).toMatch(/data-line="2"/);
  });
});
