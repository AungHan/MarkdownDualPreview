import { describe, expect, it } from 'vitest';
import { buildWebviewHtml, generateNonce } from '../../src/preview/webviewHtml';

const params = {
  cspSource: 'vscode-webview://abc',
  nonce: 'NONCE123',
  scriptUri: 'https://host/webview.js',
  styleUri: 'https://host/preview.css',
  hljsLightUri: 'https://host/light.css',
  hljsDarkUri: 'https://host/dark.css'
};

describe('buildWebviewHtml', () => {
  it('embeds the nonce on the script tag and in the CSP', () => {
    const html = buildWebviewHtml(params);
    expect(html).toContain(`script-src 'nonce-NONCE123'`);
    expect(html).toContain('nonce="NONCE123" src="https://host/webview.js"');
  });

  it('scopes styles and resources to the csp source', () => {
    const html = buildWebviewHtml(params);
    expect(html).toContain('style-src vscode-webview://abc');
    expect(html).toContain(`default-src 'none'`);
  });

  it('allows the nonce on style-src, for Mermaid-embedded <style> theming', () => {
    const html = buildWebviewHtml(params);
    expect(html).toContain(`style-src vscode-webview://abc 'nonce-NONCE123'`);
  });

  it('permits webview-uri, https, and data images (local image rewriting depends on this)', () => {
    const html = buildWebviewHtml(params);
    expect(html).toContain(`img-src vscode-webview://abc https: data:`);
  });

  it('blocks form submission, since default-src none does not cover form-action', () => {
    const html = buildWebviewHtml(params);
    expect(html).toContain(`form-action 'none'`);
  });

  it('links all stylesheets and the nav/content structure', () => {
    const html = buildWebviewHtml(params);
    expect(html).toContain('https://host/preview.css');
    expect(html).toContain('https://host/light.css');
    expect(html).toContain('https://host/dark.css');
    expect(html).toContain('id="toc-list"');
    expect(html).toContain('id="toc-resizer"');
    expect(html).toContain('id="content"');
  });

  it('leaves no unresolved template placeholders', () => {
    const html = buildWebviewHtml(params);
    expect(html).not.toMatch(/\$\{/);
  });
});

describe('generateNonce', () => {
  it('produces distinct, non-trivial values', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });
});
