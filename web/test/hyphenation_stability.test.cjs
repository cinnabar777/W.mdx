const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('touch selection does not override configured automatic hyphenation', () => {
  const editorSource = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
  const editorStyles = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

  assert.doesNotMatch(editorSource, /hyphenSelectionWorkaround|installHyphenSelectionWorkaround/);
  assert.doesNotMatch(editorStyles, /cm-android-selection-no-auto-hyphens/);
  assert.match(editorSource, /--paragraph-hyphens/);
});
