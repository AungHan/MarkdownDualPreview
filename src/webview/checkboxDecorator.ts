/**
 * Attach `change` handlers to every task-list checkbox inside {@link contentEl}.
 * Call after each `updateContent` (innerHTML swap destroys previous handlers).
 *
 * `markdown-it-task-lists` (configured with `enabled: true`) already renders
 * these checkboxes without a `disabled` attribute, so no attribute removal is
 * needed here — only wiring the toggle back to the extension host.
 */
export function decorateCheckboxes(
  contentEl: HTMLElement,
  onToggle: (line: number, checked: boolean) => void
): void {
  contentEl
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((checkbox) => {
      const listItem = checkbox.closest<HTMLElement>('[data-line]');
      if (!listItem) {
        return;
      }
      const line = Number(listItem.dataset.line);
      if (Number.isNaN(line)) {
        return;
      }
      checkbox.addEventListener('change', () => {
        onToggle(line, checkbox.checked);
      });
    });
}
