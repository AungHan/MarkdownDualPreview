// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const initializeMock = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    render: (...args: unknown[]) => renderMock(...args)
  }
}));

import { decorateMermaidBlocks } from '../../src/webview/mermaidRenderer';

const NONCE = 'test-nonce-123';

function setBody(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

beforeEach(() => {
  renderMock.mockReset();
  initializeMock.mockReset();
});

describe('decorateMermaidBlocks', () => {
  // Must run first: mermaid.initialize() is called at most once per module
  // lifetime (a real webview session initializes exactly once), so this
  // assertion only holds before any other test has triggered it.
  it('calls mermaid.initialize with strict securityLevel and htmlLabels disabled', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');

    await decorateMermaidBlocks(root, NONCE);

    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'strict', htmlLabels: false, startOnLoad: false })
    );
  });

  it('calls mermaid.render once per .mermaid element with its textContent', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody(
      '<pre class="mermaid" data-line="1">graph TD; A--&gt;B;</pre>' +
        '<pre class="mermaid" data-line="5">sequenceDiagram; A-&gt;&gt;B: hi</pre>'
    );

    await decorateMermaidBlocks(root, NONCE);

    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(renderMock).toHaveBeenCalledWith(expect.any(String), 'graph TD; A-->B;');
    expect(renderMock).toHaveBeenCalledWith(expect.any(String), 'sequenceDiagram; A->>B: hi');
  });

  it('replaces element content with the rendered SVG on success', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><g>diagram</g></svg>' });
    const root = setBody('<pre class="mermaid" data-line="2">graph TD; A--&gt;B;</pre>');

    await decorateMermaidBlocks(root, NONCE);

    const el = root.querySelector('.mermaid');
    expect(el?.innerHTML).toContain('<svg>');
    expect(el?.innerHTML).toContain('diagram');
  });

  it('preserves the element node and its data-line attribute after rendering', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="7">graph TD; A--&gt;B;</pre>');

    await decorateMermaidBlocks(root, NONCE);

    const el = root.querySelector('.mermaid');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-line')).toBe('7');
    expect(el?.tagName.toLowerCase()).toBe('pre');
  });

  it('adds the supplied nonce to a <style> tag in the rendered SVG', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><style>.node{fill:#eee}</style><g>x</g></svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');

    await decorateMermaidBlocks(root, NONCE);

    const el = root.querySelector('.mermaid');
    expect(el?.innerHTML).toContain(`<style nonce="${NONCE}">`);
  });

  it('still patches the nonce onto a <style> tag that already carries an attribute', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg><style type="text/css">.node{fill:#eee}</style><g>x</g></svg>'
    });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');

    await decorateMermaidBlocks(root, NONCE);

    const el = root.querySelector('.mermaid');
    expect(el?.innerHTML).toContain(`nonce="${NONCE}"`);
    expect(el?.innerHTML).toContain('type="text/css"');
  });

  it('shows an inline error and continues rendering remaining blocks when one render rejects', async () => {
    renderMock
      .mockRejectedValueOnce(new Error('bad diagram'))
      .mockResolvedValueOnce({ svg: '<svg>ok</svg>' });
    const root = setBody(
      '<pre class="mermaid" data-line="0">bad syntax</pre>' +
        '<pre class="mermaid" data-line="3">graph TD; A--&gt;B;</pre>'
    );

    await decorateMermaidBlocks(root, NONCE);

    const blocks = root.querySelectorAll('.mermaid');
    expect(blocks[0].innerHTML).toContain('mermaid-error');
    expect(blocks[1].innerHTML).toContain('<svg>');
  });

  it('does nothing and does not call render when there are no .mermaid elements', async () => {
    const root = setBody('<p>no diagrams here</p>');

    await decorateMermaidBlocks(root, NONCE);

    expect(renderMock).not.toHaveBeenCalled();
  });
});
