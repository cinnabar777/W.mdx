const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

async function dragKey(
  dom,
  source,
  target,
  dropX = 90,
  dropY = 50,
  duringDrag = null,
  pointTarget = target,
  moveX = 42,
  moveY = 12
) {
  const originalGetBoundingClientRect = target.getBoundingClientRect;
  target.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
  });
  dom.window.document.elementFromPoint = () => pointTarget;
  const dispatchPointer = (targetElement, type, clientX, clientY) => {
    targetElement.dispatchEvent(new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX,
      clientY
    }));
  };
  try {
    dispatchPointer(source, 'pointerdown', 2, 2);
    await new Promise(resolve => setTimeout(resolve, 410));
    dispatchPointer(dom.window.document, 'pointermove', moveX, moveY);
    duringDrag?.();
    dispatchPointer(dom.window.document, 'pointerup', dropX, dropY);
  } finally {
    target.getBoundingClientRect = originalGetBoundingClientRect;
  }
}

test('toolbar settings preview opens a dismissible icon picker popup above spacious key settings', async () => {
  const htmlPath = path.resolve(__dirname, '../toolbar-settings-preview.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, { url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html' });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const edits = [];
  const collapseCalls = [];
  const overlayCalls = [];
  const colorPicks = [];
  const saves = [];
  const settings = {
    version: 1,
    order: ['undo', 'lists', 'format', 'table', 'insert', 'menu'],
    holding: [
      'cut', 'copy', 'paste', 'selectAll',
      'custom-key-user-copy', 'custom-group-user-folder'
    ],
    customKeys: {
      'custom-key-user-copy': {
        title: 'My Copy Key',
        icon: 'copy',
        actionId: 'copy'
      }
    },
    customGroups: {
      'custom-group-user-folder': {
        title: 'My Folder',
        icon: 'folder'
      }
    },
    hidden: ['heading'],
    styles: {
      paragraph: {
        gestureActions: { tap2: 'bold', swipeLeft: 'deleteLine' }
      },
      saveFile: {
        iconColor: '#00ff00',
        backgroundColor: '#22000000'
      },
      format: {
        gestureActions: { tap3: 'openGroup' }
      }
    }
  };

  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify(settings),
      pref_toolbar_height: 48,
      pref_toolbar_padding: 4,
      pref_app_theme: 'amoled',
      pref_toolbar_active_key_bg_color: '#224466'
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    },
    pickBottomToolbarColor: (id, property) => colorPicks.push([id, property]),
    editBottomToolbarIcon: id => edits.push(id),
    collapseToolbarAppearance: () => collapseCalls.push(true),
    setToolbarEditorOverlay: open => overlayCalls.push(open)
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?preview-test=${Date.now()}`);

    const heldParagraph = dom.window.document.querySelector(
      '#toolbar-holding-tray [data-preview-popup-item="paragraph"]'
    );
    assert.ok(heldParagraph, 'the configured key is present in the holding area');
    assert.equal(
      heldParagraph.querySelectorAll('.toolbar-key-gesture-indicator').length,
      0,
      'holding-area keys do not overlay several action icons on the main icon'
    );
    assert.equal(
      heldParagraph.querySelector('.toolbar-key-gesture-count')?.textContent,
      '2',
      'the holding-area key shows one compact count for its assigned gestures'
    );
    assert.equal(
      heldParagraph.getAttribute('aria-label'),
      'Paragraph, 2 assigned gestures'
    );

    const trayProbe = dom.window.document.createElement('div');
    const { renderBottomToolbarKeys } = await import('../src/toolbarRenderer.js');
    const { svgIcons } = await import('../src/toolbarIcons.js');
    renderBottomToolbarKeys(trayProbe, {
      version: 3,
      order: ['undo'],
      hidden: ['lists', 'format', 'table', 'insert', 'menu'],
      holding: [],
      popupGroups: {},
      customGroups: {},
      customKeys: {},
      styles: {
        undo: {
          gestureActions: { tap2: 'bold', swipeLeft: 'deleteLine' }
        }
      }
    }, svgIcons, {
      gestureIndicatorMode: 'count',
      resolveGestureActionIcon: () => '<svg></svg>'
    });
    const heldToolbarKey = trayProbe.querySelector('[data-toolbar-key="undo"]');
    assert.equal(
      heldToolbarKey.querySelector('.toolbar-key-gesture-count')?.textContent,
      '2',
      'held toolbar keys also use the compact gesture count'
    );
    assert.equal(
      heldToolbarKey.querySelectorAll('.toolbar-key-gesture-indicator').length,
      0
    );

    const helpButton = dom.window.document.querySelector('#toolbar-help-button');
    const helpModal = dom.window.document.querySelector('#toolbar-help-modal');
    assert.ok(helpButton?.querySelector('svg'), 'the holding area help control uses the question icon');
    helpButton.click();
    assert.equal(helpModal.hidden, false, 'the help popup opens');
    assert.equal(helpButton.getAttribute('aria-expanded'), 'true');
    helpButton.click();
    assert.equal(helpModal.hidden, true, 'tapping the help control closes the popup');
    helpButton.click();
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true
    }));
    assert.equal(helpModal.hidden, true, 'Escape dismisses the help popup');

    assert.deepEqual(
      [...dom.window.document.querySelectorAll('#toolbar-preview [data-toolbar-key]')]
        .map(button => button.dataset.toolbarKey),
      ['undo', 'lists', 'format', 'table', 'insert', 'menu']
    );
    const openGroupIndicator = dom.window.document.querySelector(
      '#toolbar-preview [data-toolbar-key="format"] .toolbar-key-gesture-indicator'
    );
    assert.ok(openGroupIndicator?.querySelector('svg'),
      'the group action icon is rendered when no key editor is open');
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
    const scrollKey = popup.querySelector('.toolbar-preview-popup-key');
    popup.scrollLeft = 0;
    const pointerEvent = (target, type, x, y) => target.dispatchEvent(
      new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y
      })
    );
    pointerEvent(scrollKey, 'pointerdown', 100, 50);
    pointerEvent(dom.window.document, 'pointermove', 80, 50);
    pointerEvent(dom.window.document, 'pointerup', 80, 50);
    assert.equal(popup.scrollLeft, 20, 'a horizontal swipe scrolls the popup row instead of dragging a key');
    assert.equal(
      dom.window.document
        .querySelector('#toolbar-preview [data-toolbar-key="menu"]')
        .classList.contains('active'),
      true
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').classList.contains('above-group'),
      false,
      'the editor uses the full overlay instead of being positioned above a group'
    );
    assert.deepEqual(
      [...popup.querySelectorAll('[data-preview-popup-item]')].map(button => button.title),
      [
        'New Tab',
        'New File',
        'Open File',
        'Save File',
        'Save As',
        'Save Tabs',
        'Save as Text Pack',
        'Save as MDZip',
        'Convert from Markdown dialect',
        'Paste from Markdown dialect',
        'Export Markdown dialect',
        'Lint document',
        'Format JSON',
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
      false
    );
    dom.window.document.querySelector('#toolbar-add-custom').click();
    assert.equal(
      dom.window.document.querySelector('#toolbar-create-group-modal').hidden,
      false,
      'the custom-group action opens a dedicated name dialog'
    );
    assert.deepEqual(edits, []);
    dom.window.document.querySelector('#toolbar-create-group-cancel').click();
    dom.window.document.querySelector('#toolbar-icon-color').click();
    assert.deepEqual(colorPicks, [['saveFile', 'iconColor']]);
    const editor = dom.window.document.querySelector('#toolbar-preview-editor');
    const picker = dom.window.document.querySelector('#toolbar-icon-picker-modal');
    const pickerButton = dom.window.document.querySelector('#toolbar-open-icon-picker');
    assert.equal(picker.hidden, true, 'the icon picker starts out of the way');
    assert.equal(
      picker.parentElement,
      editor.parentElement.parentElement,
      'the picker is a sibling popup, outside the editor overlay'
    );
    assert.equal(pickerButton.parentElement, editor.querySelector('.toolbar-preview-editor-content'));
    assert.equal(dom.window.document.querySelector('#toolbar-current-key-preview'), null);
    assert.equal(dom.window.document.querySelector('#toolbar-current-icon'), null);
    assert.equal(editor.querySelectorAll('[data-toolbar-section]').length, 4);
    assert.equal(editor.querySelectorAll('.toolbar-preview-gesture-action').length, 13);
    assert.equal(editor.querySelectorAll('.toolbar-preview-gesture-icon').length, 12);
    assert.equal(
      editor.querySelector('[data-toolbar-section="colors"]').open,
      false,
      'color settings start collapsed with the gesture sections'
    );
    const tapsSection = editor.querySelector('[data-toolbar-section="taps"]');
    const sideSwipesSection = editor.querySelector('[data-toolbar-section="side-swipes"]');
    const colorsSection = editor.querySelector('[data-toolbar-section="colors"]');
    tapsSection.open = true;
    sideSwipesSection.querySelector('summary').click();
    assert.equal(tapsSection.open, false, 'opening a section collapses the previous section');
    assert.equal(sideSwipesSection.open, true);
    colorsSection.querySelector('summary').click();
    assert.equal(sideSwipesSection.open, false, 'switching sections closes the current section immediately');
    assert.equal(colorsSection.open, true, 'the color section opens in the same click');
    colorsSection.querySelector('summary').click();
    pickerButton.click();
    assert.equal(picker.hidden, false, 'tapping the icon row opens a separate popup');
    assert.equal(picker.getAttribute('aria-hidden'), 'false');
    assert.ok(picker.querySelector('#toolbar-icon-search'));
    assert.ok(picker.querySelector('#toolbar-icon-list [role="option"]'));
    const iconTitles = [...picker.querySelectorAll('#toolbar-icon-list [role="option"]')]
      .map(button => button.getAttribute('aria-label'));
    assert.deepEqual(
      iconTitles,
      [...iconTitles].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
      ),
      'the icon catalog is alphabetized'
    );
    assert.ok(iconTitles.some(title => title.startsWith('Table: ')));
    assert.ok(iconTitles.includes('Callout: Warning'));
    assert.ok(iconTitles.includes('Find & Replace: Find Previous'));
    assert.ok(iconTitles.includes('Audio: Play'));
    assert.ok(iconTitles.includes('TOC Settings'));
    assert.ok(
      iconTitles.some(title => title.includes('Clear Formatting')),
      'the new built-in action icon appears in the shared icon picker'
    );
    assert.ok(
      html.includes('href="./icon-picker.css"'),
      'toolbar picker styles come from the shared stylesheet'
    );
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
    assert.equal(
      dom.window.document.documentElement.style.getPropertyValue('--toolbar-key-active-bg-color'),
      '#224466',
      'the global active-key background is applied to the preview'
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="undo"]')
        .style.getPropertyValue('--toolbar-key-active-bg-color'),
      '',
      'a key without a per-key override inherits the global active background'
    );
    assert.deepEqual(
      overlayCalls,
      [],
      'opening a key editor leaves the native global settings and surface buttons in place'
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
    assert.deepEqual(JSON.parse(edits[0]), { itemId: 'saveFile', action: 'paste' });
    assert.equal(picker.hidden, true, 'starting Paste closes the picker popup');
    pickerButton.click();
    dom.window.document.querySelector('#toolbar-choose-svg').click();
    assert.deepEqual(JSON.parse(edits[1]), { itemId: 'saveFile', action: 'file' });
    pickerButton.click();
    const iconSearch = dom.window.document.querySelector('#toolbar-icon-search');
    iconSearch.value = 'bold';
    iconSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const boldChoice = dom.window.document.querySelector('#toolbar-icon-list [role="option"]');
    assert.equal(boldChoice.getAttribute('aria-label'), 'Bold');
    boldChoice.click();
    assert.equal(picker.hidden, true, 'choosing an icon dismisses the popup');
    assert.match(saves.at(-1).styles.saveFile.customSvg, /<svg/);
    const actionPicker = dom.window.document.querySelector('#toolbar-action-picker-modal');
    dom.window.document
      .querySelector('.toolbar-preview-gesture-action[data-gesture-id="swipeUp"]')
      .click();
    assert.equal(actionPicker.hidden, false, 'the action row opens its own searchable picker');
    const actionSearch = dom.window.document.querySelector('#toolbar-action-search');
    const actionTitles = [...actionPicker.querySelectorAll('#toolbar-action-list [role="option"]')]
      .map(button => button.getAttribute('aria-label'));
    assert.ok(actionTitles.includes('Clear Formatting'));
    assert.ok(!actionTitles.includes('My Copy Key'));
    assert.ok(!actionTitles.includes('My Folder'));
    assert.deepEqual(
      actionTitles,
      [...actionTitles].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
      ),
      'the action catalog is alphabetized'
    );
    actionSearch.value = 'bold';
    actionSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const boldAction = actionPicker.querySelector('[role="option"]');
    assert.equal(boldAction.getAttribute('aria-label'), 'Bold');
    boldAction.click();
    assert.equal(actionPicker.hidden, true);
    assert.equal(saves.at(-1).styles.saveFile.gestureActions.swipeUp, 'bold');
    assert.match(
      dom.window.document.querySelector('.toolbar-preview-gesture-icon[data-gesture-id="swipeUp"]').innerHTML,
      /<svg/,
      'choosing an action fills its matching icon automatically'
    );
    dom.window.document.querySelector('.toolbar-preview-gesture-icon[data-gesture-id="swipeUp"]').click();
    assert.equal(picker.hidden, false, 'the assigned action icon opens the existing icon picker');
    iconSearch.value = 'italic';
    iconSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    picker.querySelector('#toolbar-icon-list [role="option"]').click();
    assert.match(saves.at(-1).styles.saveFile.gestureActionIcons.swipeUp, /<svg/);
    const resetSwipeUp = dom.window.document.querySelector(
      '.toolbar-preview-gesture-reset[data-gesture-id="swipeUp"]'
    );
    assert.equal(resetSwipeUp.disabled, false);
    resetSwipeUp.click();
    assert.equal(
      saves.at(-1).styles.saveFile.gestureActions?.swipeUp,
      undefined,
      'reset removes the gesture action'
    );
    assert.equal(
      saves.at(-1).styles.saveFile.gestureActionIcons?.swipeUp,
      undefined,
      'reset removes its custom icon override too'
    );
    assert.equal(
      dom.window.document.querySelector(
        '.toolbar-preview-gesture-icon[data-gesture-id="swipeUp"]'
      ).disabled,
      true,
      'reset disables the now-unassigned gesture icon control'
    );

    dom.window.document.querySelector('#toolbar-edit-key-name').click();
    const nameInput = dom.window.document.querySelector('#toolbar-preview-title-input');
    nameInput.value = 'Save quick';
    dom.window.document.querySelector('#toolbar-save-key-name').click();
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-selected-title').textContent,
      'Save quick'
    );
    assert.equal(saves.at(-1).styles.saveFile.title, 'Save quick');
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

    const heldHeadingAction = dom.window.document
      .querySelector('#toolbar-holding-tray [data-preview-popup-item="paragraph"]');
    assert.ok(heldHeadingAction, 'empty folders expose their action keys individually');
    heldHeadingAction.click();
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-selected-title').textContent,
      'Paragraph'
    );
    assert.equal(edits.length, 2, 'tapping an action selects its settings without deleting the folder');
    assert.equal(popup.classList.contains('hidden'), true);

    await dragKey(
      dom,
      dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="menu"]'),
      dom.window.document.querySelector('#toolbar-holding-tray')
    );
    const heldMenuFolder = dom.window.document
      .querySelector('#toolbar-holding-tray [data-toolbar-key="menu"]');
    const heldMenuAction = dom.window.document
      .querySelector('#toolbar-holding-tray [data-preview-popup-item="saveFile"]');
    assert.ok(heldMenuFolder, 'an empty folder remains visible as a key in the holding area');
    assert.equal(heldMenuFolder.parentElement.id, 'toolbar-holding-tray');
    assert.ok(heldMenuAction, 'a hidden folder releases its actions into the shared tray');
    assert.equal(heldMenuAction.parentElement.id, 'toolbar-holding-tray');
    heldMenuAction.click();
    assert.equal(popup.classList.contains('hidden'), true);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-editor').getAttribute('aria-hidden'),
      'false'
    );
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-selected-title').textContent,
      'Save File'
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('moving a folder releases its actions and keeps the empty folder visible in the holding area', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const saves = [];
  const settings = {
    version: 1,
    order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
    hidden: [],
    styles: {}
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
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?popup-drag-test=${Date.now()}`);
    dom.window.document
      .querySelector('#toolbar-preview [data-toolbar-key="lists"]')
      .click();
    const popup = dom.window.document.querySelector('#toolbar-preview-popup');
    const tray = dom.window.document.querySelector('#toolbar-holding-tray');

    await dragKey(
      dom,
      popup.querySelector('[data-preview-popup-item="bulletedList"]'),
      popup.querySelector('[data-preview-popup-item="outdent"]')
    );
    assert.deepEqual(
      saves.at(-1).popupGroups.lists.order.slice(-2),
      ['outdent', 'bulletedList'],
      'a popup action can be reordered within its group'
    );

    await dragKey(
      dom,
      popup.querySelector('[data-preview-popup-item="todoList"]'),
      tray
    );
    assert.deepEqual(saves.at(-1).popupGroups.lists.hidden, []);
    assert.ok(saves.at(-1).holding.includes('todoList'));
    assert.equal(
      popup.querySelector('[data-preview-popup-item="todoList"]'),
      null,
      'hidden popup actions leave the group popup'
    );
    assert.ok(
      tray.querySelector('.toolbar-preview-popup-key[data-preview-popup-item="todoList"]'),
      'hidden popup actions appear in the holding area'
    );

    await dragKey(
      dom,
      tray.querySelector('.toolbar-preview-popup-key[data-preview-popup-item="todoList"]'),
      popup.querySelector('[data-preview-popup-item="outdent"]'),
      2
    );
    assert.deepEqual(saves.at(-1).holding, ['cut', 'copy', 'paste', 'selectAll']);
    assert.ok(
      [...popup.querySelectorAll('[data-preview-popup-item]')]
        .some(button => button.dataset.previewPopupItem === 'todoList'),
      'dropping a loose action on a group places it in that group'
    );

    await dragKey(
      dom,
      dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="lists"]'),
      tray
    );
    assert.ok(saves.at(-1).hidden.includes('lists'));
    assert.equal(saves.at(-1).popupGroups.lists.order.length, 0);
    assert.equal(saves.at(-1).holding.length, 10);
    const heldFolder = tray.querySelector('[data-toolbar-key="lists"]');
    assert.ok(heldFolder, 'the empty folder remains available as a standalone key');
    assert.equal(heldFolder.parentElement, tray);
    const looseActions = [...tray.querySelectorAll('.toolbar-preview-popup-key')];
    assert.equal(
      looseActions.length,
      5,
      'moving a folder to the holding area releases every popup key individually'
    );
    assert.ok(
      looseActions.every(button => button.parentElement === tray),
      'popup keys sit directly in the shared holding area, not in a nested folder'
    );
    assert.equal(
      saves.at(-1).popupGroups.lists.order.length,
      0,
      'the folder is empty but its configuration remains intact'
    );
    const heldIdsBeforeAppearanceRefresh = [
      ...tray.querySelectorAll('[data-toolbar-key], [data-preview-popup-item]')
    ].map(button => button.dataset.toolbarKey || button.dataset.previewPopupItem);
    dom.window.applyToolbarSettings(JSON.stringify({
      pref_toolbar_bg_color: '#202020',
      pref_app_theme: 'amoled'
    }));
    assert.deepEqual(
      [...tray.querySelectorAll('[data-toolbar-key], [data-preview-popup-item]')]
        .map(button => button.dataset.toolbarKey || button.dataset.previewPopupItem),
      heldIdsBeforeAppearanceRefresh,
      'appearance-only updates do not replace the saved toolbar layout'
    );
    dom.window.applyToolbarSettings(JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify(settings),
      pref_toolbar_bg_color: '#202020',
      pref_app_theme: 'amoled'
    }));
    assert.deepEqual(
      [
        ...tray.querySelectorAll('[data-toolbar-key], [data-preview-popup-item]')
      ].map(button => button.dataset.toolbarKey || button.dataset.previewPopupItem),
      heldIdsBeforeAppearanceRefresh,
      'a stale toolbar snapshot accompanying an appearance change must not restore the old layout'
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('custom groups accept loose actions and deleting a group releases its children', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const saves = [];
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify({
        version: 2,
        order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
        hidden: [],
        holding: [],
        customGroups: {},
        styles: {}
      })
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?custom-group-test=${Date.now()}`);
    dom.window.document
      .querySelector('#toolbar-preview [data-toolbar-key="lists"]')
      .click();
    const popup = dom.window.document.querySelector('#toolbar-preview-popup');
    dom.window.document.querySelector('#toolbar-add-custom').click();
    const type = dom.window.document.querySelector('#toolbar-create-group-type');
    type.value = 'group';
    type.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const name = dom.window.document.querySelector('#toolbar-create-group-name');
    name.value = 'My group';
    dom.window.document.querySelector('#toolbar-create-group-form')
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    const groupId = Object.keys(saves.at(-1).customGroups)[0];
    assert.ok(groupId);
    assert.equal(saves.at(-1).customGroups[groupId].title, 'My group');
    dom.window.document
      .querySelector('#toolbar-preview [data-toolbar-key="lists"]')
      .click();
    const groupButton = dom.window.document.querySelector(
      `#toolbar-holding-tray [data-toolbar-key="${groupId}"]`
    );
    assert.ok(groupButton, 'the new empty folder is immediately visible in the holding area');

    await dragKey(
      dom,
      popup.querySelector('[data-preview-popup-item="todoList"]'),
      groupButton,
      50,
      0
    );
    assert.deepEqual(saves.at(-1).popupGroups[groupId].order, ['todoList']);
    assert.ok(
      !saves.at(-1).popupGroups.lists.order.includes('todoList'),
      'the action no longer belongs to its former folder'
    );
    assert.ok(
      dom.window.document.querySelector(
        `#toolbar-holding-tray [data-toolbar-key="${groupId}"]`
      ),
      'a filled group stays at the location where the user placed it'
    );

    dom.window.document
      .querySelector(`#toolbar-holding-tray [data-toolbar-key="${groupId}"]`)
      .click();
    await dragKey(
      dom,
      popup.querySelector('[data-preview-popup-item="todoList"]'),
      dom.window.document.querySelector('#toolbar-holding-tray')
    );
    assert.deepEqual(saves.at(-1).popupGroups[groupId].order, []);
    assert.ok(saves.at(-1).holding.includes(groupId));
    assert.ok(
      dom.window.document.querySelector(
        `#toolbar-holding-tray [data-toolbar-key="${groupId}"]`
      ),
      'an emptied folder remains visible in the shared holding area'
    );

    await dragKey(
      dom,
      dom.window.document.querySelector(
        '#toolbar-holding-tray [data-preview-popup-item="todoList"][data-preview-location="tray"]'
      ),
      dom.window.document.querySelector(
        `#toolbar-holding-tray [data-toolbar-key="${groupId}"]`
      ),
      50,
      0
    );
    assert.deepEqual(saves.at(-1).popupGroups[groupId].order, ['todoList']);
    assert.ok(!saves.at(-1).holding.includes('todoList'));

    dom.window.document
      .querySelector(`#toolbar-holding-tray [data-toolbar-key="${groupId}"]`)
      .click();
    assert.ok(
      dom.window.document.querySelector(
        '#toolbar-preview-popup [data-preview-popup-item="todoList"]'
      ),
      'the app preview opens the group and displays its assigned action'
    );
    dom.window.document.querySelector('#toolbar-delete-item').click();
    assert.equal(saves.at(-1).customGroups[groupId], undefined);
    assert.equal(saves.at(-1).popupGroups[groupId], undefined);
    assert.ok(
      saves.at(-1).holding.includes('todoList'),
      'deleting a custom group releases its child action instead of deleting it'
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('empty custom groups can be placed on both toolbar surfaces', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html',
    pretendToBeVisual: true
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  const saves = [];
  const defaultConfig = {
    version: 8,
    order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
    hidden: [],
    holding: [],
    customGroups: {},
    customKeys: {},
    styles: {}
  };
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify(defaultConfig),
      pref_toolbar_floating_config: JSON.stringify(defaultConfig)
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;
  global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);

  try {
    await import(`../src/toolbarSettingsPreview.js?empty-group-surfaces=${Date.now()}`);
    const createAndPlaceGroup = async (surface, name) => {
      if (surface === 'floating') {
        dom.window.document
          .querySelector('[data-toolbar-surface="floating"]')
          .click();
        await new Promise(resolve => dom.window.requestAnimationFrame(resolve));
      }
      dom.window.document.querySelector('#toolbar-add-custom').click();
      const type = dom.window.document.querySelector('#toolbar-create-group-type');
      type.value = 'group';
      type.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      const nameInput = dom.window.document.querySelector('#toolbar-create-group-name');
      nameInput.value = name;
      dom.window.document.querySelector('#toolbar-create-group-form')
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

      const groupId = Object.keys(saves.at(-1).customGroups)[0];
      assert.ok(groupId, `${surface} group was created`);
      const heldGroup = dom.window.document.querySelector(
        `#toolbar-holding-tray [data-toolbar-key="${groupId}"]`
      );
      assert.ok(heldGroup, 'new empty groups start in the holding area');

      const stage = dom.window.document.querySelector('.toolbar-preview-stage');
      await dragKey(dom, heldGroup, stage, 90, 50, null, stage);
      assert.ok(
        dom.window.document.querySelector(
          `#toolbar-preview [data-toolbar-key="${groupId}"]`
        ),
        `${surface} empty group appears on its toolbar after release`
      );
      assert.equal(
        dom.window.document.querySelector(
          `#toolbar-holding-tray [data-toolbar-key="${groupId}"]`
        ),
        null,
        `${surface} group leaves the holding area after placement`
      );
      assert.ok(saves.at(-1).order.includes(groupId));
      assert.ok(!saves.at(-1).holding.includes(groupId));
    };

    await createAndPlaceGroup('bottom', 'Bottom folder');
    await createAndPlaceGroup('floating', 'Floating folder');
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
    if (previousRequestAnimationFrame === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = previousRequestAnimationFrame;
  }
});

test('built-in groups and keys can be deleted on both toolbar surfaces', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html',
    pretendToBeVisual: true
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  const saves = [];
  const configWithHeldLists = {
    version: 8,
    order: ['undo', 'heading', 'format', 'table', 'insert', 'menu'],
    hidden: ['lists'],
    popupGroups: { lists: { order: [], hidden: [] } },
    holding: ['lists'],
    deletedGroups: [],
    customGroups: {},
    customKeys: {},
    styles: {}
  };
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify(configWithHeldLists),
      pref_toolbar_floating_config: JSON.stringify(configWithHeldLists)
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;
  global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);

  try {
    await import(`../src/toolbarSettingsPreview.js?builtin-group-test=${Date.now()}`);
    const runOnSurface = async surface => {
      if (surface === 'floating') {
        dom.window.document
          .querySelector('[data-toolbar-surface="floating"]')
          .click();
        await new Promise(resolve => dom.window.requestAnimationFrame(resolve));
      }

      const tray = dom.window.document.querySelector('#toolbar-holding-tray');
      const stage = dom.window.document.querySelector('.toolbar-preview-stage');
      const heldGroup = tray.querySelector('[data-toolbar-key="lists"]');
      assert.ok(heldGroup, `${surface} keeps the built-in group in the holding area`);
      await dragKey(dom, heldGroup, stage, 90, 50, null, stage);

      const placedGroup = dom.window.document.querySelector(
        '#toolbar-preview [data-toolbar-key="lists"]'
      );
      assert.ok(placedGroup, `${surface} can return the empty group to its toolbar`);
      assert.ok(saves.at(-1).order.includes('lists'));

      await dragKey(dom, placedGroup, tray);
      const heldAgain = tray.querySelector('[data-toolbar-key="lists"]');
      assert.ok(heldAgain, 'the group can be moved back to the holding area');
      heldAgain.click();
      const deleteButton = dom.window.document.querySelector('#toolbar-delete-item');
      assert.equal(deleteButton.hidden, false, 'built-in groups have a delete control');
      assert.equal(deleteButton.title, 'Delete group');
      deleteButton.click();

      let saved = saves.at(-1);
      assert.ok(saved.deletedGroups.includes('lists'));
      assert.ok(!saved.order.includes('lists'));
      assert.ok(!saved.holding.includes('lists'));
      assert.equal(saved.popupGroups.lists, undefined);
      assert.ok(saved.holding.includes('bulletedList'));
      assert.ok(saved.holding.includes('outdent'));

      const heldListKey = tray.querySelector(
        '[data-preview-popup-item="bulletedList"]'
      );
      assert.ok(heldListKey, 'released built-in actions remain selectable in the holding area');
      heldListKey.click();
      assert.equal(deleteButton.hidden, false, 'built-in actions have a delete control');
      assert.equal(deleteButton.title, 'Delete key');
      deleteButton.click();
      saved = saves.at(-1);
      assert.ok(saved.deletedKeys.includes('bulletedList'));
      assert.ok(!saved.holding.includes('bulletedList'));
      assert.ok(!saved.popupGroups.lists);

      const undoKey = dom.window.document.querySelector(
        '#toolbar-preview [data-toolbar-key="undo"]'
      );
      assert.ok(undoKey, 'root built-in keys can be selected for deletion');
      undoKey.click();
      assert.equal(deleteButton.title, 'Delete key');
      deleteButton.click();
      saved = saves.at(-1);
      assert.ok(saved.deletedKeys.includes('undo'));
      assert.ok(!saved.order.includes('undo'));
    };

    await runOnSurface('bottom');
    await runOnSurface('floating');
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
    if (previousRequestAnimationFrame === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = previousRequestAnimationFrame;
  }
});

