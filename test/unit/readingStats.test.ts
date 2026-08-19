// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { decorateCodeBlocks } from '../../src/webview/codeCopy';
import { computeReadingStats } from '../../src/webview/wordCount';

/**
 * Guards the ordering in main.ts: reading stats must be computed from author
 * content *before* decorators inject chrome. `decorateCodeBlocks` appends a
 * "Copy" button into every <pre>, so a count taken afterwards is inflated.
 */
describe('reading stats vs code-copy chrome', () => {
  it('the text counted before decoration is free of the Copy button chrome', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>one two three</p><pre><code>const x = 1;</code></pre>';

    const beforeText = el.textContent ?? '';
    decorateCodeBlocks(el, () => undefined);
    const afterText = el.textContent ?? '';

    // The decorator injects a real "Copy" button; counting after it contaminates.
    expect(el.querySelector('.code-copy-btn')?.textContent).toBe('Copy');
    expect(beforeText).not.toContain('Copy');
    expect(afterText).toContain('Copy');
    // Author content is still counted before decoration.
    expect(computeReadingStats(beforeText).words).toBeGreaterThan(0);
  });
});
