import { describe, expect, it } from 'vitest';
import { renderMath } from '../../src/markdown/math';

describe('renderMath', () => {
  it('renders valid LaTeX to a MathML root with no style attribute', () => {
    const out = renderMath('E = mc^2', true);
    expect(out).toContain('<math');
    expect(out).not.toMatch(/style=/);
  });

  it('emits no <svg> and no <script> in its output', () => {
    const out = renderMath('E = mc^2', true);
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('<script');
  });

  it('sets display="block" for displayMode true', () => {
    const out = renderMath('x', true);
    expect(out).toMatch(/display="block"/);
  });

  it('renders inline (non-block) math without display="block"', () => {
    const out = renderMath('x', false);
    expect(out).not.toMatch(/display="block"/);
  });

  it('returns a sanitizer-safe error element for malformed LaTeX instead of throwing', () => {
    expect(() => renderMath('\\frac{1}', true)).not.toThrow();
    const out = renderMath('\\frac{1}', true);
    expect(out).toContain('math-error');
  });

  it('escapes the source inside the error element', () => {
    const out = renderMath('\\frac{<script>alert(1)</script>}', true);
    expect(out).not.toContain('<script>alert(1)</script>');
  });
});
