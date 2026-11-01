const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { EditorView } = require('@codemirror/view');

const nativeActions = [];
const renameRequests = [];
let keyboardHideCalls = 0;
const dom = new JSDOM(
  '<!DOCTYPE html><html><body><div id="editor-container"><div id="editor"></div></div><div id="toc-overlay"></div><div id="toc-panel"><div class="toc-header"><input id="toc-document-name" readonly /><button id="toc-settings-button"></button><button id="toc-history-back"></button><button id="toc-history-forward"></button><button id="toc-global-toggle"></button></div><div id="toc-content"></div></div></body></html>',
  {
    pretendToBeVisual: true,
    url: 'https://wmdx.test/',
    beforeParse(window) {
      window.AndroidNative = {
        onHostReady: () => {},
        onEditorReady: () => {},
        reportDiagnostic: () => {},
        hideKeyboard: () => { keyboardHideCalls += 1; },
        onNativeAction: action => nativeActions.push(action),
        renameCurrentDocument: name => renameRequests.push(name),
        onInDocumentNavigationOccurred: () => {}
      };
    }
  }
);

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: dom.window.navigator
});
global.MutationObserver = dom.window.MutationObserver;
global.Window = dom.window.constructor;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.Range = dom.window.Range;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = id => clearTimeout(id);

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = MockResizeObserver;
dom.window.ResizeObserver = MockResizeObserver;

function getLineIndex(node) {
  let current = node;
  while (current && current !== dom.window.document.body) {
    if (current.nodeType === 1 && current.classList?.contains('cm-line')) {
      const lines = Array.from(dom.window.document.querySelectorAll('.cm-line'));
      const index = lines.indexOf(current);
      if (index !== -1) return index;
    }
    current = current.parentNode || current.parentElement;
  }
  return 0;
}

const RangeProto = dom.window.document.createRange().constructor.prototype;
RangeProto.getClientRects = function() {
  const top = getLineIndex(this.startContainer) * 20;
  return [{ top, bottom: top + 20, left: 0, right: 390, width: 390, height: 20, x: 0, y: top }];
};
RangeProto.getBoundingClientRect = function() {
  const top = getLineIndex(this.startContainer) * 20;
  return { top, bottom: top + 20, left: 0, right: 390, width: 390, height: 20, x: 0, y: top };
};

require('../src/main.js');

