import { describe, expect, it } from 'vitest';
import { classifyResource } from '../../src/markdown/resourcePath';

const ctx = { documentDir: '/home/user/project/docs', workspaceRoot: '/home/user/project' };
const ctxNoWorkspace = { documentDir: '/home/user/project/docs' };

describe('classifyResource', () => {
  it('treats https URLs as external', () => {
    expect(classifyResource('https://example.com/x.png', ctx)).toEqual({ kind: 'external' });
  });

  it('treats http URLs as external', () => {
    expect(classifyResource('http://example.com/x.png', ctx)).toEqual({ kind: 'external' });
  });

  it('treats data URIs as external', () => {
    expect(classifyResource('data:image/png;base64,abc', ctx)).toEqual({ kind: 'external' });
  });

  it('treats protocol-relative URLs as external', () => {
    expect(classifyResource('//cdn.example/x.png', ctx)).toEqual({ kind: 'external' });
  });

  it('treats vscode-webview URIs as external', () => {
    expect(classifyResource('vscode-webview://abc/x.png', ctx)).toEqual({ kind: 'external' });
  });

  it('treats vscode-resource URIs as external', () => {
    expect(classifyResource('vscode-resource:/abc/x.png', ctx)).toEqual({ kind: 'external' });
  });

  it('treats file URIs as external (stripped by sanitizer scheme allowlist)', () => {
    expect(classifyResource('file:///etc/passwd', ctx)).toEqual({ kind: 'external' });
  });

  it('treats mailto as external', () => {
    expect(classifyResource('mailto:a@b.com', ctx)).toEqual({ kind: 'external' });
  });

  it('treats javascript: as external', () => {
    expect(classifyResource('javascript:alert(1)', ctx)).toEqual({ kind: 'external' });
  });

  it('treats empty string as external', () => {
    expect(classifyResource('', ctx)).toEqual({ kind: 'external' });
  });

  it('treats whitespace-only string as external', () => {
    expect(classifyResource('   ', ctx)).toEqual({ kind: 'external' });
  });

  it('treats a bare anchor as external', () => {
    expect(classifyResource('#anchor', ctx)).toEqual({ kind: 'external' });
  });

  it('resolves a root-relative path against workspaceRoot', () => {
    expect(classifyResource('/docs/x.png', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/x.png'
    });
  });

  it('treats a root-relative path as external when workspaceRoot is absent', () => {
    expect(classifyResource('/docs/x.png', ctxNoWorkspace)).toEqual({ kind: 'external' });
  });

  it('resolves ./x.png against documentDir', () => {
    expect(classifyResource('./x.png', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/x.png'
    });
  });

  it('resolves a bare relative filename against documentDir', () => {
    expect(classifyResource('x.png', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/x.png'
    });
  });

  it('resolves ../x.png against documentDir', () => {
    expect(classifyResource('../x.png', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/x.png'
    });
  });

  it('resolves a nested relative path', () => {
    expect(classifyResource('sub/x.png', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/sub/x.png'
    });
  });

  it('strips a query string before resolving', () => {
    expect(classifyResource('x.png?raw=1', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/x.png'
    });
  });

  it('strips a fragment before resolving', () => {
    expect(classifyResource('x.png#frag', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/x.png'
    });
  });

  it('percent-decodes the path', () => {
    expect(classifyResource('my%20shot.png', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/my shot.png'
    });
  });

  it('falls back to the raw string when percent-decoding fails', () => {
    expect(classifyResource('%E0%A4%A', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/%E0%A4%A'
    });
  });

  it('treats a Windows-drive absolute path as local', () => {
    expect(classifyResource('C:/x.png', ctx)).toEqual({ kind: 'local', path: 'C:/x.png' });
  });

  it('treats a POSIX absolute path as external when workspaceRoot is absent (indistinguishable from a root-relative reference)', () => {
    expect(classifyResource('/etc/passwd', ctxNoWorkspace)).toEqual({ kind: 'external' });
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(classifyResource('.\\sub\\x.png', ctx)).toEqual({
      kind: 'local',
      path: '/home/user/project/docs/sub/x.png'
    });
  });

  it('does not allow .. to escape above the filesystem root', () => {
    const rootCtx = { documentDir: '/a', workspaceRoot: '/a' };
    expect(classifyResource('../../../../x.png', rootCtx)).toEqual({
      kind: 'local',
      path: '/x.png'
    });
  });

  it('treats a bare query string with nothing before it as external', () => {
    expect(classifyResource('?raw=1', ctx)).toEqual({ kind: 'external' });
  });

  it('never throws on malformed input', () => {
    expect(() => classifyResource('%%%', ctx)).not.toThrow();
    expect(() => classifyResource('::::', ctx)).not.toThrow();
  });
});
