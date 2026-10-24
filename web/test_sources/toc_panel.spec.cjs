const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

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
    '```md',
    '# Not a heading',
    '```',
    '',
    'Setext section',
    '--------------'
  ].join('\n'));
  window.editorBridge.setDocumentTitle('Guide.md', 'doc-1');
  window.editorBridge.setDocumentHistoryState(false, false);
  window.editorBridge.applyAllPreferences({
    pref_toc_panel_width: 78,
    pref_toc_panel_bg_color: '#112233',
    pref_toc_panel_bg_opacity: 72,
    pref_toc_font_size: 18,
    pref_toc_font_weight: 650,
    pref_toc_text_color: '#AABBCC',
    pref_toc_active_text_color: '#DDEEFF',
    pref_toc_active_bg_color: '#223344',
    pref_toc_overlay_dim: 40,
    pref_toc_row_spacing: 6,
    pref_toc_indent_spacing: 10,
    pref_toc_text_overflow: 'wrap'
  });
  const rootStyles = document.documentElement.style;
  assert.equal(rootStyles.getPropertyValue('--toc-panel-width'), '78vw');
  assert.equal(rootStyles.getPropertyValue('--toc-panel-bg-opacity'), '72%');
  assert.equal(rootStyles.getPropertyValue('--toc-font-size'), '18px');
  assert.equal(rootStyles.getPropertyValue('--toc-font-weight'), '650');
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
  assert.deepEqual(titles(), ['Overview', 'First child', 'Setext section']);

  const firstHeadingToggle = contents.querySelector('.toc-item.level-1 .toc-toggle');
  firstHeadingToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.equal(contents.querySelectorAll('.toc-item')[1].style.display, 'none');

  window.editorBridge.setMarkdown([
    '# Overview',
    '',
    '## First child',
    '',
    '## Added child',
    '',
    '```md',
    '# Still not a heading',
    '```',
    '',
    'Setext section',
    '--------------'
  ].join('\n'));
  await new Promise(resolve => setTimeout(resolve, 150));

  assert.deepEqual(titles(), ['Overview', 'First child', 'Added child', 'Setext section']);
  assert.equal(
    contents.querySelectorAll('.toc-item')[2].style.display,
    'none',
    'refresh retains the collapsed parent for newly added child headings'
  );

  const nameInput = document.querySelector('#toc-document-name');
  nameInput.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.equal(nameInput.readOnly, false, 'tapping the document name makes it editable');
  nameInput.value = 'Renamed.md';
  nameInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true
  }));
  assert.deepEqual(renameRequests, ['Renamed.md'], 'Enter submits the requested document name');
  assert.equal(nameInput.readOnly, true);

  const parentToggle = contents.querySelector('.toc-item.level-1 .toc-toggle');
  parentToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
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

  document.querySelector('#toc-settings-button').click();
  assert.deepEqual(nativeActions, ['toc_settings'], 'the gear opens TOC panel settings');

  if (window.editorBridge && typeof window.editorBridge.destroy === 'function') {
    window.editorBridge.destroy();
  }
  dom.window.close();
});
