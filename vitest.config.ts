import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Webview DOM code and pure type declarations are exercised by manual /
      // integration testing, not unit tests.
      exclude: ['src/webview/**', 'src/shared/messages.ts', 'src/extension.ts']
    }
  },
  resolve: {
    alias: {
      // Unit tests run outside the extension host, where the `vscode` module
      // does not exist. Redirect imports to a hand-rolled stub.
      vscode: path.resolve(__dirname, 'test/mocks/vscode.ts')
    }
  }
});
