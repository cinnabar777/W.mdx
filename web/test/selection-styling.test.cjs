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

test('main text selection avoids CodeMirror full-line fill and keeps code surfaces styled', () => {
  assert.match(
    indexHtml,
    /\.cm-editor \.cm-selectionLayer \.cm-selectionBackground\s*\{\s*background-color:\s*transparent !important;/
  );
  assert.match(indexHtml, /\.cm-editor \.cm-content \.cm-line::selection/);
  assert.match(
    indexHtml,
    /\.cm-content \.cm-inline-code\s*\{[^}]*background:\s*var\(--code-bg-color/
  );
  assert.match(
    indexHtml,
    /\.cm-content \.cm-codeblock-line\s*\{[^}]*background:\s*var\(--code-block-bg-color/
  );
});
