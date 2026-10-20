const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const webDir = __dirname;
const distDir = path.join(webDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });

console.log('Bundling test files with esbuild...');

esbuild.buildSync({
  entryPoints: [path.join(webDir, 'test_sources/rendered_navigation.spec.cjs')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['jsdom', 'node:*'],
  outfile: path.join(distDir, 'rendered_navigation.test.cjs')
});

console.log('Test bundling complete!');
