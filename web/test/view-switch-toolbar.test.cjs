const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('TOC gesture teardown does not abort editor view switching', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.doesNotMatch(
    source,
    /\bisSwiping\s*=/,
    'TOC teardown must not assign undeclared swipe state while destroying the editor'
  );
});
