/**
 * Typed message protocol shared between the extension host and the webview.
 *
 * Kept dependency-free (no `vscode`, no DOM) so it can be imported by both the
 * Node-side bundle and the browser-side bundle without type-lib conflicts.
 */

/** A single entry in the table of contents tree. */
export interface TocNode {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  /** Plain-text heading label (inline formatting stripped). */
  readonly text: string;
  /** URL-fragment slug; matches the `id` attribute on the rendered heading. */
  readonly slug: string;
  /** 0-based source line of the heading. */
  readonly line: number;
  readonly children: readonly TocNode[];
}

/** The four theme families VS Code exposes via the `body` class. */
export type ThemeKind = 'light' | 'dark' | 'highContrast' | 'highContrastLight';

/** Messages sent from the extension host to the webview. */
export type ToWebviewMessage =
  | { readonly type: 'updateContent'; readonly html: string; readonly toc: readonly TocNode[] }
  | { readonly type: 'revealLine'; readonly line: number }
  | { readonly type: 'themeChanged'; readonly kind: ThemeKind }
  | { readonly type: 'settingsChanged'; readonly maxContentWidth: number };

/** Messages sent from the webview back to the extension host. */
export type FromWebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'scrollChanged'; readonly line: number }
  | { readonly type: 'tocToggled'; readonly collapsed: boolean }
  | { readonly type: 'copyText'; readonly text: string }
  | { readonly type: 'checkboxToggled'; readonly line: number; readonly checked: boolean };

/** Runtime type guard for messages arriving from the (untrusted) webview. */
export function isFromWebviewMessage(value: unknown): value is FromWebviewMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  switch (type) {
    case 'ready':
      return true;
    case 'scrollChanged':
      return typeof (value as { line?: unknown }).line === 'number';
    case 'tocToggled':
      return typeof (value as { collapsed?: unknown }).collapsed === 'boolean';
    case 'copyText':
      return typeof (value as { text?: unknown }).text === 'string';
    case 'checkboxToggled': {
      const line = (value as { line?: unknown }).line;
      return (
        typeof line === 'number' &&
        Number.isInteger(line) &&
        line >= 0 &&
        typeof (value as { checked?: unknown }).checked === 'boolean'
      );
    }
    default:
      return false;
  }
}
