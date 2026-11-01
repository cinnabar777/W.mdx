const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const previewHtml = fs.readFileSync(
  path.join(__dirname, '../findreplace-settings-preview.html'),
  'utf8'
);
const previewScript = fs.readFileSync(
  path.join(__dirname, '../src/findreplaceSettingsPreview.js'),
  'utf8'
);
const executablePreviewScript = previewScript.replace(
  /^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];\s*$/gm,
  ''
);

async function createPreviewDom() {
  const dom = new JSDOM(previewHtml, { runScripts: 'outside-only' });
  const [catalog, icons] = await Promise.all([
    import('../src/appIconCatalog.js'),
    import('../src/findReplaceIcons.js')
  ]);
  dom.window.renderIconChoices = catalog.renderIconChoices;
  dom.window.findReplaceIcons = icons.findReplaceIcons;
  dom.window.eval(executablePreviewScript);
  return dom;
}

function setRect(element, { left, top, width, height }) {
  element.getBoundingClientRect = () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  });
}

function dispatchPointer(window, element, type, { x, y, pointerId = 1, button = 0 }) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({
    clientX: x,
    clientY: y,
    pointerId,
    button
  })) {
    Object.defineProperty(event, key, { value });
  }
  element.dispatchEvent(event);
}

test('find and replace preview matches live icon sizing and saved button layout', async () => {
  const dom = await createPreviewDom();
  const { document } = dom.window;
  assert.match(previewHtml, /-webkit-user-select:\s*none\s*!important/);

  let savedLayout = null;
  let selectedCategory = null;
  dom.window.FindReplaceSettings = {
    saveButtonLayout: (...args) => {
      savedLayout = args;
      return 'saved';
    },
    selectCategory: category => {
      selectedCategory = category;
    }
  };

  dom.window.applyFindReplaceSettings({
    pref_findreplace_field_height: 50,
    pref_findreplace_btn_prev_width: 42,
    pref_findreplace_button_row1: 'next,prev,highlight,regex,close',
    pref_findreplace_button_row2: 'case,word,replace-one,replace-all',
    pref_findreplace_hidden_buttons: 'regex'
  });

  assert.equal(
    document.querySelector('#search-btn-prev').style.getPropertyValue('--findreplace-icon-size'),
    '34px'
  );
  assert.equal(
    document.documentElement.style.getPropertyValue('--findreplace-prev-width'),
    '42px'
  );
  assert.equal(
    document.querySelector('#findreplace-row1').firstElementChild.dataset.buttonId,
    'next'
  );
  assert.equal(
    document.querySelector('#findreplace-row1').contains(document.querySelector('#search-btn-regex')),
    false
  );
  assert.equal(
    document.querySelector('.findreplace-preview-hidden-button').textContent,
    '+ Regex'
  );
  assert.equal(document.querySelector('#findreplace-hidden-tray').hidden, false);
  assert.match(
    document.querySelector('.findreplace-preview-hidden-label').textContent,
    /drag here to remove/
  );

  document.querySelector('.findreplace-preview-hidden-button').click();
  assert.ok(document.querySelector('#findreplace-row1').contains(document.querySelector('#search-btn-regex')));
  assert.deepEqual(savedLayout, ['next,prev,highlight,regex,close', 'case,word,replace-one,replace-all', '']);
  assert.equal(document.querySelector('#findreplace-hidden-tray').hidden, false);
  assert.equal(document.querySelector('.findreplace-preview-empty-hidden').textContent, '(No hidden buttons)');

  document.querySelector('#replace-input').click();
  assert.equal(selectedCategory, 'category_field_replace');
  document.querySelector('#search-btn-prev').click();
  assert.equal(selectedCategory, 'category_btn_prev');
  dom.window.close();
});

