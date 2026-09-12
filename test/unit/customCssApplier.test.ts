// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyCustomCss } from '../../src/webview/customCssApplier';

afterEach(() => {
  document.head.innerHTML = '';
});

describe('applyCustomCss', () => {
  it('appends a <style id="custom-css"> element with the given text and nonce', () => {
    applyCustomCss('.x{color:red}', 'abc123');
    const style = document.getElementById('custom-css') as HTMLStyleElement;
    expect(style).not.toBeNull();
    expect(style.textContent).toBe('.x{color:red}');
    expect(style.nonce).toBe('abc123');
    expect(style.tagName).toBe('STYLE');
  });

  it('replaces a previous custom-css style element rather than stacking a second one', () => {
    applyCustomCss('.v1{}', 'n');
    applyCustomCss('.v2{}', 'n');
    const styles = document.head.querySelectorAll('#custom-css');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe('.v2{}');
  });

  it('removes the style element when passed an empty string', () => {
    applyCustomCss('.x{}', 'n');
    applyCustomCss('', 'n');
    expect(document.getElementById('custom-css')).toBeNull();
  });

  it('does not throw and adds nothing when called with an empty string and no prior element', () => {
    expect(() => applyCustomCss('', 'n')).not.toThrow();
    expect(document.getElementById('custom-css')).toBeNull();
  });

  it('never re-parses css content as markup (assigned via textContent, not innerHTML)', () => {
    applyCustomCss('/* </style><img src=x onerror=alert(1)> */', 'n');
    const style = document.getElementById('custom-css') as HTMLStyleElement;
    expect(style.textContent).toBe('/* </style><img src=x onerror=alert(1)> */');
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });
});
