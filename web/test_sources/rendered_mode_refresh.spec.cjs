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

  const mostlyPlainDoc = Array.from({ length: 672 }, (_, index) => {
    if (index % 80 === 0) return `## Section ${index / 80 + 1}`;
    if (index % 35 === 0) return 'A paragraph with **bold** and _italic_ text.';
    return `Plain text paragraph ${index + 1} with ordinary words.`;
  }).join('\n');

  const waitForRestore = () => new Promise(resolve => setTimeout(resolve, 50));

  async function assertRepeatedModeRestore(markdownText, label) {
    window.editorBridge.setMarkdown(markdownText);
    const savedHead = Math.floor(markdownText.length * 0.60);
    window.editorBridge.setSelectionState(
      JSON.stringify({ head: savedHead, anchor: savedHead }),
      0
    );
    await waitForRestore();

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const mode of ['live_preview', 'source', 'wysiwyg']) {
        await window.editorBridge.setEditorMode(mode);
        await waitForRestore();

        const selection = window.editorBridge.getSelectionState();
        assert.ok(
          Math.abs(selection.head - savedHead) < 100,
          `${label}: selection position survives cycle ${cycle + 1} in ${mode}`
        );

        const scroller = document.querySelector('#editor .cm-scroller');
        assert.ok(
          scroller && scroller.scrollTop > scroller.clientHeight,
          `${label}: middle-of-document position is not reset to the top in ${mode}`
        );
      }
    }
  }

  // 1. Verify WYSIWYG heading rendering
  await window.editorBridge.setEditorMode('wysiwyg');
  window.editorBridge.setMarkdown(stressDoc);
  assert.equal(window.editorBridge.getEditorMode(), 'wysiwyg');
  let headingLines = dom.window.document.querySelectorAll('.cm-line.cm-heading');
  assert.ok(headingLines.length > 0, 'WYSIWYG mode renders .cm-heading line classes');
  const hasH1orH2 = Array.from(headingLines).some(l => l.classList.contains('cm-heading-1') || l.classList.contains('cm-heading-2'));
  assert.ok(hasH1orH2, 'WYSIWYG heading lines contain .cm-heading-1 or .cm-heading-2');

  // 2. Set custom --body-font-size and verify CSS rule calculations
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('var(--body-font-size, 16px)'), 'index.html calculates heading font-size relative to --body-font-size');

  // 3. Repeated mode restore assertion
  await assertRepeatedModeRestore(stressDoc, 'Markdown cheat sheet');
  await assertRepeatedModeRestore(mostlyPlainDoc, 'mostly plain-text document');

  // Clean up
  if (window.editorBridge && typeof window.editorBridge.destroy === 'function') {
    window.editorBridge.destroy();
  }
  process.exit(0);
});
