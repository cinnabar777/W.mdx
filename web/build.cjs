const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function build() {
  const rootDir = path.resolve(__dirname, '../');
  const webDir = path.resolve(rootDir, 'web');
  const outDir = path.resolve(rootDir, 'app/src/main/assets/www');

  fs.mkdirSync(outDir, { recursive: true });

  console.log('Building web bundle with esbuild...');

  await esbuild.build({
    entryPoints: [path.join(webDir, 'src/main.js')],
    bundle: true,
    outfile: path.join(outDir, 'bundle.js'),
    format: 'iife',
    target: ['es2020', 'chrome80'],
    loader: {
      '.css': 'css',
      '.svg': 'text',
      '.woff': 'dataurl',
      '.woff2': 'dataurl'
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    minify: false,
    sourcemap: false
  });

  // Copy index.html into www directory and reference bundle.js
  let htmlContent = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
  if (!htmlContent.includes('bundle.css')) {
    htmlContent = htmlContent.replace('</head>', '  <link rel="stylesheet" href="./bundle.css">\n</head>');
  }
  htmlContent = htmlContent.replace('./src/main.js', './bundle.js');
  fs.writeFileSync(path.join(outDir, 'index.html'), htmlContent);

  console.log('Web bundle build complete! Assets written to:', outDir);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
