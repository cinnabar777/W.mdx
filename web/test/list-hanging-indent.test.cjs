const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('List hanging indentation CSS rules and layout structure', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  // Verify flex styling on .cm-content .cm-line.cm-list-item without any body.list-wrap-under-text selector
  assert.ok(
    indexHtml.includes('.cm-content .cm-line.cm-list-item {'),
    'List item line must have a styling rule'
  );
  assert.ok(
    !indexHtml.includes('list-wrap-under-text'),
    'Old list-wrap-under-text class must be completely removed from index.html'
  );
  assert.ok(
    indexHtml.includes('display: flex !important;'),
    'List item must use flex layout for hanging marker'
  );
  assert.ok(
    indexHtml.includes('.cm-content .cm-line.cm-list-item > .cm-list-block-text'),
    'List item text block must be styled as a flex child'
  );
  assert.ok(
    indexHtml.includes('white-space: pre-wrap !important;'),
    'Text block must wrap text'
  );
});
