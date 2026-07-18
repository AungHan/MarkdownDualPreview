import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

/** Entry point invoked by @vscode/test-electron inside the extension host. */
export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30000 });
  const testsRoot = __dirname;

  return new Promise((resolve, reject) => {
    const files = fs.readdirSync(testsRoot).filter((f) => f.endsWith('.test.js'));
    for (const file of files) {
      mocha.addFile(path.join(testsRoot, file));
    }
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} integration test(s) failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
