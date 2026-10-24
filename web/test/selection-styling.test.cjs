const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('inline code and code-block text use the configured selection highlight', () => {
  assert.match(indexHtml, /\.cm-editor \.cm-content \.cm-inline-code::selection/);
  assert.match(indexHtml, /\.cm-editor \.cm-content \.cm-inline-code \*::selection/);
  assert.match(indexHtml, /\.cm-editor \.cm-content \.cm-codeblock-line::selection/);
  assert.match(indexHtml, /\.cm-editor \.cm-content \.cm-codeblock-line \*::selection/);
  assert.match(indexHtml, /background-color: var\(--selection-highlight-bg,/);
  assert.match(indexHtml, /color: var\(--selection-highlight-text,/);
});
