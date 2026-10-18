const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');

test('main.js exists and compiles without errors', () => {
  assert.ok(source.length > 0);
  assert.ok(source.includes('window.editorBridge'));
});

test('editorBridge exposes required methods', () => {
  assert.ok(source.includes('getMarkdown'));
  assert.ok(source.includes('setMarkdown'));
  assert.ok(source.includes('setEditorMode'));
  assert.ok(source.includes('getEditorMode'));
  assert.ok(source.includes('toggleLineWrap'));
  assert.ok(source.includes('toggleLineNumbers'));
});