test('custom toolbar keys can run built-in actions but cannot be selected as actions', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const saves = [];
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify({
        order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
        hidden: [],
        holding: [],
        customGroups: {},
        customKeys: {},
        styles: {}
      })
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?custom-key-test=${Date.now()}`);
    dom.window.document.querySelector('#toolbar-add-custom').click();
    const name = dom.window.document.querySelector('#toolbar-create-group-name');
    name.value = 'Quick Action';
    dom.window.document.querySelector('#toolbar-create-group-form')
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    const customKeyId = Object.keys(saves.at(-1).customKeys)[0];
    assert.ok(customKeyId?.startsWith('custom-key-'));
    assert.ok(saves.at(-1).holding.includes(customKeyId));
    dom.window.document
      .querySelector(`#toolbar-holding-tray [data-toolbar-key="${customKeyId}"]`)
      .click();
    const customActionRow = dom.window.document.querySelector('#toolbar-custom-key-action-row');
    assert.equal(customActionRow.hidden, false);
    dom.window.document.querySelector('#toolbar-custom-key-action').click();
    const actionPicker = dom.window.document.querySelector('#toolbar-action-picker-modal');
    const search = dom.window.document.querySelector('#toolbar-action-search');
    search.value = 'Open group';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(
      actionPicker.querySelector('[role="option"][aria-label="Open group"]'),
      null,
      'a plain custom key does not get a group-only action'
    );
    search.value = 'Save As';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    actionPicker.querySelector('[role="option"][aria-label="Save As"]').click();
    assert.equal(saves.at(-1).customKeys[customKeyId].actionId, 'saveAsFile');
    assert.match(
      dom.window.document.querySelector('#toolbar-custom-key-action').textContent,
      /Key action → Save As/
    );

    dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="undo"]').click();
    dom.window.document
      .querySelector('.toolbar-preview-gesture-action[data-gesture-id="tap1"]')
      .click();
    search.value = 'Quick Action';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(
      actionPicker.querySelector('[role="option"][aria-label="Quick Action"]'),
      null,
      'a user-created key does not become a selectable action'
    );
    search.value = 'Remove Highlight';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(
      actionPicker.querySelector('[role="option"][aria-label="Remove Highlight"]'),
      null,
      'the obsolete highlight action is not available to assign'
    );
    search.value = 'Bold';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    actionPicker.querySelector('[role="option"][aria-label="Bold"]').click();
    assert.equal(saves.at(-1).styles.undo.gestureActions.tap1, 'bold');

    dom.window.document
      .querySelector('.toolbar-preview-gesture-icon[data-gesture-id="tap1"]')
      .click();
    const noIconOption = dom.window.document.querySelector(
      '#toolbar-icon-picker-modal [role="option"][aria-label="No icon"]'
    );
    assert.ok(noIconOption);
    noIconOption.click();
    assert.equal(saves.at(-1).styles.undo.gestureActionIcons.tap1, 'none');
    assert.equal(
      dom.window.document
        .querySelector('#toolbar-preview [data-toolbar-key="undo"]')
        .querySelector('.toolbar-key-gesture-indicator'),
      null,
      'an action with no icon has no parent-key indicator'
    );

    dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="format"]').click();
    dom.window.document
      .querySelector('.toolbar-preview-gesture-action[data-gesture-id="tap2"]')
      .click();
    search.value = 'Open group';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const openGroupOptions = actionPicker.querySelectorAll('[role="option"]');
    assert.equal(openGroupOptions.length, 1);
    assert.equal(openGroupOptions[0].getAttribute('aria-label'), 'Open group');
    openGroupOptions[0].click();
    assert.equal(
      saves.at(-1).styles.format.gestureActions.tap2,
      'openGroup'
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('dragging a held key through the gap shows its toolbar insertion target', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const saves = [];
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify({
        version: 4,
        order: ['undo', 'lists', 'format', 'table', 'insert', 'menu'],
        holding: ['heading'],
        popupGroups: { heading: { order: [], hidden: [] } },
        customGroups: {},
        styles: {}
      })
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?toolbar-insert-test=${Date.now()}`);
    const bounds = (left, top, width, height) => ({
      left, top, width, height, right: left + width, bottom: top + height
    });
    dom.window.document.querySelector('.toolbar-preview-content').getBoundingClientRect =
      () => bounds(0, 100, 360, 600);
    dom.window.document.querySelector('.toolbar-preview-holding').getBoundingClientRect =
      () => bounds(0, 300, 360, 150);
    dom.window.document.querySelector('#toolbar-holding-tray').getBoundingClientRect =
      () => bounds(10, 330, 340, 80);
    dom.window.document.querySelector('.toolbar-preview-dock').getBoundingClientRect =
      () => bounds(0, 700, 360, 68);
    [
      ...dom.window.document.querySelectorAll('#toolbar-preview .toolbar-preview-key')
    ].forEach((button, index) => {
      button.getBoundingClientRect = () => bounds(index * 44, 700, 44, 48);
    });
    dom.window.document.elementFromPoint = () => dom.window.document.body;

    const source = dom.window.document.querySelector(
      '#toolbar-holding-tray [data-toolbar-key="heading"]'
    );
    const dispatchPointer = (element, type, x, y) => {
      element.dispatchEvent(new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y
      }));
    };
    dispatchPointer(source, 'pointerdown', 2, 2);
    await new Promise(resolve => setTimeout(resolve, 410));
    dispatchPointer(dom.window.document, 'pointermove', 10, 500);

    const marker = dom.window.document.querySelector('#toolbar-preview-drop-marker');
    assert.equal(marker.hidden, false);
    assert.equal(marker.dataset.kind, 'insert');
    assert.equal(marker.style.left, '0px');
    assert.equal(marker.style.top, '712px');
    assert.ok(
      dom.window.document.querySelector(
        '#toolbar-preview [data-toolbar-key="undo"]'
      ).classList.contains('drop-target')
    );
    const touchEnd = new dom.window.Event('touchend', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(touchEnd, 'changedTouches', {
      value: [{ clientX: 10, clientY: 500 }]
    });
    dom.window.document.dispatchEvent(touchEnd);

    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-status').textContent,
      'Toolbar changes saved.'
    );
    assert.equal(saves.length, 1);
    assert.deepEqual(saves.at(-1).order.slice(0, 2), ['heading', 'undo']);
    assert.ok(!saves.at(-1).holding.includes('heading'));
    assert.deepEqual(saves.at(-1).customGroups, {});
  } finally {
    global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('toolbar insertion target stays visible while dragging through the blank gap', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const saves = [];
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify({
        version: 4,
        order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
        holding: [],
        customGroups: {},
        customKeys: {},
        styles: {}
      })
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?toolbar-gap-drop-test=${Date.now()}`);
    const bounds = (left, top, width, height) => ({
      left, top, width, height, right: left + width, bottom: top + height
    });
    const content = dom.window.document.querySelector('.toolbar-preview-content');
    const holding = dom.window.document.querySelector('.toolbar-preview-holding');
    const tray = dom.window.document.querySelector('#toolbar-holding-tray');
    const dock = dom.window.document.querySelector('.toolbar-preview-dock');
    content.getBoundingClientRect = () => bounds(0, 100, 360, 600);
    holding.getBoundingClientRect = () => bounds(0, 300, 360, 150);
    tray.getBoundingClientRect = () => bounds(10, 330, 340, 80);
    dock.getBoundingClientRect = () => bounds(0, 700, 360, 68);

    const toolbarKeys = [
      ...dom.window.document.querySelectorAll('#toolbar-preview .toolbar-preview-key')
    ];
    toolbarKeys.forEach((button, index) => {
      button.getBoundingClientRect = () => bounds(index * 44, 700, 44, 48);
    });
    dom.window.document.elementFromPoint = () => dom.window.document.body;

    const source = dom.window.document.querySelector(
      '#toolbar-preview [data-toolbar-key="undo"]'
    );
    const dispatchPointer = (element, type, x, y) => {
      element.dispatchEvent(new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y
      }));
    };
    dispatchPointer(source, 'pointerdown', 2, 2);
    await new Promise(resolve => setTimeout(resolve, 410));
    dispatchPointer(dom.window.document, 'pointermove', 240, 500);

    const marker = dom.window.document.querySelector('#toolbar-preview-drop-marker');
    const insertKey = dom.window.document.querySelector(
      '#toolbar-preview [data-toolbar-key="insert"]'
    );
    assert.equal(marker.hidden, false);
    assert.equal(marker.dataset.kind, 'insert');
    assert.equal(marker.style.left, '220px');
    assert.equal(marker.style.top, '712px');
    assert.ok(insertKey.classList.contains('drop-target'));

    dispatchPointer(dom.window.document, 'pointerup', 240, 500);
    assert.deepEqual(
      saves.at(-1).order,
      ['heading', 'lists', 'format', 'table', 'undo', 'insert', 'menu']
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('dropping one toolbar key onto another creates a folder with both keys', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const saves = [];
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify({
        version: 3,
        order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
        hidden: [],
        holding: [],
        customGroups: {},
        styles: {
          undo: {
            customSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h1v1H1z"/></svg>'
          }
        }
      })
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?drag-create-group-test=${Date.now()}`);
    const source = dom.window.document.querySelector(
      '#toolbar-preview [data-toolbar-key="table"]'
    );
    const target = dom.window.document.querySelector(
      '#toolbar-preview [data-toolbar-key="undo"]'
    );
    await dragKey(dom, source, target, 50, 0);

    const groupId = Object.keys(saves.at(-1).customGroups)[0];
    assert.ok(groupId, 'a drop on the center of another key creates a group');
    assert.equal(saves.at(-1).customGroups[groupId].icon, 'folder');
    assert.equal(
      saves.at(-1).styles[groupId]?.customSvg,
      undefined,
      'the new group does not inherit the first key custom icon'
    );
    assert.deepEqual(saves.at(-1).popupGroups[groupId].order, ['undo', 'table']);
    assert.ok(!saves.at(-1).order.includes('undo'));
    assert.ok(!saves.at(-1).order.includes('table'));
    assert.ok(saves.at(-1).order.includes(groupId));
    assert.ok(
      dom.window.document.querySelector(
        '#toolbar-preview-popup [data-preview-popup-item="undo"]'
      ),
      'the new folder opens to show the first key'
    );
    assert.ok(
      dom.window.document.querySelector(
        '#toolbar-preview-popup [data-preview-popup-item="table"]'
      ),
      'the new folder opens to show the dropped key'
    );

    dom.window.document
      .querySelector('#toolbar-preview [data-toolbar-key="lists"]')
      .click();
    await dragKey(
      dom,
      dom.window.document.querySelector('#toolbar-preview [data-toolbar-key="menu"]'),
      dom.window.document.querySelector(
        '#toolbar-preview-popup [data-preview-popup-item="todoList"]'
      ),
      50,
      0
    );
    const nestedGroupId = Object.keys(saves.at(-1).customGroups)
      .find(id => id !== groupId);
    assert.ok(nestedGroupId, 'dropping a toolbar key on a popup action creates a nested group');
    assert.deepEqual(saves.at(-1).popupGroups[nestedGroupId].order, ['todoList', 'menu']);
    assert.ok(saves.at(-1).popupGroups.lists.order.includes(nestedGroupId));
    assert.ok(!saves.at(-1).order.includes('menu'));
    assert.ok(
      dom.window.document.querySelector(
        '#toolbar-preview-popup [data-preview-popup-item="menu"]'
      ),
      'a group key can be nested and remains a folder in its new location'
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('dropping onto a toolbar key near the viewport edge still creates a folder', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  const saves = [];
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 768 });
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({
      pref_toolbar_bottom_config: JSON.stringify({
        version: 4,
        order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
        holding: [],
        customGroups: {},
        customKeys: {},
        styles: {}
      })
    }),
    saveBottomToolbarConfig: value => {
      saves.push(JSON.parse(value));
      return true;
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?bottom-edge-group-test=${Date.now()}`);
    const source = dom.window.document.querySelector(
      '#toolbar-preview [data-toolbar-key="table"]'
    );
    const target = dom.window.document.querySelector(
      '#toolbar-preview [data-toolbar-key="undo"]'
    );
    const targetBounds = {
      left: 100,
      top: 700,
      width: 44,
      height: 48,
      right: 144,
      bottom: 748
    };
    target.getBoundingClientRect = () => targetBounds;
    dom.window.document.elementFromPoint = (_x, y) =>
      y >= targetBounds.top && y <= targetBounds.bottom
        ? target
        : dom.window.document.body;
    const dispatchPointer = (element, type, x, y) => {
      element.dispatchEvent(new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y
      }));
    };

    dispatchPointer(source, 'pointerdown', 2, 2);
    await new Promise(resolve => setTimeout(resolve, 410));
    dispatchPointer(dom.window.document, 'pointermove', 122, 654);
    const marker = dom.window.document.querySelector('#toolbar-preview-drop-marker');
    assert.equal(marker.dataset.kind, 'group');
    assert.ok(
      Number.parseFloat(marker.style.top) > 654,
      'the visible group marker stays below the finger when the toolbar is near the screen edge'
    );
    assert.ok(target.classList.contains('drop-target-group'));

    dom.window.finishToolbarDragFromNative(122, 654);
    const groupId = Object.keys(saves.at(-1).customGroups)[0];
    assert.ok(groupId, 'the direct drop on the toolbar key creates a group');
    assert.deepEqual(saves.at(-1).popupGroups[groupId].order, ['undo', 'table']);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-status').textContent,
      'Toolbar changes saved.'
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('holding-area layout survives recreating the toolbar settings preview', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const previousWindow = global.window;
  const previousDocument = global.document;
  let saveCalls = 0;
  let persisted = {
    version: 4,
    order: ['undo', 'heading', 'lists', 'format', 'table', 'insert', 'menu'],
    hidden: [],
    holding: [],
    popupGroups: {},
    customGroups: {},
    customKeys: {},
    styles: {}
  };
  const attachBridge = dom => {
    dom.window.ToolbarSettings = {
      getBottomToolbarSettings: () => JSON.stringify({
        pref_toolbar_bottom_config: JSON.stringify(persisted),
        pref_toolbar_height: 48,
        pref_toolbar_padding: 4,
        pref_app_theme: 'amoled'
      }),
      saveBottomToolbarConfig: value => {
        saveCalls += 1;
        persisted = JSON.parse(value);
        return true;
      }
    };
  };
  let firstDom;
  let reopenedDom;

  try {
    firstDom = new JSDOM(html, {
      url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
    });
    attachBridge(firstDom);
    global.window = firstDom.window;
    global.document = firstDom.window.document;
    await import(`../src/toolbarSettingsPreview.js?holding-save-test=${Date.now()}`);

    const heading = firstDom.window.document.querySelector(
      '#toolbar-preview [data-toolbar-key="heading"]'
    );
    const tray = firstDom.window.document.querySelector('#toolbar-holding-tray');
    await dragKey(firstDom, heading, tray, 90, 50, null, tray);
    assert.ok(persisted.holding.includes('heading'));
    assert.ok(persisted.holding.includes('paragraph'));

    const savesBeforeManualSave = saveCalls;
    assert.equal(firstDom.window.saveToolbarLayout(), true);
    assert.equal(saveCalls, savesBeforeManualSave + 1);
    assert.equal(
      firstDom.window.document.querySelector('#toolbar-preview-status').textContent,
      'Toolbar changes saved.'
    );

    firstDom.window.close();
    reopenedDom = new JSDOM(html, {
      url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
    });
    attachBridge(reopenedDom);
    global.window = reopenedDom.window;
    global.document = reopenedDom.window.document;
    await import(`../src/toolbarSettingsPreview.js?holding-reopen-test=${Date.now()}`);

    assert.ok(
      reopenedDom.window.document.querySelector(
        '#toolbar-holding-tray [data-toolbar-key="heading"]'
      ),
      'the group remains in the holding area after the preview is recreated'
    );
    assert.ok(
      reopenedDom.window.document.querySelector(
        '#toolbar-holding-tray [data-preview-popup-item="paragraph"]'
      ),
      'the group actions remain in the holding area after the preview is recreated'
    );
  } finally {
    firstDom?.window.close();
    reopenedDom?.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('toolbar preview contains native save bridge exceptions and reports a failed save', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousConsoleError = console.error;
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const errors = [];
  console.error = (...args) => errors.push(args);
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({}),
    saveBottomToolbarConfig: () => {
      throw new Error('simulated native save bridge failure');
    }
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?save-bridge-error-test=${Date.now()}`);

    assert.equal(dom.window.saveToolbarLayout(), false);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-status').textContent,
      'Toolbar save failed: simulated native save bridge failure'
    );
    assert.equal(errors.length, 1);
    assert.match(String(errors[0][0]), /save bridge threw an exception/);
  } finally {
    dom.window.close();
    console.error = previousConsoleError;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('toolbar preview surfaces native preference commit failures', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const previousWindow = global.window;
  const previousDocument = global.document;
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  dom.window.ToolbarSettings = {
    getBottomToolbarSettings: () => JSON.stringify({}),
    saveBottomToolbarConfig: () => 'commit_failed'
  };
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?save-commit-failure-test=${Date.now()}`);

    assert.equal(dom.window.saveToolbarLayout(), false);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-status').textContent,
      'Android did not commit the toolbar preferences.'
    );
  } finally {
    dom.window.close();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
});

test('toolbar save invokes the injected bridge with its receiver intact', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../toolbar-settings-preview.html'), 'utf8');
  const previousWindow = global.window;
  const previousDocument = global.document;
  const dom = new JSDOM(html, {
    url: 'https://appassets.androidplatform.net/assets/www/toolbar-settings-preview.html'
  });
  const bridge = {
    getBottomToolbarSettings: () => JSON.stringify({})
  };
  bridge.saveBottomToolbarConfig = function () {
    assert.equal(this, bridge, 'the injected Java bridge must remain the method receiver');
    return 'saved';
  };
  dom.window.ToolbarSettings = bridge;
  global.window = dom.window;
  global.document = dom.window.document;

  try {
    await import(`../src/toolbarSettingsPreview.js?save-bridge-receiver-test=${Date.now()}`);

    assert.equal(dom.window.saveToolbarLayout(), true);
    assert.equal(
      dom.window.document.querySelector('#toolbar-preview-status').textContent,
      'Toolbar changes saved.'
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
