import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  // The repo root, passed to VS Code as the extension under development.
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  // Compiled mocha entry point (see suite/index.ts).
  const extensionTestsPath = path.resolve(__dirname, './suite/index');

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-extensions']
  });
}

main().catch((err) => {
  console.error('Failed to run integration tests:', err);
  process.exit(1);
});
