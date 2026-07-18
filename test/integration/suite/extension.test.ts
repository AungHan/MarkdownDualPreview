import * as assert from 'assert';
import * as vscode from 'vscode';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** All open tabs whose input is one of our preview webviews. */
function previewTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        tab.input.viewType.includes('markdownDualPreview')
    );
}

async function openMarkdown(content: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content });
  await vscode.window.showTextDocument(doc, { preview: false });
  await vscode.commands.executeCommand('markdownDualPreview.open');
  await delay(250);
}

async function closeAllPreviews(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await delay(250);
}

suite('Markdown Dual Preview', () => {
  test('registers the open command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('markdownDualPreview.open'), 'command should be registered');
  });

  test('opens up to the configured cap and blocks beyond it', async () => {
    await closeAllPreviews();

    const cap = vscode.workspace
      .getConfiguration('markdownDualPreview')
      .get<number>('maxPreviews', 2);

    for (let i = 0; i <= cap; i++) {
      await openMarkdown(`# Doc ${i}\n\nContent ${i}.`);
    }

    assert.strictEqual(previewTabs().length, cap, `should cap at ${cap} preview panels`);
    await closeAllPreviews();
  });

  test('reopening the same document does not create a second preview', async () => {
    await closeAllPreviews();

    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: '# Only\n\nSingle document.'
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand('markdownDualPreview.open');
    await delay(250);
    await vscode.commands.executeCommand('markdownDualPreview.open');
    await delay(250);

    assert.strictEqual(previewTabs().length, 1, 'reopening should reveal, not duplicate');
    await closeAllPreviews();
  });
});