test('empty Find & Replace settings use the chosen icon, size, and hidden-button defaults', async () => {
  const dom = await createPreviewDom();
  const { document, findReplaceIcons } = dom.window;
  dom.window.applyFindReplaceSettings({});

  assert.deepEqual(
    [...document.querySelectorAll('.findreplace-preview-hidden-button')].map(button => button.textContent),
    ['+ Highlight', '+ Regex']
  );
  assert.equal(
    document.documentElement.style.getPropertyValue('--findreplace-field-height'),
    '42px'
  );
  assert.equal(
    document.documentElement.style.getPropertyValue('--findreplace-prev-width'),
    '34px'
  );
  assert.equal(
    document.documentElement.style.getPropertyValue('--findreplace-highlight-width'),
    '32px'
  );

  dom.window.applyFindReplaceSettings({ pref_findreplace_hidden_buttons: '' });
  for (const [buttonId, iconKey] of [
    ['prev', 'findPrevious'],
    ['next', 'findNext'],
    ['highlight', 'findHighlight'],
    ['regex', 'findRegex'],
    ['close', 'findClose'],
    ['replace-one', 'replaceOne'],
    ['replace-all', 'replaceAll'],
    ['case', 'matchCase'],
    ['word', 'wholeWord']
  ]) {
    const expectedIcon = document.createElement('span');
    expectedIcon.innerHTML = findReplaceIcons[iconKey];
    assert.equal(
      document.querySelector(`#search-btn-${buttonId}`).innerHTML,
      expectedIcon.innerHTML
    );
  }

  dom.window.close();
});

test('drag feedback allows moving buttons between rows and into the hidden tray', async () => {
  const dom = await createPreviewDom();
  const { document } = dom.window;

  let savedLayout = null;
  dom.window.FindReplaceSettings = {
    saveButtonLayout: (...args) => {
      savedLayout = args;
      return 'saved';
    }
  };
  dom.window.applyFindReplaceSettings({ pref_findreplace_hidden_buttons: '' });

  const row1 = document.querySelector('#findreplace-row1');
  const row2 = document.querySelector('#findreplace-row2');
  const panel = document.querySelector('#custom-search-bar');
  const tray = document.querySelector('#findreplace-hidden-tray');
  setRect(panel, { left: 0, top: 0, width: 300, height: 100 });
  setRect(row1.closest('.search-bar-row'), { left: 0, top: 0, width: 300, height: 100 });
  setRect(row2.closest('.search-bar-row'), { left: 0, top: 80, width: 300, height: 20 });
  setRect(row2, { left: 100, top: 80, width: 128, height: 20 });
  setRect(tray, { left: 0, top: 110, width: 300, height: 50 });
  for (const [id, left] of [
    ['prev', 100],
    ['next', 132],
    ['highlight', 164],
    ['regex', 196],
    ['close', 228]
  ]) {
    setRect(document.querySelector(`[data-button-id="${id}"]`), {
      left,
      top: 4,
      width: 28,
      height: 32
    });
  }
  for (const [id, left] of [
    ['replace-one', 100],
    ['replace-all', 132],
    ['case', 164],
    ['word', 196]
  ]) {
    setRect(document.querySelector(`[data-button-id="${id}"]`), {
      left,
      top: 80,
      width: 28,
      height: 20
    });
  }

  const caseButton = document.querySelector('[data-button-id="case"]');
  dispatchPointer(dom.window, caseButton, 'pointerdown', { x: 175, y: 90 });
  await new Promise(resolve => setTimeout(resolve, 380));
  dispatchPointer(dom.window, caseButton, 'pointermove', { x: 200, y: 20 });
  assert.ok(row1.querySelector('.findreplace-drop-marker'));
  dispatchPointer(dom.window, caseButton, 'pointerup', { x: 200, y: 20 });

  assert.equal(row2.contains(caseButton), false);
  assert.deepEqual(
    [...row1.children]
      .filter(element => element.matches('.search-icon-btn'))
      .map(element => element.dataset.buttonId),
    ['prev', 'next', 'highlight', 'case', 'regex', 'close']
  );
  assert.equal(savedLayout[0].includes('case'), true);
  assert.equal(savedLayout[1].includes('case'), false);

  const previous = document.querySelector('[data-button-id="prev"]');
  dispatchPointer(dom.window, previous, 'pointerdown', { x: 110, y: 20 });
  dispatchPointer(dom.window, previous, 'pointermove', { x: 145, y: 75 });
  assert.ok(row2.querySelector('.findreplace-drop-marker'));
  dispatchPointer(dom.window, previous, 'pointerup', { x: 110, y: 20 });

  assert.equal(row1.contains(previous), false);
  assert.equal(row2.contains(previous), true);
  assert.equal(savedLayout[0].includes('prev'), false);
  assert.equal(savedLayout[1].includes('prev'), true);

  const next = document.querySelector('[data-button-id="next"]');
  dispatchPointer(dom.window, next, 'pointerdown', { x: 10, y: 15 });
  dispatchPointer(dom.window, next, 'pointermove', { x: 150, y: 130 });
  assert.ok(tray.classList.contains('drag-over'));
  dispatchPointer(dom.window, next, 'pointercancel', { x: 10, y: 15 });

  assert.equal(row1.contains(next), false);
  assert.equal(savedLayout[2], 'next');
  assert.match(document.querySelector('#findreplace-hidden-buttons').textContent, /\+ Next/);
  dom.window.close();
});

