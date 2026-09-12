import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

interface MenuEntry {
  readonly command: string;
  readonly when?: string;
  readonly group?: string;
}

interface KeybindingEntry {
  readonly command: string;
  readonly key: string;
  readonly mac?: string;
  readonly when?: string;
}

interface CommandEntry {
  readonly command: string;
  readonly icon?: string;
}

const commands = packageJson.contributes.commands as readonly CommandEntry[];
const menus = packageJson.contributes.menus as Record<string, readonly MenuEntry[]>;
const keybindings = (packageJson.contributes as { keybindings?: readonly KeybindingEntry[] })
  .keybindings;

function findCommand(id: string): CommandEntry {
  const found = commands.find((c) => c.command === id);
  if (!found) throw new Error(`command ${id} not found`);
  return found;
}

function findMenuEntry(menu: string, id: string): MenuEntry {
  const found = (menus[menu] ?? []).find((e) => e.command === id);
  if (!found) throw new Error(`menu entry ${id} not found in ${menu}`);
  return found;
}

describe('package.json manifest', () => {
  it('declares icons on both commands', () => {
    expect(findCommand('markdownDualPreview.open').icon).toBe('$(open-preview)');
    expect(findCommand('markdownDualPreview.exportHtml').icon).toBe('$(export)');
  });

  it('orders both commands in editor/title, markdown-only', () => {
    const open = findMenuEntry('editor/title', 'markdownDualPreview.open');
    const exportEntry = findMenuEntry('editor/title', 'markdownDualPreview.exportHtml');
    expect(open.when).toBe('editorLangId == markdown');
    expect(open.group).toBe('navigation@1');
    expect(exportEntry.when).toBe('editorLangId == markdown');
    expect(exportEntry.group).toBe('navigation@2');
  });

  it('adds Open Dual Preview to editor/context, markdown-only, after built-in nav items', () => {
    const entry = findMenuEntry('editor/context', 'markdownDualPreview.open');
    expect(entry.when).toBe('editorLangId == markdown');
    expect(entry.group).toBe('navigation@30');
  });

  it('binds Ctrl+K D / Cmd+K D to Open Dual Preview, scoped to a focused markdown editor', () => {
    expect(keybindings).toBeDefined();
    const binding = keybindings?.find((k) => k.command === 'markdownDualPreview.open');
    expect(binding?.key).toBe('ctrl+k d');
    expect(binding?.mac).toBe('cmd+k d');
    expect(binding?.when).toContain('editorTextFocus');
    expect(binding?.when).toContain('editorLangId == markdown');
  });

  it('binds Ctrl+K E / Cmd+K E to Export to HTML, scoped to a focused markdown editor', () => {
    const binding = keybindings?.find((k) => k.command === 'markdownDualPreview.exportHtml');
    expect(binding?.key).toBe('ctrl+k e');
    expect(binding?.mac).toBe('cmd+k e');
    expect(binding?.when).toContain('editorTextFocus');
    expect(binding?.when).toContain('editorLangId == markdown');
  });

  it('keeps commandPalette and explorer/context entries unchanged', () => {
    const paletteIds = (menus.commandPalette ?? []).map((e) => e.command);
    expect(paletteIds).toContain('markdownDualPreview.open');
    expect(paletteIds).toContain('markdownDualPreview.exportHtml');

    const explorerEntry = findMenuEntry('explorer/context', 'markdownDualPreview.open');
    expect(explorerEntry.when).toBe('resourceLangId == markdown');
    expect(explorerEntry.group).toBe('navigation@30');

    const explorerIds = (menus['explorer/context'] ?? []).map((e) => e.command);
    expect(explorerIds).not.toContain('markdownDualPreview.exportHtml');
  });
});
