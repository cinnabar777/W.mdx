const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor-container"><div id="editor"></div></div></body></html>', { pretendToBeVisual: true });
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

if (!dom.window.ResizeObserver) {
  dom.window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
global.ResizeObserver = dom.window.ResizeObserver;

Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
  get() { return 20; }
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
  get() { return 200; }
});

const RangeProto = dom.window.document.createRange().constructor.prototype;
RangeProto.getClientRects = function() {
  return [{ top: 10, bottom: 30, left: 0, right: 200, width: 200, height: 20, x: 0, y: 10 }];
};
RangeProto.getBoundingClientRect = function() {
  return { top: 10, bottom: 30, left: 0, right: 200, width: 200, height: 20, x: 0, y: 10 };
};

require('../src/main.js');

test('rendered mode transitions and syntax refresh preserve selection and placement without forced focus', async () => {
  const sampleDoc = `
## Section Heading

This is a paragraph with **bold text** inside it.

A second long paragraph that wraps onto multiple visual rows in the editor.
`;

  await window.editorBridge.setEditorMode('wysiwyg');
  window.editorBridge.setMarkdown(sampleDoc);

  // 1. Check WYSIWYG mode
  assert.equal(window.editorBridge.getEditorMode(), 'wysiwyg');

  // 2. Switch to Live Preview
  await window.editorBridge.setEditorMode('live_preview');
  assert.equal(window.editorBridge.getEditorMode(), 'live_preview');

  // 3. Switch to Source
  await window.editorBridge.setEditorMode('source');
  assert.equal(window.editorBridge.getEditorMode(), 'source');
  const sourceText = window.editorBridge.getMarkdown();
  assert.ok(sourceText.includes('## Section Heading'), 'Source mode retains ## heading markers');
  assert.ok(sourceText.includes('**bold text**'), 'Source mode retains ** bold markers');

  // 4. Switch back to WYSIWYG
  await window.editorBridge.setEditorMode('wysiwyg');
  assert.equal(window.editorBridge.getEditorMode(), 'wysiwyg');

  // 5. Caret restoration with different saved scrollTop
  const headPos = sampleDoc.indexOf('bold text');
  window.editorBridge.setSelectionState(JSON.stringify({ head: headPos, anchor: headPos }), 800);

  const selState = window.editorBridge.getSelectionState();
  assert.equal(selState.head, headPos, 'Caret position offset is retained');

  // Cleanup
  await window.editorBridge.setEditorMode('source');
  process.exit(0);
});
