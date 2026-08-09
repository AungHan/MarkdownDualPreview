/** How an `<img src>` reference should be treated. */
export type ResolvedResource =
  /** Leave the attribute untouched (remote, data:, or unresolvable). */
  | { readonly kind: 'external' }
  /** A local file; `path` is absolute and '/'-separated. */
  | { readonly kind: 'local'; readonly path: string };

export interface ResolveContext {
  /** Absolute '/'-separated directory containing the source document, no trailing slash. */
  readonly documentDir: string;
  /** Absolute '/'-separated workspace-folder root, when the document is inside one. */
  readonly workspaceRoot?: string;
}

/** Matches a URI scheme prefix, e.g. `https:`, `data:`, `vscode-webview:`. */
const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** A Windows drive-letter absolute path, e.g. `C:/x.png`. */
const DRIVE_LETTER_PATTERN = /^[a-zA-Z]:\//;

/** Splits a base path into an optional drive-letter prefix and its remaining segments. */
const DRIVE_LETTER_BASE_PATTERN = /^([a-zA-Z]:)\/?(.*)$/;

/**
 * Classify an image reference as remote (leave alone) or local (rewrite).
 * Never throws; malformed input classifies as 'external'.
 */
export function classifyResource(src: string, ctx: ResolveContext): ResolvedResource {
  const trimmed = src.trim();
  if (trimmed === '' || trimmed.startsWith('#')) {
    return { kind: 'external' };
  }
  if (trimmed.startsWith('//')) {
    return { kind: 'external' };
  }

  const schemeMatch = SCHEME_PATTERN.exec(trimmed);
  if (schemeMatch && schemeMatch[1].length > 1) {
    // A real URI scheme (http, data, vscode-webview, mailto, javascript, file, ...).
    return { kind: 'external' };
  }
  // A single-letter "scheme" match (e.g. `C:`) is a Windows drive letter, not a scheme.

  const withoutFragment = trimmed.split('#')[0] ?? '';
  const withoutQuery = withoutFragment.split('?')[0] ?? '';
  if (withoutQuery === '') {
    return { kind: 'external' };
  }

  const normalized = withoutQuery.replace(/\\/g, '/');
  const decoded = tryDecode(normalized);

  if (DRIVE_LETTER_PATTERN.test(decoded)) {
    return { kind: 'local', path: decoded };
  }

  if (decoded.startsWith('/')) {
    if (!ctx.workspaceRoot) {
      return { kind: 'external' };
    }
    return { kind: 'local', path: joinAndNormalize(ctx.workspaceRoot, decoded.slice(1)) };
  }

  return { kind: 'local', path: joinAndNormalize(ctx.documentDir, decoded) };
}

function tryDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Join a relative path onto a base directory, collapsing `.`/`..` segments.
 * `..` cannot escape above the root of `base`. Preserves a Windows drive-letter
 * prefix on `base` rather than treating it as a POSIX root segment.
 */
function joinAndNormalize(base: string, relative: string): string {
  const driveMatch = DRIVE_LETTER_BASE_PATTERN.exec(base);
  const prefix = driveMatch ? driveMatch[1] : '';
  const baseRest = driveMatch ? driveMatch[2] : base;

  const stack = baseRest.split('/').filter((segment) => segment.length > 0);
  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }
    stack.push(segment);
  }

  return prefix ? `${prefix}/${stack.join('/')}` : `/${stack.join('/')}`;
}
