const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
  <div id="editor-container">
    <div id="editor"></div>
  </div>
  <div id="fast-scrollbar-track"><div id="fast-scrollbar-thumb"></div></div>
  <div id="toc-panel"><div id="toc-overlay"></div><div id="toc-content"></div></div>
</body>
</html>
`, {
  pretendToBeVisual: true,
  url: 'https://wmdx.test/',
  beforeParse(window) {
    window.AndroidNative = {
      onHostReady: () => {},
      onEditorReady: () => {},
      reportDiagnostic: () => {},
      reportNavigationTrace: () => {},
      reportNavigationTraceBatch: () => {}
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
if (!global.Range.prototype.getClientRects) {
  global.Range.prototype.getClientRects = function() { return []; };
}
if (!global.Range.prototype.getBoundingClientRect) {
  global.Range.prototype.getBoundingClientRect = function() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; };
}
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

if (!dom.window.Element.prototype.getBoundingClientRect) {
  dom.window.Element.prototype.getBoundingClientRect = function() {
    return { top: 0, bottom: 500, left: 0, right: 300, width: 300, height: 500 };
  };
}

const main = require('../src/main.js');

test('Repeated mode switches do not accumulate event listeners or leak disposed views', async () => {
  let reportedTraces = [];
  dom.window.AndroidNative.reportNavigationTrace = (traceJson) => {
    reportedTraces.push(JSON.parse(traceJson));
  };

  await dom.window.editorBridge.setEditorMode('wysiwyg');
  assert.ok(dom.window.editorBridge, 'Editor bridge ready');

  for (let i = 0; i < 5; i++) {
    await dom.window.editorBridge.setEditorMode('live_preview');
    await dom.window.editorBridge.setEditorMode('source');
    await dom.window.editorBridge.setEditorMode('wysiwyg');
  }

  reportedTraces = [];
  dom.window.dispatchEvent(new dom.window.Event('blur'));
  dom.window.dispatchEvent(new dom.window.Event('scroll'));

  assert.strictEqual(reportedTraces.length, 0, 'Disposed adapters do not emit traces');
});

test('Ordinary edits update decorations incrementally without rebuilding unrelated lines', async () => {
  await dom.window.editorBridge.setEditorMode('wysiwyg');

  const lineCount = 500;
  const lines = Array.from({ length: lineCount }, (_, i) => `Line ${i + 1}: Paragraph content text.`);
  lines[10] = '# Heading on line 11';
  lines[100] = '```javascript\nconsole.log("code block");\n```';
  lines[200] = '| A | B |\n|---|---|\n| 1 | 2 |';
  lines[300] = '> [!note] Callout Title\n> Body of callout';

  const docText = lines.join('\n');
  dom.window.editorBridge.setMarkdown(docText);

  const activeAdapter = dom.window.editorBridge.activeAdapter;
  assert.ok(activeAdapter && activeAdapter.view, 'Active adapter view present');
  const view = activeAdapter.view;
  const persistentLayoutField = main.persistentLayoutField;

  const layoutBefore = view.state.field(persistentLayoutField);
  assert.ok(layoutBefore.size > 0, 'Layout decorations populated');

  const line250Pos = view.state.doc.line(250).from;
  view.dispatch({
    changes: { from: line250Pos + 5, insert: ' inserted text' }
  });

  const layoutAfter = view.state.field(persistentLayoutField);
  assert.strictEqual(layoutAfter.size, layoutBefore.size, 'Decoration count preserved across incremental edit');

  let checkedOutsideCount = 0;
  layoutAfter.between(0, view.state.doc.line(200).to, (from, to, value) => {
    checkedOutsideCount++;
  });
  assert.ok(checkedOutsideCount > 0, 'Unchanged decorations mapped directly');
});
