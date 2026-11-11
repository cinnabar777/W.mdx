const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(fullPath)
      : /\.(?:js|mjs)$/.test(entry.name)
        ? [fullPath]
        : [];
  });
}

test('every statically referenced toolbar icon exists so titles never replace missing icons', async () => {
  const { svgIcons } = await import('../src/toolbarIcons.js');
  const sourceRoot = path.resolve(__dirname, '../src');
  const references = new Set();

  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bsvgIcons\.([A-Za-z_$][\w$]*)/g)) {
      references.add(match[1]);
    }
  }

  const missing = [...references].filter(name => !svgIcons[name]);
  assert.deepEqual(missing, []);
});
