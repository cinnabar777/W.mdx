const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('list-item spacing is included in the CodeMirror line box', () => {
  const match = html.match(/\.cm-content\s+\.cm-list-item\s*\{([\s\S]*?)\}/);
  assert.ok(match, 'the .cm-content .cm-list-item rule must exist');
  const rule = match[1];
  assert.match(rule, /margin-bottom:\s*0\s*!important\s*;/);
  assert.match(rule, /padding-bottom:\s*var\(--list-item-spacing,\s*4px\)\s*!important\s*;/);
  assert.match(rule, /box-sizing:\s*border-box\s*!important\s*;/);
  assert.doesNotMatch(rule, /margin-bottom:\s*var\(--list-item-spacing/);
});
