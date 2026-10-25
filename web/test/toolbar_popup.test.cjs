const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('menu retains its Settings action and the popup can scroll to the last item', () => {
  assert.match(
    source,
    /title: 'Settings', action: \(\) => window\.AndroidNative && window\.AndroidNative\.onNativeAction\('settings'\)/
  );
  assert.match(html, /\.popup-toolbar-strip\s*\{[^}]*overflow-x:\s*auto\s*!important/s);
  assert.match(html, /\.popup-toolbar-strip\s*\{[^}]*max-width:\s*calc\(100vw - 16px\)/s);
  assert.match(html, /\.popup-strip-btn\s*\{[^}]*flex:\s*0 0 auto\s*!important/s);
});
