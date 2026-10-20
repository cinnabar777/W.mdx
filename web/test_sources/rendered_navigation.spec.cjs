const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>', { pretendToBeVisual: true });
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

Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
  get() { return 20; }
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
  get() { return 20; }
});

function getLineIndex(node) {
  let cur = node;
  while (cur && cur !== dom.window.document.body) {
    if (cur.classList && cur.classList.contains('cm-line')) {
      const allLines = Array.from(dom.window.document.querySelectorAll('.cm-line'));
      const idx = allLines.indexOf(cur);
      if (idx !== -1) return idx;
    }
    if (cur.parentElement && cur.parentElement.classList && cur.parentElement.classList.contains('cm-content')) {
      const children = Array.from(cur.parentElement.children);
      let lineCount = 0;
      for (const child of children) {
        if (child === cur) return lineCount;
        if (child.classList && child.classList.contains('cm-line')) {
          lineCount++;
        }
      }
    }
    cur = cur.parentNode || cur.parentElement;
  }
  return 0;
}

dom.window.document.elementFromPoint = function(x, y) {
  const lineIdx = Math.max(0, Math.min(Math.floor(y / 20), dom.window.document.querySelectorAll('.cm-line').length - 1));
  const lines = dom.window.document.querySelectorAll('.cm-line');
  return lines[lineIdx] || lines[lines.length - 1] || dom.window.document.body;
};

dom.window.document.caretRangeFromPoint = function(x, y) {
  const lineIdx = Math.max(0, Math.min(Math.floor(y / 20), dom.window.document.querySelectorAll('.cm-line').length - 1));
  const lines = dom.window.document.querySelectorAll('.cm-line');
  const line = lines[lineIdx] || lines[lines.length - 1];
  const range = dom.window.document.createRange();
  if (line) {
    range.setStart(line, 0);
    range.setEnd(line, 0);
  }
  return range;
};

dom.window.Range.prototype.getClientRects = function() {
  const lineIdx = getLineIndex(this.startContainer);
  const top = lineIdx * 20;
  return [{ top, bottom: top + 19.9, left: 0, right: 500, width: 500, height: 19.9, x: 0, y: top }];
};

dom.window.Range.prototype.getBoundingClientRect = function() {
  const lineIdx = getLineIndex(this.startContainer);
  const top = lineIdx * 20;
  return { top, bottom: top + 19.9, left: 0, right: 500, width: 500, height: 19.9, x: 0, y: top };
};

dom.window.HTMLElement.prototype.getBoundingClientRect = function() {
  const lineIdx = getLineIndex(this);
  const top = lineIdx * 20;
  return { top, bottom: top + 19.9, left: 0, right: 500, width: 500, height: 19.9, x: 0, y: top };
};

const {
  EditorState,
  EditorView,
  cursorLineDown,
  cursorLineUp,
  markdown,
  livePreviewPlugin
} = require('../src/main.js');

test('Rendered EditorView caret navigation traverses all lines up and down without skipping', () => {
  const linesArray = [
    'First paragraph',
    '',
    '**Bold line**',
    '# Heading 1',
    '## Heading 2',
    '* List item 1',
    '1. Ordered item 1',
    '> [!info] Callout Title',
    '> Callout body text',
    '> > [!todo] Nested Callout',
    '```javascript',
    'const x = 1;',
    'console.log(x);',
    '```',
    '---',
    'Paragraph ending with a link [Google](https://google.com)',
    '* List item with a link [Example](https://example.com)',
    'Last paragraph'
  ];

  const sampleDoc = linesArray.join('\n');
  const state = EditorState.create({
    doc: sampleDoc,
    extensions: [
      markdown(),
      livePreviewPlugin
    ]
  });

  const view = new EditorView({ state, parent: document.getElementById('editor') });

  // 1. Test Downward Caret Navigation
  const visitedLinesDown = [];
  view.dispatch({ selection: { anchor: 0, head: 0 } });
  visitedLinesDown.push(view.state.doc.lineAt(view.state.selection.main.head).number);

  for (let i = 1; i < linesArray.length; i++) {
    cursorLineDown(view);
    const lineNum = view.state.doc.lineAt(view.state.selection.main.head).number;
    visitedLinesDown.push(lineNum);
  }

  const expectedDown = linesArray.map((_, idx) => idx + 1);
  assert.deepStrictEqual(visitedLinesDown, expectedDown, 'cursorLineDown must visit every line sequentially without skipping');

  // 2. Test Upward Caret Navigation
  const visitedLinesUp = [];
  let endLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  visitedLinesUp.push(endLine);

  for (let i = 1; i < linesArray.length; i++) {
    cursorLineUp(view);
    const lineNum = view.state.doc.lineAt(view.state.selection.main.head).number;
    visitedLinesUp.push(lineNum);
  }

  const expectedUp = [...expectedDown].reverse();
  assert.deepStrictEqual(visitedLinesUp, expectedUp, 'cursorLineUp must visit every line in reverse sequentially without skipping');
});
