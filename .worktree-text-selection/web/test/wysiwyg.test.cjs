const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJsPath = path.join(__dirname, '../src/main.js');
const source = fs.readFileSync(mainJsPath, 'utf8');

test('Source mode supports roundtrip fidelity', () => {
  assert.ok(source.includes("currentEditorMode === 'source'"));
  assert.ok(source.includes('Decoration.none'));
});

test('WYSIWYG mode hides syntax and displays widgets', () => {
  assert.ok(source.includes("currentEditorMode === 'wysiwyg'"));
  assert.ok(source.includes('CheckboxWidget'));
});
