/** Minimal shape of the parts of `vscode.Uri` we need to build a key. */
export interface UriLike {
  readonly scheme: string;
  readonly fsPath: string;
  toString(): string;
}

/**
 * Platforms whose filesystems VS Code treats as case-insensitive. On these,
 * two paths differing only in case denote the same file and must share a key;
 * elsewhere (Linux and other case-sensitive volumes) case is significant and
 * must be preserved, or distinct files would alias to one preview.
 */
const CASE_INSENSITIVE_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set(['win32', 'darwin']);

/**
 * Produce a stable map key identifying the document a preview belongs to.
 *
 * Separators are always normalized to `/`. Case is folded only on
 * case-insensitive platforms (Windows, macOS), which also collapses the
 * inconsistent Windows drive-letter casing (`c:\` vs `C:\`). Non-file schemes
 * (e.g. `untitled:`) are kept verbatim via `toString()`.
 *
 * `platform` is injectable purely so both branches can be unit tested; callers
 * should use the default.
 */
export function docKey(uri: UriLike, platform: NodeJS.Platform = process.platform): string {
  if (uri.scheme !== 'file') {
    return uri.toString();
  }
  const normalized = uri.fsPath.replace(/\\/g, '/');
  const path = CASE_INSENSITIVE_PLATFORMS.has(platform) ? normalized.toLowerCase() : normalized;
  return `file:${path}`;
}
