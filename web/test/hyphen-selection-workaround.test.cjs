const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('Android WYSIWYG editing suppresses automatic hyphenation for stable selection handles', async () => {
  const { installHyphenSelectionWorkaround } =
    await import('../src/hyphenSelectionWorkaround.js');
  const dom = new JSDOM('<div class="cm-editor"><div class="cm-content"></div></div>');
  Object.defineProperty(dom.window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/147.0 Mobile'
  });

  const editor = dom.window.document.querySelector('.cm-editor');
  const workaround = installHyphenSelectionWorkaround({ dom: editor });
  assert.ok(workaround);
  assert.equal(editor.classList.contains('cm-android-no-auto-hyphens'), true);

  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  assert.match(
    html,
    /\.cm-editor\.cm-android-no-auto-hyphens[\s\S]*?hyphens:\s*none\s*!important/
  );

  workaround.destroy();
  assert.equal(editor.classList.contains('cm-android-no-auto-hyphens'), false);
  dom.window.close();
});

test('the Android-only hyphenation workaround preserves existing classes and stays disabled elsewhere', async () => {
  const { installHyphenSelectionWorkaround } =
    await import('../src/hyphenSelectionWorkaround.js');
  const desktop = new JSDOM('<div class="cm-editor"></div>');
  Object.defineProperty(desktop.window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0)'
  });
  assert.equal(
    installHyphenSelectionWorkaround({
      dom: desktop.window.document.querySelector('.cm-editor')
    }),
    null
  );
  desktop.window.close();

  const dom = new JSDOM('<div class="cm-editor cm-android-no-auto-hyphens"></div>');
  Object.defineProperty(dom.window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Linux; Android 16) Chrome/147.0 Mobile'
  });
  const editor = dom.window.document.querySelector('.cm-editor');
  const workaround = installHyphenSelectionWorkaround({ dom: editor });
  assert.ok(workaround);
  workaround.destroy();
  assert.equal(editor.classList.contains('cm-android-no-auto-hyphens'), true);
  dom.window.close();
});
