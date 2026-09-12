import * as vscode from 'vscode';

export interface ResolvedCustomCss {
  /** Absolute '/'-separated paths, deduped, in configured order. */
  readonly paths: readonly string[];
  /** The raw entries that were rejected (wrong extension, remote, or unresolvable), for one warning. */
  readonly rejected: readonly string[];
}

/** A custom CSS file over this size is skipped rather than loaded. */
const MAX_CUSTOM_CSS_BYTES = 1024 * 1024;

const DRIVE_LETTER_PATTERN = /^[a-zA-Z]:\//;
const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const DRIVE_LETTER_BASE_PATTERN = /^([a-zA-Z]:)\/?(.*)$/;

/** Filesystems VS Code treats as case-insensitive — same set `util/docKey.ts` uses. */
const CASE_INSENSITIVE_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set(['win32', 'darwin']);

function isCssPath(value: string): boolean {
  return /\.css$/i.test(value);
}

/**
 * Join a relative path onto a base directory, collapsing `.`/`..`. Only
 * prevented from escaping the filesystem/drive root itself — a `..`-heavy
 * relative entry can still walk above `base` onto a sibling directory. Not a
 * containment boundary: an absolute entry already bypasses `base` entirely
 * (see `resolveCustomCss`), so this only needs to avoid throwing/producing a
 * malformed path, not enforce workspace confinement.
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

/**
 * Resolve `markdownDualPreview.customCss` entries to absolute, deduped
 * filesystem paths. Only `.css` paths are accepted — a remote URL, a
 * non-`.css` file, or a relative entry with no open workspace folder is
 * rejected rather than silently dropped, so the caller can warn once.
 *
 * Dedup compares case-insensitively on `win32`/`darwin` (same rule as
 * `util/docKey.ts`), so `C:/Theme.css` and `c:/theme.css` are recognized as
 * the same file instead of being loaded twice. `platform` is injectable
 * purely for testing both branches; callers should use the default.
 */
export function resolveCustomCss(
  configured: readonly unknown[],
  workspaceRoot?: string,
  platform: NodeJS.Platform = process.platform
): ResolvedCustomCss {
  const caseInsensitive = CASE_INSENSITIVE_PLATFORMS.has(platform);
  const seen = new Set<string>();
  const paths: string[] = [];
  const rejected: string[] = [];

  for (const entry of configured) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      continue;
    }

    if (!isCssPath(entry)) {
      rejected.push(entry);
      continue;
    }

    const schemeMatch = SCHEME_PATTERN.exec(entry);
    if (schemeMatch && schemeMatch[1].length > 1) {
      // A real URI scheme (http, https, ...), not a Windows drive letter.
      rejected.push(entry);
      continue;
    }

    const normalized = entry.replace(/\\/g, '/');
    let resolved: string;
    if (DRIVE_LETTER_PATTERN.test(normalized) || normalized.startsWith('/')) {
      resolved = normalized;
    } else if (workspaceRoot) {
      resolved = joinAndNormalize(workspaceRoot, normalized);
    } else {
      rejected.push(entry);
      continue;
    }

    const dedupeKey = caseInsensitive ? resolved.toLowerCase() : resolved;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      paths.push(resolved);
    }
  }

  return { paths, rejected };
}

/** Human-readable shape of `vscode.WorkspaceConfiguration`, kept dependency-free for testing. */
export interface CustomCssConfig {
  get<T>(key: string, defaultValue: T): T;
}

/** Resolves `customCss` straight from a `WorkspaceConfiguration`, shared by the preview and export paths. */
export function resolveCustomCssFromConfig(config: CustomCssConfig, workspaceRoot?: string): ResolvedCustomCss {
  const configured = config.get<unknown[]>('customCss', []);
  return resolveCustomCss(Array.isArray(configured) ? configured : [], workspaceRoot);
}

/** One consistent warning message for a resolved set's rejected entries, shared by every caller. */
export function formatCustomCssWarning(rejected: readonly string[]): string {
  return `Markdown Dual Preview: ignoring invalid customCss entr${rejected.length === 1 ? 'y' : 'ies'} (must be a local .css path): ${rejected.join(', ')}`;
}

/**
 * Read and concatenate every resolved custom CSS file, in order. Shared by
 * the live preview (`PreviewManager`) and `exportHtml` so both stay in sync.
 * A missing, unreadable, or oversized file is skipped, never fatal — the
 * feature degrades to "no custom styling" rather than breaking the preview.
 */
export async function loadCustomCss(resolved: ResolvedCustomCss): Promise<string> {
  const chunks: string[] = [];
  for (const path of resolved.paths) {
    try {
      const uri = vscode.Uri.file(path);
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_CUSTOM_CSS_BYTES) {
        continue;
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      chunks.push(Buffer.from(bytes).toString('utf8'));
    } catch {
      // Missing or unreadable — skip, rest of the list still loads.
    }
  }
  return chunks.join('\n');
}
