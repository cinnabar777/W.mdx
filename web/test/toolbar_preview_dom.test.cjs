const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

test('toolbar settings preview renders selectable keys and opens the SVG editor on a tray double tap', async () => {
  const htmlPath = path.resolve(__dirname, '../toolbar-settings-preview.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, { url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html' });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const edits = [];
  const settings = {
    version: 1,
    order: ['undo', 'menu'],
    hidden: ['heading', 'lists', 'format', 'table', 'insert'],
    styles: {}
  };

  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify(settings),
      pref_toolbar_height: 48,
      pref_toolbar_padding: 4,
      pref_app_theme: 'amoled'
    }),
    saveBottomToolbarConfig: () => true,
    pickBottomToolbarColor: () => {},
    editBottomToolbarIcon: id => edits.push(id)
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?preview-test=${Date.now()}`);

    assert.deepEqual(
      [...dom.window.document.querySelectorAll('#toolbar-preview [data-toolbar-key]')]
        .map(button => button.dataset.toolbarKey),
      ['undo', 'menu']
    );
    const visibleKey = dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="undo"]');
    visibleKey.click();
    assert.equal(
      dom.window.document
        .querySelector('#toolbar-preview [data-toolbar-key="undo"]')
        .classList.contains('is-selected'),
      true
    );

    dom.window.document
      .querySelector('#toolbar-holding-tray [data-toolbar-key="heading"]')
      .click();
    dom.window.document
      .querySelector('#toolbar-holding-tray [data-toolbar-key="heading"]')
      .click();
    assert.deepEqual(edits, ['heading']);
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});