test('find and replace uses the toolbar icon picker and the complete built-in catalog', async () => {
  const dom = await createPreviewDom();
  const { document } = dom.window;
  const expanded = [];
  const savedIcons = [];
  const nativeEdits = [];
  dom.window.FindReplaceSettings = {
    setIconPickerExpanded: expandedValue => expanded.push(expandedValue),
    saveButtonIcon: (buttonId, svg) => {
      savedIcons.push([buttonId, svg]);
      return 'saved';
    },
    editButtonIcon: (buttonId, action) => nativeEdits.push([buttonId, action])
  };

  assert.match(previewHtml, /href="\.\/icon-picker\.css"/);
  assert.match(previewHtml, /class="toolbar-preview-icon-picker-dialog"/);
  assert.match(previewHtml, /id="findreplace-paste-svg"/);
  assert.match(previewHtml, /id="findreplace-choose-svg"/);

  assert.equal(dom.window.openFindReplaceIconPicker('prev'), true);
  const modal = document.querySelector('#findreplace-icon-picker-modal');
  assert.equal(modal.hidden, false);
  const titles = [...document.querySelectorAll('#findreplace-icon-list [role="option"]')]
    .map(button => button.getAttribute('aria-label'));
  assert.ok(titles.some(title => title === 'Table: Add Row Below'));
  assert.ok(titles.some(title => title === 'Callout: Warning'));
  assert.ok(titles.some(title => title === 'Find & Replace: Find Previous'));
  assert.ok(titles.some(title => title === 'Audio: Play'));
  assert.ok(titles.some(title => title === 'Help'));

  const search = document.querySelector('#findreplace-icon-search');
  search.value = 'audio: play';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const playIcon = document.querySelector('#findreplace-icon-list [role="option"]');
  assert.equal(playIcon.getAttribute('aria-label'), 'Audio: Play');
  playIcon.click();
  assert.equal(modal.hidden, true);
  assert.equal(savedIcons.length, 1);
  assert.equal(savedIcons[0][0], 'prev');
  assert.match(savedIcons[0][1], /<svg/);
  assert.deepEqual(expanded, [true, false]);

  dom.window.openFindReplaceIconPicker('replace-all');
  document.querySelector('#findreplace-paste-svg').click();
  assert.deepEqual(nativeEdits[0], ['replace-all', 'paste']);
  dom.window.openFindReplaceIconPicker('case');
  document.querySelector('#findreplace-choose-svg').click();
  assert.deepEqual(nativeEdits[1], ['case', 'file']);
  assert.equal(modal.hidden, true);
  dom.window.close();
});
