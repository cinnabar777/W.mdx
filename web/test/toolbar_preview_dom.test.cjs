const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

test('toolbar settings preview renders keys, opens group popups, and supports tray double-tap icon editing', async () => {
  const htmlPath = path.resolve(__dirname, '../toolbar-settings-preview.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, { url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html' });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const edits = [];
  const settings = {
    version: 1,
    order: ['undo', 'lists', 'format', 'table', 'insert', 'menu'],
    hidden: ['heading'],
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
      ['undo', 'lists', 'format', 'table', 'insert', 'menu']
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
      .querySelector('#toolbar-preview [data-toolbar-key="menu"]')
      .click();
    const popup = dom.window.document.querySelector('#toolbar-preview-popup');
    assert.equal(popup.classList.contains('hidden'), false);
    assert.deepEqual(
      [...popup.querySelectorAll('[data-preview-popup-item]')].map(button => button.title),
      [
        'New File',
        'Open File',
        'Save File',
        'Save As',
        'Save as Text Pack',
        'Export HTML / MHTML',
        'Find & Replace',
        'Switch View Mode',
        'New Window',
        'Settings'
      ]
    );
    assert.equal(
      dom.window.document
        .querySelector('#toolbar-preview [data-toolbar-key="menu"]')
        .getAttribute('aria-expanded'),
      'true'
    );
    popup.querySelector('[data-preview-popup-item="saveFile"]').click();
    assert.equal(
      popup.querySelector('[data-preview-popup-item="saveFile"]').getAttribute('aria-pressed'),
      'true'
    );
    dom.window.document
      .querySelector('#toolbar-preview [data-toolbar-key="menu"]')
      .click();
    assert.equal(popup.classList.contains('hidden'), true);

    for (const groupKey of ['lists', 'format', 'table', 'insert']) {
      dom.window.document
        .querySelector(`#toolbar-preview [data-toolbar-key="${groupKey}"]`)
        .click();
      assert.equal(popup.classList.contains('hidden'), false, `${groupKey} popup should open`);
      assert.ok(
        popup.querySelectorAll('[data-preview-popup-item]').length > 0,
        `${groupKey} popup should contain its actions`
      );
      dom.window.document
        .querySelector(`#toolbar-preview [data-toolbar-key="${groupKey}"]`)
        .click();
      assert.equal(popup.classList.contains('hidden'), true, `${groupKey} popup should close`);
    }

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
