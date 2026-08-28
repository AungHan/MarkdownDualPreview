// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { decorateCheckboxes } from '../../src/webview/checkboxDecorator';

function setBody(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('decorateCheckboxes', () => {
  it('reports line and checked state on change', () => {
    const root = setBody(
      '<li data-line="4"><input type="checkbox"> item</li>'
    );
    const onToggle = vi.fn();
    decorateCheckboxes(root, onToggle);

    const checkbox = root.querySelector('input') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(onToggle).toHaveBeenCalledWith(4, true);
  });

  it('reports unchecked state when toggled off', () => {
    const root = setBody(
      '<li data-line="7"><input type="checkbox" checked> item</li>'
    );
    const onToggle = vi.fn();
    decorateCheckboxes(root, onToggle);

    const checkbox = root.querySelector('input') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(onToggle).toHaveBeenCalledWith(7, false);
  });

  it('finds the source line from the closest [data-line] ancestor', () => {
    const root = setBody(
      '<ul data-line="1"><li data-line="2"><input type="checkbox"></li></ul>'
    );
    const onToggle = vi.fn();
    decorateCheckboxes(root, onToggle);

    const checkbox = root.querySelector('input') as HTMLInputElement;
    checkbox.dispatchEvent(new Event('change'));

    expect(onToggle).toHaveBeenCalledWith(2, false);
  });

  it('ignores a checkbox with no [data-line] ancestor', () => {
    const root = setBody('<div><input type="checkbox"></div>');
    const onToggle = vi.fn();
    decorateCheckboxes(root, onToggle);

    const checkbox = root.querySelector('input') as HTMLInputElement;
    checkbox.dispatchEvent(new Event('change'));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does nothing when there are no checkboxes', () => {
    const root = setBody('<p>no checkboxes here</p>');
    const onToggle = vi.fn();
    expect(() => decorateCheckboxes(root, onToggle)).not.toThrow();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
