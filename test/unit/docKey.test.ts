import { describe, expect, it } from 'vitest';
import { docKey } from '../../src/util/docKey';

function fileUri(fsPath: string) {
  return { scheme: 'file', fsPath, toString: () => `file://${fsPath}` };
}

describe('docKey', () => {
  it('folds case and drive-letter casing on Windows', () => {
    const a = docKey(fileUri('C:\\Docs\\Readme.md'), 'win32');
    const b = docKey(fileUri('c:/docs/readme.md'), 'win32');
    expect(a).toBe(b);
    expect(a).toBe('file:c:/docs/readme.md');
  });

  it('folds case on macOS', () => {
    const a = docKey(fileUri('/Users/x/Notes.md'), 'darwin');
    const b = docKey(fileUri('/users/x/notes.md'), 'darwin');
    expect(a).toBe(b);
  });

  it('preserves case on Linux so distinct files stay distinct', () => {
    const a = docKey(fileUri('/home/x/Readme.md'), 'linux');
    const b = docKey(fileUri('/home/x/readme.md'), 'linux');
    expect(a).not.toBe(b);
    expect(a).toBe('file:/home/x/Readme.md');
  });

  it('normalizes separators regardless of platform', () => {
    expect(docKey(fileUri('C:\\a\\b.md'), 'win32')).toBe('file:c:/a/b.md');
  });

  it('distinguishes different files on the same platform', () => {
    expect(docKey(fileUri('C:\\a.md'), 'win32')).not.toBe(docKey(fileUri('C:\\b.md'), 'win32'));
  });

  it('keeps non-file schemes verbatim via toString', () => {
    const key = docKey(
      { scheme: 'untitled', fsPath: 'Untitled-1', toString: () => 'untitled:Untitled-1' },
      'linux'
    );
    expect(key).toBe('untitled:Untitled-1');
  });
});
