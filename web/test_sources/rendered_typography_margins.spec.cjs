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

> [!info] Info Callout
> Info callout body line
> - Nested info-callout list item
>
> [!tip] Tip Callout
> Tip callout body line
>
> [!warning] Warning Callout
> Warning callout body line
>
> [!question] Question Callout
> Question callout body line

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
    pref_hr_margin_right: 24,
    pref_hr_centered: true,
    pref_list_wrap_under_text: true,
    pref_font_weight_heading: 500,
    pref_heading_1_font_weight: 400,
    pref_heading_1_align: 'center',
    pref_heading_1_line_height: '1.8',
    pref_heading_1_letter_spacing: '1.5px',
    pref_heading_1_word_spacing: '3px',
    pref_heading_1_text_transform: 'uppercase',
    pref_heading_1_underline_style: 'solid',
    pref_heading_1_underline_thickness: 3,
    pref_heading_1_underline_color: '#00ff00',
    pref_heading_1_margin_left: 4,
    pref_heading_1_margin_right: 5,
    pref_heading_1_margin_top: 6,
    pref_heading_1_margin_bottom: 7,
    pref_code_block_text_bg_color: '#CF1414',
    pref_code_block_lang_label_color: '#123456'
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
  assert.equal(rootStyle.getPropertyValue('--hr-margin-left'), '24%');
  assert.equal(rootStyle.getPropertyValue('--hr-margin-right'), '24%');
  assert.equal(rootStyle.getPropertyValue('--heading-font-weight'), '500');
  assert.equal(rootStyle.getPropertyValue('--heading-1-font-weight'), '400');
  assert.equal(rootStyle.getPropertyValue('--heading-1-align'), 'center');
  assert.equal(rootStyle.getPropertyValue('--heading-1-line-height'), '1.8');
  assert.equal(rootStyle.getPropertyValue('--heading-1-letter-spacing'), '1.5px');
  assert.equal(rootStyle.getPropertyValue('--heading-1-word-spacing'), '3px');
  assert.equal(rootStyle.getPropertyValue('--heading-1-text-transform'), 'uppercase');
  assert.equal(rootStyle.getPropertyValue('--heading-1-underline-line'), 'underline');
  assert.equal(rootStyle.getPropertyValue('--heading-1-underline-thickness'), '3px');
  assert.equal(rootStyle.getPropertyValue('--heading-1-underline-color'), '#00ff00');
  assert.equal(rootStyle.getPropertyValue('--heading-1-margin-left'), '4px');
  assert.equal(rootStyle.getPropertyValue('--heading-1-margin-right'), '5px');
  assert.equal(rootStyle.getPropertyValue('--heading-1-margin-top'), '6px');
  assert.equal(rootStyle.getPropertyValue('--heading-1-margin-bottom'), '7px');
  assert.equal(rootStyle.getPropertyValue('--code-block-text-bg-color'), '#CF1414');
  assert.equal(rootStyle.getPropertyValue('--code-block-lang-label-color'), '#123456');
  assert.equal(dom.window.document.body.classList.contains('hr-centered'), true);
  assert.equal(dom.window.document.body.classList.contains('list-wrap-under-text'), true);

  // 2. Confirm blocks exist in rendered DOM
  const codeHeader = dom.window.document.querySelector('.cm-codeblock-header');
  assert.ok(codeHeader !== null, 'Code block header widget is rendered');
  assert.ok(
    dom.window.document.querySelector('.cm-codeblock-text'),
    'WYSIWYG code text receives the text-only background decoration'
  );

  const wpTable = dom.window.document.querySelector('.cm-wp-table-container');
  assert.ok(wpTable !== null, 'WYSIWYG table container is rendered');

  assert.ok(
    dom.window.document.querySelector('.cm-line.cm-list-item .cm-list-block-text'),
    'list item text has a dedicated block wrapper for hanging-indent wrapping'
  );
  assert.ok(
    !dom.window.document.querySelector('.cm-line.cm-list-item .cm-list-block-text').textContent.startsWith(' '),
    'the block wrapper begins after marker padding so wrapped lines align with the first text character'
  );

  const calloutLines = Array.from(
    dom.window.document.querySelectorAll('.cm-line.cm-callout')
  );
  assert.ok(calloutLines.length >= 9, 'titles and body rows for multiple callout types receive callout styling');
  assert.ok(
    calloutLines.every(line => ['info', 'tip', 'warning', 'question'].includes(line.dataset.calloutType)),
    'callout margin styling is separated from blockquote styling on every tested callout type'
  );
  assert.ok(
    calloutLines
      .filter(line =>
        line.classList.contains('cm-callout-body') &&
        !line.classList.contains('cm-callout-list-item')
      )
      .every(line => !line.classList.contains('cm-list-item')),
    'ordinary callout body rows do not inherit list indentation'
  );
  const calloutBodyRows = calloutLines.filter(line =>
    line.classList.contains('cm-callout-body')
  );
  assert.equal(calloutBodyRows.length, 8, 'all body and quoted blank rows are explicitly classified');
  assert.ok(
    calloutBodyRows.some(line =>
      line.classList.contains('cm-callout-list-item') &&
      line.classList.contains('cm-list-item') &&
      line.dataset.calloutType === 'info'
    ),
    'a real list inside a callout keeps list layout while inheriting the callout type'
  );

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
    pref_hr_margin_right: 0,
    pref_hr_centered: false,
    pref_list_wrap_under_text: false
  };

  window.editorBridge.applyAllPreferences(JSON.stringify(defaultPrefs));

  assert.equal(rootStyle.getPropertyValue('--heading-margin-left'), '0px');
  assert.equal(rootStyle.getPropertyValue('--code-block-margin-left'), '0px');
  assert.equal(rootStyle.getPropertyValue('--callout-margin-left'), '0px');
  assert.equal(rootStyle.getPropertyValue('--hr-margin-left'), '0%');
  assert.equal(dom.window.document.body.classList.contains('hr-centered'), false);

  // Clean up
  if (window.editorBridge && typeof window.editorBridge.destroy === 'function') {
    window.editorBridge.destroy();
  }

  window.editorBridge.applyAllPreferences(JSON.stringify({
    pref_list_wrap_under_text: true
  }));
  assert.equal(dom.window.document.body.classList.contains('list-wrap-under-text'), true);

  window.editorBridge.applyAllPreferences(JSON.stringify({
    pref_list_wrap_under_text: false
  }));
  assert.equal(dom.window.document.body.classList.contains('list-wrap-under-text'), false);
});

test.after(() => dom.window.close());
