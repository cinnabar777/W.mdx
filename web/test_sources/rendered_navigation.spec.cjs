const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="editor"></div></body></html>', { pretendToBeVisual: true });
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
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = TestResizeObserver;
dom.window.ResizeObserver = TestResizeObserver;

Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
  get() { return 20; }
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
  get() { return 20; }
});

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

dom.window.HTMLElement.prototype.getClientRects = function() {
  const lineIdx = getLineIndex(this);
  const top = lineIdx * 20;
  return [{ top, bottom: top + 19.9, left: 0, right: 500, width: 500, height: 19.9, x: 0, y: top }];
};

dom.window.HTMLElement.prototype.getBoundingClientRect = function() {
  const lineIdx = getLineIndex(this);
  const top = lineIdx * 20;
  return { top, bottom: top + 19.9, left: 0, right: 500, width: 500, height: 19.9, x: 0, y: top };
};

const {
  EditorState,
  EditorView,
  markdown,
  livePreviewPlugin,
  hiddenSyntaxAtomicRanges,
  renderedRowNavigationKeymap,
  moveByRenderedRow,
  updateTableDocumentSelection
} = require('../src/main.js');

function assertCaretOutsideHiddenSyntax(view, direction) {
  const hiddenRanges = [];
  const plugin = view.plugin(livePreviewPlugin);
  if (!plugin || !plugin.hiddenSyntaxRanges) return;
  plugin.hiddenSyntaxRanges.between(
    0,
    view.state.doc.length,
    (from, to) => hiddenRanges.push([from, to])
  );

  const head = view.state.selection.main.head;
  const hiddenRange = hiddenRanges.find(([from, to]) => head > from && head < to);
  assert.equal(
    hiddenRange,
    undefined,
    `Arrow${direction} left the caret inside hidden syntax`
  );
}

test('Rendered EditorView caret navigation traverses markdown formatting document sequentially', () => {
  const linesArray = [
    '**EXAMPLES:**',
    '',
    '# HEADING ONE',
    '',
    '## HEADING TWO',
    '### HEADING THREE',
    '#### HEADING FOUR',
    '##### HEADING FIVE',
    '###### HEADING SIX',
    '',
    '',
    '~~Strikethrough~~ = ~~strikethrough~~',
    '',
    '## UNDERLINE',
    '',
    '<u>Underline</u> = _underline_',
    '',
    '## LINE BREAKS',
    '',
    'A long paragraph that wraps onto multiple visual rows in the Android editor.'
  ];

  const sampleDoc = linesArray.join('\n');
  const state = EditorState.create({
    doc: sampleDoc,
    extensions: [
      markdown(),
      livePreviewPlugin,
      hiddenSyntaxAtomicRanges,
      renderedRowNavigationKeymap
    ]
  });

  const view = new EditorView({ state, parent: document.getElementById('editor') });

  // 1. Test Downward Caret Navigation
  const visitedLinesDown = [];
  view.dispatch({ selection: { anchor: 0, head: 0 } });
  visitedLinesDown.push(view.state.doc.lineAt(view.state.selection.main.head).number);

  for (let i = 1; i < linesArray.length; i++) {
    const moved = moveByRenderedRow(view, 1);
    assert.equal(moved, true, `ArrowDown step ${i} must succeed`);

    const lineNum = view.state.doc.lineAt(view.state.selection.main.head).number;
    visitedLinesDown.push(lineNum);
    assertCaretOutsideHiddenSyntax(view, 'Down');
  }

  const expectedDown = linesArray.map((_, idx) => idx + 1);
  assert.deepStrictEqual(visitedLinesDown, expectedDown, 'ArrowDown must visit every line sequentially without skipping');

  // Verify that HEADING FIVE (line 8) did not jump back to EXAMPLES (line 1)
  const headingFiveIndex = linesArray.indexOf('##### HEADING FIVE'); // 7 -> line 8
  assert.equal(visitedLinesDown[headingFiveIndex], 8, 'HEADING FIVE must be line 8');
  assert.notEqual(visitedLinesDown[headingFiveIndex + 1], 1, 'HEADING FIVE must not jump back to EXAMPLES');

  // 2. Test Upward Caret Navigation
  const visitedLinesUp = [];
  let endLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  visitedLinesUp.push(endLine);

  for (let i = 1; i < linesArray.length; i++) {
    const moved = moveByRenderedRow(view, -1);
    assert.equal(moved, true, `ArrowUp step ${i} must succeed`);

    const lineNum = view.state.doc.lineAt(view.state.selection.main.head).number;
    visitedLinesUp.push(lineNum);
    assertCaretOutsideHiddenSyntax(view, 'Up');
  }

  const expectedUp = [...expectedDown].reverse();
  assert.deepStrictEqual(visitedLinesUp, expectedUp, 'ArrowUp must visit every line in reverse sequentially without skipping');
});

