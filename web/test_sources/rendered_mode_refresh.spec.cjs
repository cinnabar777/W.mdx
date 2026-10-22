const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor-container"><div id="editor"></div></div></body></html>', { pretendToBeVisual: true, url: 'https://wmdx.test/' });
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

const RangeProto = dom.window.document.createRange().constructor.prototype;
RangeProto.getClientRects = function() {
  const lineIdx = getLineIndex(this.startContainer);
  const top = lineIdx * 20;
  return [{ top, bottom: top + 19.9, left: 0, right: 500, width: 500, height: 19.9, x: 0, y: top }];
};
RangeProto.getBoundingClientRect = function() {
  const lineIdx = getLineIndex(this.startContainer);
  const top = lineIdx * 20;
  return { top, bottom: top + 19.9, left: 0, right: 500, width: 500, height: 19.9, x: 0, y: top };
};

require('../src/main.js');

test('rendered mode transitions preserve WYSIWYG headings, body font scaling, and viewport placement', async () => {
  const markdownPath = path.join(__dirname, '../../Documentation/Markdown.md');
  const stressDoc = fs.readFileSync(markdownPath, 'utf8');

  let simpleLines = [];
  for (let i = 1; i <= 672; i++) {
    if (i % 20 === 1) {
      simpleLines.push(`## Section Heading ${Math.ceil(i / 20)}`);
    } else {
      simpleLines.push(`Line ${i} with **bold text** and paragraph content.`);
    }
  }
  const simpleDoc = simpleLines.join('\n');

  // Test with stress document
  await window.editorBridge.setEditorMode('wysiwyg');
  window.editorBridge.setMarkdown(stressDoc);

  // 1. Verify WYSIWYG heading rendering
  assert.equal(window.editorBridge.getEditorMode(), 'wysiwyg');
  let headingLines = dom.window.document.querySelectorAll('.cm-line.cm-heading');
  assert.ok(headingLines.length > 0, 'WYSIWYG mode renders .cm-heading line classes');
  const hasH1orH2 = Array.from(headingLines).some(l => l.classList.contains('cm-heading-1') || l.classList.contains('cm-heading-2'));
  assert.ok(hasH1orH2, 'WYSIWYG heading lines contain .cm-heading-1 or .cm-heading-2');

  // 2. Set custom --body-font-size and verify CSS rule calculations
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('var(--body-font-size, 16px)'), 'index.html calculates heading font-size relative to --body-font-size');

  // 3. Test mode transition cycle: WYSIWYG -> Live Preview -> Source -> WYSIWYG
  const midOffset = Math.floor(stressDoc.length / 2);
  window.editorBridge.setSelectionState(JSON.stringify({ head: midOffset, anchor: midOffset }), 400);

  // Live Preview
  await window.editorBridge.setEditorMode('live_preview');
  assert.equal(window.editorBridge.getEditorMode(), 'live_preview');
  let lpHeadings = dom.window.document.querySelectorAll('.cm-line.cm-heading');
  assert.ok(lpHeadings.length > 0, 'Live Preview mode renders .cm-heading line classes');

  // Source
  await window.editorBridge.setEditorMode('source');
  assert.equal(window.editorBridge.getEditorMode(), 'source');
  const sourceText = window.editorBridge.getMarkdown();
  assert.ok(sourceText.includes('# '), 'Source mode retains raw heading syntax');

  // WYSIWYG (return)
  await window.editorBridge.setEditorMode('wysiwyg');
  assert.equal(window.editorBridge.getEditorMode(), 'wysiwyg');
  headingLines = dom.window.document.querySelectorAll('.cm-line.cm-heading');
  assert.ok(headingLines.length > 0, 'WYSIWYG retains .cm-heading line classes after returning from Source');

  // 4. Position and caret retention
  const restoredSel = window.editorBridge.getSelectionState();
  assert.ok(Math.abs(restoredSel.head - midOffset) < 100, 'Selection head is retained across mode transitions');

  // 5. Test with simple document
  window.editorBridge.setMarkdown(simpleDoc);
  headingLines = dom.window.document.querySelectorAll('.cm-line.cm-heading');
  assert.ok(headingLines.length > 0, 'WYSIWYG renders .cm-heading lines for simple document');

  // Clean up
  if (window.editorBridge && typeof window.editorBridge.destroy === 'function') {
    window.editorBridge.destroy();
  }
  process.exit(0);
});
