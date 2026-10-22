const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor-container"><div id="editor"></div></div></body></html>', {
  pretendToBeVisual: true,
  url: 'https://wmdx.test/',
  beforeParse(window) {
    window.AndroidNative = {
      onHostReady: () => {},
      onEditorReady: () => {},
      reportDiagnostic: () => {}
    };
  }
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.MutationObserver = dom.window.MutationObserver;
global.Window = dom.window.constructor;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.Range = dom.window.Range;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver;
dom.window.ResizeObserver = MockResizeObserver;

function getLineIndex(node) {
  let cur = node;
  while (cur && cur !== dom.window.document.body) {
    if (cur.nodeType === 1 && cur.classList && cur.classList.contains('cm-line')) {
      const allLines = Array.from(dom.window.document.querySelectorAll('.cm-line'));
      const idx = allLines.indexOf(cur);
      if (idx !== -1) return idx;
    }
    cur = cur.parentNode || cur.parentElement;
  }
  return 0;
}

Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
  get() { return 20; }
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
  get() { return 200; }
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollHeight', {
  get() { return this._scrollHeight || 2000; },
  set(val) { this._scrollHeight = val; }
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollTop', {
  get() { return this._scrollTop || 0; },
  set(val) { this._scrollTop = val; }
});

const RangeProto = dom.window.document.createRange().constructor.prototype;
RangeProto.getClientRects = function() {
  const lineIdx = getLineIndex(this.startContainer);
  const top = lineIdx * 20;
  return [{ top, bottom: top + 19.9, left: 0, right: 390, width: 390, height: 19.9, x: 0, y: top }];
};
RangeProto.getBoundingClientRect = function() {
  const lineIdx = getLineIndex(this.startContainer);
  const top = lineIdx * 20;
  return { top, bottom: top + 19.9, left: 0, right: 390, width: 390, height: 19.9, x: 0, y: top };
};

require('../src/main.js');

test('rendered typography margins are applied via applyAllPreferences and mapped to document custom properties', async () => {
  const sampleDoc = `
## Heading 2

- List item 1
- List item 2

\`\`\`javascript
const x = 42;
\`\`\`

> Blockquote line

> [!note] Callout Title
> Callout body line

| Col 1 | Col 2 |
| --- | --- |
| Val 1 | Val 2 |

---
`;

  await window.editorBridge.setEditorMode('wysiwyg');
  window.editorBridge.setMarkdown(sampleDoc);

  // 1. Apply non-zero margin preferences
  const customPrefs = {
    pref_body_margin_left: 20,
    pref_body_margin_right: 22,
    pref_heading_margin_left: 10,
    pref_heading_margin_right: 12,
    pref_list_left_indent: 30,
    pref_list_right_margin: 8,
    pref_code_block_margin_left: 14,
    pref_code_block_margin_right: 14,
    pref_blockquote_left_indent: 18,
    pref_blockquote_right_margin: 18,
    pref_callout_margin_left: 16,
    pref_callout_margin_right: 16,
    pref_table_margin_left: 12,
    pref_table_margin_right: 12,
    pref_hr_margin_left: 24,
    pref_hr_margin_right: 24
  };

  window.editorBridge.applyAllPreferences(JSON.stringify(customPrefs));

  const rootStyle = dom.window.document.documentElement.style;
  assert.equal(rootStyle.getPropertyValue('--body-margin-left'), '20px');
  assert.equal(rootStyle.getPropertyValue('--body-margin-right'), '22px');
  assert.equal(rootStyle.getPropertyValue('--heading-margin-left'), '10px');
  assert.equal(rootStyle.getPropertyValue('--heading-margin-right'), '12px');
  assert.equal(rootStyle.getPropertyValue('--list-left-indent'), '30px');
  assert.equal(rootStyle.getPropertyValue('--list-margin-right'), '8px');
  assert.equal(rootStyle.getPropertyValue('--code-block-margin-left'), '14px');
  assert.equal(rootStyle.getPropertyValue('--code-block-margin-right'), '14px');
  assert.equal(rootStyle.getPropertyValue('--blockquote-left-margin'), '18px');
  assert.equal(rootStyle.getPropertyValue('--blockquote-right-margin'), '18px');
  assert.equal(rootStyle.getPropertyValue('--callout-margin-left'), '16px');
  assert.equal(rootStyle.getPropertyValue('--callout-margin-right'), '16px');
  assert.equal(rootStyle.getPropertyValue('--table-margin-left'), '12px');
  assert.equal(rootStyle.getPropertyValue('--table-margin-right'), '12px');
  assert.equal(rootStyle.getPropertyValue('--hr-margin-left'), '24px');
  assert.equal(rootStyle.getPropertyValue('--hr-margin-right'), '24px');

  // 2. Confirm blocks exist in rendered DOM
  const codeHeader = dom.window.document.querySelector('.cm-codeblock-header');
  assert.ok(codeHeader !== null, 'Code block header widget is rendered');

  const wpTable = dom.window.document.querySelector('.cm-wp-table-container');
  assert.ok(wpTable !== null, 'WYSIWYG table container is rendered');

  // 3. Apply default/zero preferences
  const defaultPrefs = {
    pref_body_margin_left: 16,
    pref_body_margin_right: 16,
    pref_heading_margin_left: 0,
    pref_heading_margin_right: 0,
    pref_list_left_indent: 24,
    pref_list_right_margin: 0,
    pref_code_block_margin_left: 0,
    pref_code_block_margin_right: 0,
    pref_blockquote_left_indent: 0,
    pref_blockquote_right_margin: 0,
    pref_callout_margin_left: 0,
    pref_callout_margin_right: 0,
    pref_table_margin_left: 0,
    pref_table_margin_right: 0,
    pref_hr_margin_left: 0,
    pref_hr_margin_right: 0
  };

  window.editorBridge.applyAllPreferences(JSON.stringify(defaultPrefs));

  assert.equal(rootStyle.getPropertyValue('--heading-margin-left'), '0px');
  assert.equal(rootStyle.getPropertyValue('--code-block-margin-left'), '0px');
  assert.equal(rootStyle.getPropertyValue('--callout-margin-left'), '0px');

  // Clean up
  if (window.editorBridge && typeof window.editorBridge.destroy === 'function') {
    window.editorBridge.destroy();
  }
});