test('TOC follows Markdown headings and refreshes while open without losing collapse state', async () => {
  await window.editorBridge.setEditorMode('wysiwyg');

  const panel = document.querySelector('#toc-panel');
  const contents = document.querySelector('#toc-content');
  window.editorBridge.setMarkdown([
    '# Overview',
    '',
    '## First child',
    '',
    '### Grandchild',
    '',
    '#### Great-grandchild',
    '',
    '## Second child',
    '',
    '```md',
    '# Not a heading',
    '```',
    '',
    'Setext section',
    '--------------',
    '',
    '### Setext child',
    '',
    '## Current location',
    '',
    '### Current child',
    '',
    '## Final leaf'
  ].join('\n'));
  window.editorBridge.setDocumentTitle('Guide.md', 'doc-1');
  window.editorBridge.setDocumentHistoryState(false, false);
  const editorView = EditorView.findFromDOM(document.querySelector('.cm-content'));
  assert.ok(editorView, 'the editor view is available to set the initial viewport');
  editorView.dispatch({ selection: { anchor: 0 } });
  const tocPreferences = {
    pref_toc_panel_width: 78,
    pref_toc_default_level: 2,
    pref_toc_expand_levels_per_tap: 1,
    pref_toc_hide_file_extension: false,
    pref_toolbar_bg_color: '#80112233',
    pref_toc_panel_bg_color: '#112233',
    pref_toc_panel_bg_opacity: 72,
    pref_toc_font_size: 18,
    pref_toc_font_weight: 650,
    pref_toc_text_color: '#AABBCC',
    pref_toc_active_text_color: '#DDEEFF',
    pref_toc_active_bg_color: '#223344',
    pref_toc_history_bg_color: '#101010',
    pref_toc_history_border_color: '#202020',
    pref_toc_history_icon_color: '#303030',
    pref_toc_toggle_bg_color: '#123456',
    pref_toc_toggle_icon_color: '#ABCDEF',
    pref_toc_toggle_active_bg_color: '#654321',
    pref_toc_toggle_active_icon_color: '#FEDCBA',
    pref_toc_overlay_dim: 40,
    pref_toc_row_spacing: 6,
    pref_toc_indent_spacing: 10,
    pref_toc_text_overflow: 'wrap'
  };
  window.editorBridge.applyAllPreferences({
    ...tocPreferences,
    pref_toc_panel_width: 100
  });
  assert.equal(
    document.documentElement.style.getPropertyValue('--toc-panel-width'),
    '90vw',
    'saved widths from older versions are capped at 90% of the viewport'
  );
  window.editorBridge.applyAllPreferences(tocPreferences);
  const rootStyles = document.documentElement.style;
  assert.equal(rootStyles.getPropertyValue('--toc-panel-width'), '78vw');
  assert.match(
    rootStyles.getPropertyValue('--toolbar-bg'),
    /^rgba\(17, 34, 51, 0\.5019/
  );
  assert.equal(rootStyles.getPropertyValue('--toc-panel-bg-opacity'), '72%');
  assert.equal(rootStyles.getPropertyValue('--toc-font-size'), '18px');
  assert.equal(rootStyles.getPropertyValue('--toc-font-weight'), '650');
  assert.equal(rootStyles.getPropertyValue('--toc-history-bg-color'), '#101010');
  assert.equal(rootStyles.getPropertyValue('--toc-history-border-color'), '#202020');
  assert.equal(rootStyles.getPropertyValue('--toc-history-icon-color'), '#303030');
  assert.equal(rootStyles.getPropertyValue('--toc-toggle-bg-color'), '#123456');
  assert.equal(rootStyles.getPropertyValue('--toc-toggle-icon-color'), '#ABCDEF');
  assert.equal(rootStyles.getPropertyValue('--toc-toggle-active-bg-color'), '#654321');
  assert.equal(rootStyles.getPropertyValue('--toc-toggle-active-icon-color'), '#FEDCBA');
  assert.equal(rootStyles.getPropertyValue('--toc-overlay-dim'), '0.4');
  assert.equal(rootStyles.getPropertyValue('--toc-level-3-indent'), '28px');
  assert.equal(rootStyles.getPropertyValue('--toc-text-white-space'), 'normal');

  const dispatchTouch = (type, property, point) => {
    const event = new dom.window.Event(type, { bubbles: true });
    Object.defineProperty(event, property, { value: [point] });
    document.body.dispatchEvent(event);
  };
  const swipeStartX = window.innerWidth - 2;
  dispatchTouch('touchstart', 'touches', { clientX: swipeStartX, clientY: 100 });
  dispatchTouch('touchend', 'changedTouches', { clientX: swipeStartX - 100, clientY: 100 });

  assert.ok(panel.classList.contains('open'), 'right-edge swipe opens the TOC panel');
  assert.equal(keyboardHideCalls, 1, 'opening the panel hides the software keyboard');
  assert.equal(document.querySelector('#toc-document-name').value, 'Guide.md');
  const titles = () => Array.from(contents.querySelectorAll('.toc-text'), item => item.textContent);
  const rowFor = title => Array.from(contents.querySelectorAll('.toc-item'))
    .find(row => row.querySelector('.toc-text')?.textContent === title);
  const visibleTitles = () => Array.from(contents.querySelectorAll('.toc-item'))
    .filter(row => row.style.display !== 'none')
    .map(row => row.querySelector('.toc-text').textContent);
  assert.deepEqual(titles(), [
    'Overview',
    'First child',
    'Grandchild',
    'Great-grandchild',
    'Second child',
    'Setext section',
    'Setext child',
    'Current location',
    'Current child',
    'Final leaf'
  ]);
  assert.deepEqual(
    visibleTitles(),
    ['Overview', 'First child', 'Second child', 'Setext section', 'Current location', 'Final leaf'],
    'opening the TOC shows through H2 while keeping deeper sections collapsed'
  );
  assert.equal(
    rowFor('Overview').classList.contains('active-section'),
    true,
    'the first heading is active when the document opens at its top'
  );

  const firstChildToggle = rowFor('First child').querySelector('.toc-toggle');
  assert.equal(firstChildToggle.textContent, '+');
  firstChildToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.equal(rowFor('Grandchild').style.display, 'flex');
  assert.equal(rowFor('Great-grandchild').style.display, 'none');
  rowFor('Grandchild').querySelector('.toc-toggle').dispatchEvent(
    new dom.window.Event('click', { bubbles: true })
  );
  assert.equal(rowFor('Great-grandchild').style.display, 'flex');
  const leafToggle = rowFor('Final leaf').querySelector('.toc-toggle');
  leafToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.equal(leafToggle.textContent, '-');
  assert.equal(leafToggle.getAttribute('aria-disabled'), 'true');

  const firstHeadingToggle = contents.querySelector('.toc-item.level-1 .toc-toggle');
  firstHeadingToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.equal(firstHeadingToggle.textContent, '+');
  assert.equal(firstHeadingToggle.classList.contains('is-collapsed'), true);
  assert.equal(firstHeadingToggle.getAttribute('aria-pressed'), 'true');
  assert.equal(contents.querySelectorAll('.toc-item')[1].style.display, 'none');

  window.editorBridge.setMarkdown([
    '# Overview',
    '',
    '## First child',
    '',
    '### Grandchild',
    '',
    '#### Great-grandchild',
    '',
    '## Added child',
    '',
    '```md',
    '# Still not a heading',
    '```',
    '',
    'Setext section',
    '--------------',
    '',
    '### Setext child',
    '',
    '## Current location',
    '',
    '### Current child',
    '',
    '## Final leaf'
  ].join('\n'));
  editorView.dispatch({ selection: { anchor: 0 } });
  await new Promise(resolve => setTimeout(resolve, 150));

  assert.deepEqual(
    titles(),
    [
      'Overview',
      'First child',
      'Grandchild',
      'Great-grandchild',
      'Added child',
      'Setext section',
      'Setext child',
      'Current location',
      'Current child',
      'Final leaf'
    ]
  );
  assert.equal(
    rowFor('Added child').style.display,
    'none',
    'refresh retains the collapsed parent for newly added child headings'
  );

  const nameInput = document.querySelector('#toc-document-name');
  window.editorBridge.applyAllPreferences({
    ...tocPreferences,
    pref_toc_hide_file_extension: true
  });
  assert.equal(nameInput.value, 'Guide', 'the setting hides a saved file extension');
  window.editorBridge.setDocumentTitle('Untitled.md', 'untitled:test');
  assert.equal(nameInput.value, 'Untitled.md', 'the setting does not strip an unsaved document suffix');
  window.editorBridge.setDocumentTitle('Archive.textpack.zip', 'doc-archive');
  assert.equal(nameInput.value, 'Archive', 'compound textpack extensions are hidden as one suffix');
  window.editorBridge.setDocumentTitle('Archive.textpack', 'doc-textpack');
  assert.equal(nameInput.value, 'Archive', 'the canonical textpack extension is hidden');
  window.editorBridge.setDocumentTitle('Archive.mdx', 'doc-textpack');
  assert.equal(nameInput.value, 'Archive', 'the legacy MDX extension is hidden');
  window.editorBridge.setDocumentTitle('Guide.md', 'doc-1');
  assert.equal(nameInput.value, 'Guide');

  nameInput.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.equal(nameInput.readOnly, false, 'tapping the document name makes it editable');
  nameInput.value = 'Renamed';
  nameInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true
  }));
  assert.deepEqual(renameRequests, ['Renamed'], 'Enter submits the name without its hidden extension');
  assert.equal(nameInput.readOnly, true);

  const parentToggle = contents.querySelector('.toc-item.level-1 .toc-toggle');
  parentToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  document.querySelector('#toc-global-toggle').click();
  assert.equal(parentToggle.textContent, '+', 'global collapse marks the visible parent as collapsed');
  assert.equal(
    contents.querySelectorAll('.toc-item')[1].style.display,
    'none',
    'global collapse hides child headings'
  );
  parentToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.equal(parentToggle.textContent, '-', 'one tap on + unfolds the parent');
  assert.equal(
    contents.querySelectorAll('.toc-item')[1].style.display,
    'flex',
    'one tap on + reveals the child heading'
  );
  assert.equal(
    rowFor('Grandchild').style.display,
    'none',
    'one tap expands only the next heading level'
  );

  document.querySelector('#toc-global-toggle').click();
  assert.equal(
    rowFor('First child').style.display,
    'none',
    'global collapse hides the current nested heading'
  );
  Object.defineProperty(contents, 'clientHeight', { configurable: true, value: 200 });
  Object.defineProperty(contents, 'scrollHeight', { configurable: true, value: 1000 });
  contents.getBoundingClientRect = () => ({
    top: 0, bottom: 200, left: 0, right: 320, width: 320, height: 200
  });
  const scrollDOM = editorView.scrollDOM;
  scrollDOM.getBoundingClientRect = () => ({
    top: 0, bottom: 600, left: 0, right: 390, width: 390, height: 600
  });
  let visiblePosition = editorView.state.selection.main.head;
  let activeSampleY = null;
  let enforceThirtyPercentBoundary = false;
  const previousHeadingPosition = editorView.state.doc.lineAt(
    editorView.state.doc.toString().indexOf('Current location')
  ).from;
  editorView.posAtCoords = ({ y }) => {
    activeSampleY = y;
    if (enforceThirtyPercentBoundary && y < 186) {
      return previousHeadingPosition;
    }
    return visiblePosition;
  };
  const moveViewportToHeading = async (title, rowTop) => {
    const row = rowFor(title);
    row.getBoundingClientRect = () => ({
      top: rowTop,
      bottom: rowTop + 40,
      left: 0,
      right: 320,
      width: 320,
      height: 40
    });
    const line = editorView.state.doc.toString().indexOf(title);
    visiblePosition = editorView.state.doc.lineAt(line).from;
    scrollDOM.scrollTop = 200;
    editorView.dispatch({ selection: { anchor: 0 } });
    scrollDOM.dispatchEvent(new dom.window.Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 20));
  };
  await moveViewportToHeading('Great-grandchild', 480);
  assert.equal(
    rowFor('Great-grandchild').style.display,
    'flex',
    'scrolling into a deep heading expands its parent path'
  );
  assert.equal(contents.scrollTop, 400, 'the active heading is centered in the overflowing TOC');
  enforceThirtyPercentBoundary = true;
  await moveViewportToHeading('Final leaf', 80);
  assert.equal(
    rowFor('Final leaf').classList.contains('active-section'),
    true,
    'the heading positioned at 30% of the viewport is the active heading'
  );
  assert.equal(activeSampleY, 188, 'the active sample point matches the 30% heading landing position');
  assert.equal(
    rowFor('Grandchild').style.display,
    'none',
    'leaving a nested section collapses the previous heading path'
  );
  for (const mode of ['live_preview', 'source', 'wysiwyg']) {
    await window.editorBridge.setEditorMode(mode);
    const modeView = EditorView.findFromDOM(document.querySelector('.cm-content'));
    assert.ok(modeView, `${mode} creates an editor view`);
    const finalHeadingPosition = modeView.state.doc.lineAt(
      modeView.state.doc.toString().indexOf('Final leaf')
    ).from;
    modeView.scrollDOM.getBoundingClientRect = () => ({
      top: 0, bottom: 600, left: 0, right: 390, width: 390, height: 600
    });
    modeView.posAtCoords = () => finalHeadingPosition;
    modeView.scrollDOM.scrollTop = 200;
    modeView.scrollDOM.dispatchEvent(new dom.window.Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(
      rowFor('Final leaf').classList.contains('active-section'),
      true,
      `${mode} keeps the visible heading synchronized with the TOC`
    );
  }

  contents.querySelectorAll('.toc-item')[1].dispatchEvent(
    new dom.window.Event('click', { bubbles: true })
  );
  assert.equal(panel.classList.contains('open'), false, 'choosing a heading closes the panel');
  dispatchTouch('touchstart', 'touches', { clientX: swipeStartX, clientY: 100 });
  dispatchTouch('touchend', 'changedTouches', { clientX: swipeStartX - 100, clientY: 100 });
  assert.equal(
    document.querySelector('#toc-history-back').disabled,
    false,
    'a TOC jump enables local Back history'
  );
  document.querySelector('#toc-history-back').click();
  assert.equal(document.querySelector('#toc-history-back').disabled, true);
  assert.equal(document.querySelector('#toc-history-forward').disabled, false);
  document.querySelector('#toc-history-forward').click();
  assert.equal(document.querySelector('#toc-history-back').disabled, false);

  document.querySelector('#toc-history-back').click();
  const forwardShortcut = new dom.window.KeyboardEvent('keydown', {
    key: 'ArrowRight',
    altKey: true,
    bubbles: true,
    cancelable: true
  });
  window.dispatchEvent(forwardShortcut);
  assert.equal(forwardShortcut.defaultPrevented, true, 'Alt+Right triggers history Forward');
  assert.equal(document.querySelector('#toc-history-back').disabled, false);
  assert.equal(document.querySelector('#toc-history-forward').disabled, true);

  const backShortcut = new dom.window.KeyboardEvent('keydown', {
    key: 'ArrowLeft',
    altKey: true,
    bubbles: true,
    cancelable: true
  });
  window.dispatchEvent(backShortcut);
  assert.equal(backShortcut.defaultPrevented, true, 'Alt+Left triggers history Back');
  assert.equal(document.querySelector('#toc-history-back').disabled, true);
  assert.equal(document.querySelector('#toc-history-forward').disabled, false);

  const documentBackShortcut = new dom.window.KeyboardEvent('keydown', {
    key: 'ArrowLeft',
    altKey: true,
    bubbles: true,
    cancelable: true
  });
  window.dispatchEvent(documentBackShortcut);
  assert.deepEqual(
    nativeActions,
    ['history_back'],
    'history Back falls through to native file history when heading history is empty'
  );

  document.querySelector('#toc-history-forward').click();
  const childToggle = contents.querySelector('.toc-item.level-2 .toc-toggle');
  const rootToggle = contents.querySelector('.toc-item.level-1 .toc-toggle');
  document.querySelector('#toc-global-toggle').click();
  assert.equal(rootToggle.textContent, '+');
  assert.equal(rootToggle.classList.contains('is-collapsed'), true);
  assert.equal(childToggle.textContent, '+');
  assert.equal(childToggle.classList.contains('is-collapsed'), true);
  assert.equal(childToggle.getAttribute('aria-pressed'), 'true');
  document.querySelector('#toc-global-toggle').click();
  assert.equal(childToggle.classList.contains('is-collapsed'), false);

  document.querySelector('#toc-settings-button').click();
  assert.deepEqual(
    nativeActions,
    ['history_back', 'toc_settings'],
    'the gear opens TOC panel settings after history navigation'
  );

  if (window.editorBridge && typeof window.editorBridge.destroy === 'function') {
    window.editorBridge.destroy();
  }
  dom.window.close();
});
