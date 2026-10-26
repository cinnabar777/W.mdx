const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

test('toolbar settings preview opens a dismissible icon picker popup above spacious key settings', async () => {
  const htmlPath = path.resolve(__dirname, '../toolbar-settings-preview.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, { url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html' });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const edits = [];
  const collapseCalls = [];
  const colorPicks = [];
  const saves = [];
  const settings = {
    version: 1,
    order: ['undo', 'lists', 'format', 'table', 'insert', 'menu'],
    hidden: ['heading'],
    styles: {
      saveFile: {
        iconColor: '#00ff00',
        backgroundColor: '#22000000'
      }
    }
  };

  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify(settings),
      pref_toolbar_height: 48,
      pref_toolbar_padding: 4,
      pref_app_theme: 'amoled'
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    },
    pickBottomToolbarColor: (id, property) => colorPicks.push([id, property]),
    editBottomToolbarIcon: id => edits.push(id),
    collapseToolbarAppearance: () => collapseCalls.push(true)
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
    assert.equal(collapseCalls.length, 1);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').classList.contains('visible'),
      true
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').classList.contains('above-group'),
      false
    );
    assert.equal(
      dom.window.document
        .querySelector('#toolbar-preview [data-toolbar-key="undo"]')
        .classList.contains('is-selected'),
      false
    );
    assert.equal(
      dom.window.document
        .querySelector('#toolbar-preview [data-toolbar-key="undo"]')
        .classList.contains('active'),
      true,
      'the tapped toolbar key stays active while its settings are open'
    );

    dom.window.document
      .querySelector('#toolbar-preview [data-toolbar-key="menu"]')
      .click();
    const popup = dom.window.document.querySelector('#toolbar-preview-popup');
    assert.equal(popup.classList.contains('hidden'), false);
    assert.equal(
      dom.window.document
        .querySelector('#toolbar-preview [data-toolbar-key="menu"]')
        .classList.contains('active'),
      true
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').classList.contains('above-group'),
      true
    );
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
      popup.querySelector('[data-preview-popup-item="saveFile"]').getAttribute('aria-current'),
      'true'
    );
    assert.equal(
      popup.querySelector('[data-preview-popup-item="saveFile"]').classList.contains('active'),
      true
    );
    assert.equal(
      popup.querySelector('[data-preview-popup-item="saveFile"]').style
        .getPropertyValue('--toolbar-key-icon-color'),
      '#00ff00'
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-selected-title').textContent,
      'Save File'
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').classList.contains('visible'),
      true
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').classList.contains('above-group'),
      true
    );
    dom.window.document.querySelector('#toolbar-add-custom').click();
    assert.deepEqual(edits, ['saveFile']);
    dom.window.document.querySelector('#toolbar-icon-color').click();
    assert.deepEqual(colorPicks, [['saveFile', 'iconColor']]);
    const editor = dom.window.document.querySelector('#toolbar-preview-editor');
    const picker = dom.window.document.querySelector('#toolbar-icon-picker-modal');
    const pickerButton = dom.window.document.querySelector('#toolbar-open-icon-picker');
    assert.equal(picker.hidden, true, 'the icon picker starts out of the way');
    assert.equal(picker.parentElement, editor.parentElement, 'the picker is a separate popup, not editor content');
    assert.equal(pickerButton.parentElement, editor.querySelector('.toolbar-preview-editor-content'));
    assert.equal(dom.window.document.querySelector('#toolbar-current-key-preview'), null);
    assert.equal(dom.window.document.querySelector('#toolbar-current-icon'), null);
    assert.match(editor.textContent, /Action chip/);
    assert.match(editor.textContent, /Action icon/);
    pickerButton.click();
    assert.equal(picker.hidden, false, 'tapping the icon row opens a separate popup');
    assert.equal(picker.getAttribute('aria-hidden'), 'false');
    assert.ok(picker.querySelector('#toolbar-icon-search'));
    assert.ok(picker.querySelector('#toolbar-icon-list [role="option"]'));
    assert.equal(
      picker.querySelector('#toolbar-icon-search').parentElement,
      picker.querySelector('.toolbar-preview-icon-picker-dialog')
    );
    assert.equal(
      dom.window.document.querySelector('[data-reset-property="iconColor"]').disabled,
      false,
      'a reset icon is enabled when that color has an override'
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-reset-key-style').parentElement.className,
      'toolbar-preview-editor-header',
      'Reset all stays in the title row'
    );
    assert.equal(dom.window.document.querySelector('#toolbar-paste-svg').parentElement.className, 'toolbar-preview-icon-actions');
    assert.equal(dom.window.document.querySelector('#toolbar-choose-svg').parentElement.className, 'toolbar-preview-icon-actions');
    assert.equal(dom.window.document.querySelector('#toolbar-reset-key-colors'), null);
    assert.notEqual(
      dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="undo"]')
        .style.getPropertyValue('--toolbar-key-active-bg-color'),
      '',
      'the actual toolbar key uses its configured color for active-state preview'
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="undo"]')
        .style.getPropertyValue('--toolbar-key-active-bg-color'),
      'transparent',
      'an unconfigured key does not get a separate accent/tap color'
    );
    dom.window.document.querySelector('#toolbar-icon-picker-close').click();
    assert.equal(picker.hidden, true, 'the popup close control dismisses it');
    assert.equal(editor.classList.contains('visible'), true, 'closing the picker leaves key settings open');
    pickerButton.click();
    picker.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.equal(picker.hidden, true, 'tapping the popup backdrop dismisses it');
    assert.equal(editor.classList.contains('visible'), true, 'backdrop dismissal keeps key settings open');
    pickerButton.click();
    dom.window.document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    assert.equal(picker.hidden, true, 'Escape dismisses the icon popup');
    assert.equal(editor.classList.contains('visible'), true, 'Escape does not dismiss key settings');
    pickerButton.click();
    dom.window.document.querySelector('#toolbar-paste-svg').click();
    assert.deepEqual(JSON.parse(edits[1]), { itemId: 'saveFile', action: 'paste' });
    assert.equal(picker.hidden, true, 'starting Paste closes the picker popup');
    pickerButton.click();
    dom.window.document.querySelector('#toolbar-choose-svg').click();
    assert.deepEqual(JSON.parse(edits[2]), { itemId: 'saveFile', action: 'file' });
    pickerButton.click();
    const iconSearch = dom.window.document.querySelector('#toolbar-icon-search');
    iconSearch.value = 'bold';
    iconSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const boldChoice = dom.window.document.querySelector('#toolbar-icon-list [role="option"]');
    assert.equal(boldChoice.getAttribute('aria-label'), 'Bold');
    boldChoice.click();
    assert.equal(picker.hidden, true, 'choosing an icon dismisses the popup');
    assert.match(saves.at(-1).styles.saveFile.customSvg, /<svg/);
    dom.window.document
      .querySelector('[data-reset-property="iconColor"]')
      .click();
    assert.equal(saves.at(-1).styles.saveFile.iconColor, undefined);
    assert.equal(
      saves.at(-1).styles.saveFile.backgroundColor,
      '#22000000',
      'resetting one color leaves the other color alone'
    );
    dom.window.document
      .querySelector('[data-reset-property="backgroundColor"]')
      .click();
    assert.equal(saves.at(-1).styles.saveFile.backgroundColor, undefined);
    dom.window.document.querySelector('#toolbar-reset-key-style').click();
    assert.equal(saves.at(-1).styles.saveFile, undefined, 'Reset all clears the key style');
    assert.equal(
      dom.window.document.querySelector('[data-reset-property="iconColor"]').disabled,
      true,
      'per-color reset icons disable after the overrides are cleared'
    );
    dom.window.document
      .querySelector('#toolbar-preview [data-toolbar-key="menu"]')
      .click();
    assert.equal(popup.classList.contains('hidden'), true);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').classList.contains('above-group'),
      false
    );

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

    const collapseCallsBeforeTray = collapseCalls.length;
    dom.window.document
      .querySelector('#toolbar-holding-tray [data-toolbar-key="heading"]')
      .click();
    dom.window.document
      .querySelector('#toolbar-holding-tray [data-toolbar-key="heading"]')
      .click();
    assert.equal(collapseCalls.length, collapseCallsBeforeTray + 2);
    assert.equal(edits.length, 4);
    assert.equal(edits.at(-1), 'heading');

    dom.window.applyToolbarSettings({
      pref_toolbar_bottom_config: JSON.stringify({
        version: 1,
        order: ['undo', 'heading', 'lists', 'format', 'table', 'insert'],
        hidden: ['menu'],
        styles: {}
      }),
      pref_toolbar_height: 48,
      pref_toolbar_padding: 4,
      pref_app_theme: 'amoled'
    });
    dom.window.document
      .querySelector('#toolbar-holding-tray [data-toolbar-key="menu"]')
      .click();
    assert.equal(popup.classList.contains('hidden'), true);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').getAttribute('aria-hidden'),
      'false'
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-selected-title').textContent,
      'Menu'
    );
    assert.match(
      dom.window.document.querySelector('#toolbar-preview-status').textContent,
      /Holding-area keys open their settings/
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('an empty holding tray stays empty instead of restoring a duplicate Menu key', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify({
        version: 1,
        order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
        hidden: [],
        styles: {}
      })
    })
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?empty-tray-test=${Date.now()}`);
    assert.equal(dom.window.document.querySelector('#toolbar-holding-tray').children.length, 0);
    assert.equal(
      dom.window.document.querySelectorAll(
        '#toolbar-preview [data-toolbar-key="menu"], #toolbar-holding-tray [data-toolbar-key="menu"]'
      ).length,
      1
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});