test('row-fragment test gives one .cm-line two distinct Range.getClientRects fragments and exposes two rendered rows', () => {
  const lineEl = document.createElement('div');
  lineEl.className = 'cm-line';
  lineEl.textContent = 'Multi-line text fragment 1\nMulti-line text fragment 2';

  const mockDoc = {
    children: [lineEl]
  };

  const origSelectNodeContents = RangeProto.selectNodeContents;
  const origGetClientRects = RangeProto.getClientRects;

  RangeProto.selectNodeContents = function(node) {
    this._mockContainer = node;
  };

  RangeProto.getClientRects = function() {
    if (this._mockContainer === lineEl) {
      return [
        { top: 10, bottom: 30, height: 20, left: 0, right: 200, width: 200, x: 0, y: 10 },
        { top: 30, bottom: 50, height: 20, left: 0, right: 200, width: 200, x: 0, y: 30 }
      ];
    }
    return origGetClientRects.call(this);
  };

  try {
    const view = {
      contentDOM: mockDoc,
      dom: { isConnected: true }
    };

    // Extract rendered visual rows logic directly
    const rows = [];
    const lineElements = Array.from(view.contentDOM.children)
      .filter(element => element.classList?.contains('cm-line'));

    for (const line of lineElements) {
      const range = lineEl.ownerDocument.createRange();
      range.selectNodeContents(line);
      const fragments = Array.from(range.getClientRects()).filter(rect => rect.height > 0);

      const addFragment = rect => {
        let row = rows.find(candidate => {
          if (candidate.element !== line) return false;
          const overlap = Math.min(candidate.bottom, rect.bottom) - Math.max(candidate.top, rect.top);
          return overlap > 0 || Math.abs(candidate.center - (rect.top + rect.bottom) / 2) <= 1;
        });

        if (!row) {
          row = {
            element: line,
            top: rect.top,
            bottom: rect.bottom,
            center: (rect.top + rect.bottom) / 2
          };
          rows.push(row);
          return;
        }

        row.top = Math.min(row.top, rect.top);
        row.bottom = Math.max(row.bottom, rect.bottom);
        row.center = (row.top + row.bottom) / 2;
      };

      if (fragments.length) {
        for (const rect of fragments) addFragment(rect);
      }
    }

    assert.equal(rows.length, 2, 'One .cm-line with two distinct client rects must generate two rendered rows');
    assert.equal(rows[0].top, 10);
    assert.equal(rows[1].top, 30);
  } finally {
    RangeProto.selectNodeContents = origSelectNodeContents;
    RangeProto.getClientRects = origGetClientRects;
  }
});

test('document selection highlights a rendered table only while a range crosses it', () => {
  const root = document.createElement('div');
  const table = document.createElement('div');
  table.className = 'cm-wp-table-container';
  table.dataset.tableFrom = '10';
  table.dataset.tableTo = '30';
  root.appendChild(table);

  const view = {
    dom: root,
    state: {
      selection: {
        ranges: [{ from: 0, to: 40, empty: false }]
      }
    }
  };

  updateTableDocumentSelection(view);
  assert.equal(table.classList.contains('cm-document-selection'), true);

  view.state.selection.ranges = [{ from: 20, to: 20, empty: true }];
  updateTableDocumentSelection(view);
  assert.equal(table.classList.contains('cm-document-selection'), false);
});
