import { beforeEach, describe, expect, it } from 'vitest';
import { loadCustomCss, resolveCustomCss } from '../../src/preview/customCss';
import { __test, Uri, workspace } from '../mocks/vscode';

beforeEach(() => __test.reset());

describe('resolveCustomCss', () => {
  it('passes through a Windows drive-letter absolute path', () => {
    const result = resolveCustomCss(['C:/themes/x.css']);
    expect(result.paths).toEqual(['C:/themes/x.css']);
    expect(result.rejected).toEqual([]);
  });

  it('passes through a POSIX absolute path', () => {
    const result = resolveCustomCss(['/home/user/x.css']);
    expect(result.paths).toEqual(['/home/user/x.css']);
  });

  it('resolves a relative path against workspaceRoot', () => {
    const result = resolveCustomCss(['./theme.css'], 'C:/project');
    expect(result.paths).toEqual(['C:/project/theme.css']);
  });

  it('resolves a bare relative path (no leading ./) against workspaceRoot', () => {
    const result = resolveCustomCss(['theme.css'], 'C:/project');
    expect(result.paths).toEqual(['C:/project/theme.css']);
  });

  it('does not let .. escape above the workspace root', () => {
    const result = resolveCustomCss(['../../etc/theme.css'], 'C:/project');
    expect(result.paths).toEqual(['C:/etc/theme.css']);
  });

  it('normalizes backslash separators', () => {
    const result = resolveCustomCss(['sub\\theme.css'], 'C:/project');
    expect(result.paths).toEqual(['C:/project/sub/theme.css']);
  });

  it('rejects a non-.css path', () => {
    const result = resolveCustomCss(['C:/themes/x.txt']);
    expect(result.paths).toEqual([]);
    expect(result.rejected).toEqual(['C:/themes/x.txt']);
  });

  it('rejects a remote https url', () => {
    const result = resolveCustomCss(['https://cdn.example.com/theme.css']);
    expect(result.paths).toEqual([]);
    expect(result.rejected).toEqual(['https://cdn.example.com/theme.css']);
  });

  it('rejects a relative entry when no workspaceRoot is open', () => {
    const result = resolveCustomCss(['./theme.css']);
    expect(result.paths).toEqual([]);
    expect(result.rejected).toEqual(['./theme.css']);
  });

  it('ignores non-string array entries', () => {
    const result = resolveCustomCss(['C:/a.css', 42, null, {}] as unknown[]);
    expect(result.paths).toEqual(['C:/a.css']);
    expect(result.rejected).toEqual([]);
  });

  it('dedupes duplicate paths, preserving first-seen order', () => {
    const result = resolveCustomCss(['C:/a.css', 'C:/b.css', 'C:/a.css']);
    expect(result.paths).toEqual(['C:/a.css', 'C:/b.css']);
  });

  it('returns empty paths and rejected for an empty array', () => {
    const result = resolveCustomCss([]);
    expect(result.paths).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('is case-insensitive on the .css extension', () => {
    const result = resolveCustomCss(['C:/themes/X.CSS']);
    expect(result.paths).toEqual(['C:/themes/X.CSS']);
  });

  it('dedupes case-insensitively on win32/darwin (same file, different case)', () => {
    const result = resolveCustomCss(['C:/Theme.css', 'c:/theme.css'], undefined, 'win32');
    expect(result.paths).toEqual(['C:/Theme.css']);
  });

  it('does not dedupe differing case on a case-sensitive platform (linux)', () => {
    const result = resolveCustomCss(['/a/Theme.css', '/a/theme.css'], undefined, 'linux');
    expect(result.paths).toEqual(['/a/Theme.css', '/a/theme.css']);
  });
});

describe('loadCustomCss', () => {
  it('concatenates files in order', async () => {
    workspace.fsFiles.set(Uri.file('C:/a.css').toString(), new TextEncoder().encode('.a{}'));
    workspace.fsFiles.set(Uri.file('C:/b.css').toString(), new TextEncoder().encode('.b{}'));
    const css = await loadCustomCss({ paths: ['C:/a.css', 'C:/b.css'], rejected: [] });
    expect(css.indexOf('.a{}')).toBeLessThan(css.indexOf('.b{}'));
  });

  it('skips a file over the 1 MB cap', async () => {
    workspace.fsFiles.set(Uri.file('C:/big.css').toString(), new TextEncoder().encode('.big{}'));
    workspace.fsFileSizeOverrides.set(Uri.file('C:/big.css').toString(), 2 * 1024 * 1024);
    const css = await loadCustomCss({ paths: ['C:/big.css'], rejected: [] });
    expect(css).not.toContain('.big{}');
  });

  it('skips a missing or unreadable file and still loads the rest', async () => {
    workspace.fsFiles.set(Uri.file('C:/ok.css').toString(), new TextEncoder().encode('.ok{}'));
    const css = await loadCustomCss({ paths: ['C:/missing.css', 'C:/ok.css'], rejected: [] });
    expect(css).toContain('.ok{}');
  });

  it('returns empty string without touching the filesystem for empty input', async () => {
    const css = await loadCustomCss({ paths: [], rejected: [] });
    expect(css).toBe('');
  });
});
