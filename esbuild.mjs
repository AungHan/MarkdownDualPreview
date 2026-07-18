import { build, context } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info'
};

/** @type {import('esbuild').BuildOptions} */
const hostConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  // vscode is provided by the runtime; markdown-it/highlight.js are bundled in.
  external: ['vscode']
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  ...common,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022'
};

async function run() {
  if (watch) {
    const hostCtx = await context(hostConfig);
    const webviewCtx = await context(webviewConfig);
    await Promise.all([hostCtx.watch(), webviewCtx.watch()]);
    console.log('[esbuild] watching...');
  } else {
    await Promise.all([build(hostConfig), build(webviewConfig)]);
    console.log('[esbuild] build complete');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
