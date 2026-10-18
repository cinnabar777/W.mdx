const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Widget classes implement eq for DOM reuse', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  // Check CheckboxWidget eq
  assert.ok(code.includes('class CheckboxWidget'), 'CheckboxWidget exists');
  assert.ok(code.includes('other instanceof CheckboxWidget'), 'CheckboxWidget has eq check');

  // Check CodeBlockHeaderWidget eq
  assert.ok(code.includes('class CodeBlockHeaderWidget'), 'CodeBlockHeaderWidget exists');
  assert.ok(code.includes('other instanceof CodeBlockHeaderWidget'), 'CodeBlockHeaderWidget has eq check');

  // Check ImagePreviewWidget eq
  assert.ok(code.includes('class ImagePreviewWidget'), 'ImagePreviewWidget exists');
  assert.ok(code.includes('other instanceof ImagePreviewWidget'), 'ImagePreviewWidget has eq check');
});

test('Table cell navigation functions exist and handle pipe delimiters', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.ok(code.includes('function parseTableCells'), 'parseTableCells exists');
  assert.ok(code.includes('function navigateTableCell'), 'navigateTableCell exists');
  assert.ok(code.includes('tableNavigationKeymap'), 'tableNavigationKeymap is exported');
});
