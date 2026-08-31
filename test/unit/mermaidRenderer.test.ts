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
      expect.objectContaining({
        securityLevel: 'strict',
        htmlLabels: false,
        startOnLoad: false,
        suppressErrorRendering: true
      })
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

describe('decorateMermaidBlocks theme detection', () => {
  it('initializes mermaid with theme "dark" when body has class vscode-dark', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-light';
    await decorateMermaidBlocks(root, NONCE);
    initializeMock.mockClear();

    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);

    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('initializes mermaid with theme "dark" when body has class vscode-high-contrast', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-light';
    await decorateMermaidBlocks(root, NONCE);
    initializeMock.mockClear();

    document.body.className = 'vscode-high-contrast';
    await decorateMermaidBlocks(root, NONCE);

    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('initializes mermaid with theme "default" when body has class vscode-light', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);
    initializeMock.mockClear();

    document.body.className = 'vscode-light';
    await decorateMermaidBlocks(root, NONCE);

    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'default' }));
  });

  it('initializes mermaid with theme "default" when body has class vscode-high-contrast-light', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);
    initializeMock.mockClear();

    document.body.className = 'vscode-high-contrast-light';
    await decorateMermaidBlocks(root, NONCE);

    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'default' }));
  });

  it('skips re-initializing mermaid when the theme has not changed', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);
    initializeMock.mockClear();

    await decorateMermaidBlocks(root, NONCE);

    expect(initializeMock).not.toHaveBeenCalled();
  });

  it('re-initializes mermaid when the theme changes on a later call', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-light';
    await decorateMermaidBlocks(root, NONCE);
    initializeMock.mockClear();

    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);

    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('re-renders a diagram from its original source, not the rendered SVG, after a theme change', async () => {
    renderMock.mockResolvedValue({ svg: '<svg><g>diagram</g></svg>' });
    const root = setBody('<pre class="mermaid" data-line="4">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-light';
    await decorateMermaidBlocks(root, NONCE);
    renderMock.mockClear();

    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);

    expect(renderMock).toHaveBeenCalledWith(expect.any(String), 'graph TD; A-->B;');
  });

  it('preserves the element node and its data-line attribute across a theme-change re-render', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="9">graph TD; A--&gt;B;</pre>');
    const elBefore = root.querySelector('.mermaid');
    document.body.className = 'vscode-light';
    await decorateMermaidBlocks(root, NONCE);

    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);

    const elAfter = root.querySelector('.mermaid');
    expect(elAfter).toBe(elBefore);
    expect(elAfter?.getAttribute('data-line')).toBe('9');
  });

  it('re-initializes with the full security-critical options set, not just theme, on a theme change', async () => {
    renderMock.mockResolvedValue({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-light';
    await decorateMermaidBlocks(root, NONCE);
    initializeMock.mockClear();

    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);

    expect(initializeMock).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      suppressErrorRendering: true,
      theme: 'dark'
    });
  });

  it('re-renders an errored diagram from its original source on a later theme-change call', async () => {
    renderMock.mockRejectedValueOnce(new Error('bad diagram')).mockResolvedValueOnce({ svg: '<svg>ok</svg>' });
    const root = setBody('<pre class="mermaid" data-line="0">bad syntax</pre>');
    document.body.className = 'vscode-light';
    await decorateMermaidBlocks(root, NONCE);
    expect(root.querySelector('.mermaid')?.innerHTML).toContain('mermaid-error');

    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);

    expect(renderMock).toHaveBeenLastCalledWith(expect.any(String), 'bad syntax');
    expect(root.querySelector('.mermaid')?.innerHTML).toContain('<svg>');
  });

  it('applies only the latest call result when an older call is still in flight', async () => {
    const root = setBody('<pre class="mermaid" data-line="0">graph TD; A--&gt;B;</pre>');
    document.body.className = 'vscode-light';

    let resolveStale: (value: { svg: string }) => void = () => {};
    const stalePromise = new Promise<{ svg: string }>((resolve) => {
      resolveStale = resolve;
    });
    renderMock.mockReturnValueOnce(stalePromise);
    const staleCall = decorateMermaidBlocks(root, NONCE);

    renderMock.mockResolvedValueOnce({ svg: '<svg><g>fresh</g></svg>' });
    document.body.className = 'vscode-dark';
    await decorateMermaidBlocks(root, NONCE);

    resolveStale({ svg: '<svg><g>stale</g></svg>' });
    await staleCall;

    expect(root.querySelector('.mermaid')?.innerHTML).toContain('fresh');
  });
});
