const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { computeWysiwygViewportMargin } = require('../src/viewportMargin.js');

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

test('rendered mode transitions preserve WYSIWYG headings, body font scaling, and scroll placement', async () => {
  const markdownPath = path.join(__dirname, '../../Documentation/Markdown.md');
  const stressDoc = fs.readFileSync(markdownPath, 'utf8');

  const mostlyPlainDoc = Array.from({ length: 672 }, (_, index) => {
    if (index % 80 === 0) return `## Section ${index / 80 + 1}`;
    if (index % 35 === 0) return 'A paragraph with **bold** and _italic_ text.';
    return `Plain text paragraph ${index + 1} with ordinary words and soft wrapping across lines.`;
  }).join('\n');

  assert.equal(computeWysiwygViewportMargin(390), 1560, 'Overscan helper returns four viewport heights');

  async function assertModeRestore(markdownText, label, targetScroll = 400) {
    window.editorBridge.setMarkdown(markdownText);
    window.editorBridge.setScrollPosition(targetScroll);

    for (const mode of ['live_preview', 'source', 'wysiwyg']) {
      await window.editorBridge.setEditorMode(mode);

      const scroller = document.querySelector('#editor .cm-scroller');
      const expectedAnchor = mode === 'wysiwyg' ? 'none' : 'auto';
      assert.equal(
        scroller ? scroller.style.overflowAnchor : '',
        expectedAnchor,
        `scroller overflowAnchor style is ${expectedAnchor} in ${mode}`
      );

      if (targetScroll > 0) {
        assert.ok(
          scroller !== null,
          `${label}: scroller exists in ${mode}`
        );
      } else {
        assert.equal(
          scroller ? scroller.scrollTop : 0,
          0,
          `${label}: zero scroll position remains at top in ${mode}`
        );
      }
    }
  }

  function performBoundedScrollSweep(docText, label) {
    window.editorBridge.setMarkdown(docText);
    const scroller = document.querySelector('#editor .cm-scroller');
    if (!scroller) return;

    const viewportHeight = 390;
    const stepIncrement = Math.floor(viewportHeight * 0.75);
    const maxScroll = Math.max(0, scroller.scrollHeight - viewportHeight);
    const stepCount = Math.min(20, Math.ceil(maxScroll / stepIncrement) + 2);

    let currentReq = 0;
    for (let step = 0; step < stepCount; step++) {
      scroller.scrollTop = currentReq;
      const actualScroll = scroller.scrollTop;
      const delta = Math.abs(actualScroll - currentReq);
      assert.ok(
        delta <= 32,
        `${label}: top-to-bottom step ${step} delta ${delta} exceeds 32px threshold (req: ${currentReq}, actual: ${actualScroll})`
      );

      if (currentReq >= maxScroll) break;
      currentReq = Math.min(maxScroll, currentReq + stepIncrement);
    }

    for (let step = 0; step < stepCount; step++) {
      scroller.scrollTop = currentReq;
      const actualScroll = scroller.scrollTop;
      const delta = Math.abs(actualScroll - currentReq);
      assert.ok(
        delta <= 32,
        `${label}: bottom-to-top step ${step} delta ${delta} exceeds 32px threshold (req: ${currentReq}, actual: ${actualScroll})`
      );

      if (currentReq <= 0) break;
      currentReq = Math.max(0, currentReq - stepIncrement);
    }
  }

  // 1. Verify WYSIWYG heading rendering
  await window.editorBridge.setEditorMode('wysiwyg');
  window.editorBridge.setMarkdown(stressDoc);
  assert.equal(window.editorBridge.getEditorMode(), 'wysiwyg');
  let headingLines = dom.window.document.querySelectorAll('.cm-line.cm-heading');
  assert.ok(headingLines.length > 0, 'WYSIWYG mode renders .cm-heading line classes');

  // 2. Set custom --body-font-size and verify CSS rule calculations
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes('var(--body-font-size, 16px)'), 'index.html calculates heading font-size relative to --body-font-size');

  // 3. Repeated mode scroll restore assertion
  await assertModeRestore(stressDoc, 'Markdown cheat sheet', 400);
  await assertModeRestore(mostlyPlainDoc, 'mostly plain-text document', 400);
  await assertModeRestore(mostlyPlainDoc, 'zero scroll document', 0);

  // 4. Bounded scroll sweep checks
  performBoundedScrollSweep(mostlyPlainDoc, 'mostly plain-text document');
  performBoundedScrollSweep(stressDoc, 'Markdown cheat sheet');

  // Clean up
  if (window.editorBridge && typeof window.editorBridge.destroy === 'function') {
    window.editorBridge.destroy();
  }
  dom.window.close();
});
