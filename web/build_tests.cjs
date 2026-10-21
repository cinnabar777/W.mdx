const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const webDir = __dirname;
const distDir = path.join(webDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });

console.log('Bundling test files with esbuild...');

for (const [source, output] of [
  ['rendered_navigation.spec.cjs', 'rendered_navigation.test.cjs'],
  ['navigation_capture.spec.cjs', 'navigation_capture.test.cjs'],
  ['rendered_mode_refresh.spec.cjs', 'rendered_mode_refresh.test.cjs']
]) {
  esbuild.buildSync({
    entryPoints: [path.join(webDir, 'test_sources', source)],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: ['jsdom', 'node:*'],
    outfile: path.join(distDir, output)
  });
}

console.log('Test bundling complete!');
