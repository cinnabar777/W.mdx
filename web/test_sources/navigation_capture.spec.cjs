const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { setupFullNavigationCapture } = require('../src/navigationCapture.js');

function makeView() {
  const dom = new JSDOM(`
    <div class="cm-scroller">
      <div class="cm-content">
        <div class="cm-line">first paragraph</div>
        <div class="cm-line cm-list-item">- list entry</div>
        <div class="cm-line cm-heading">## Section</div>
        <div class="cm-line">last paragraph</div>
      </div>
    </div>
  `, { pretendToBeVisual: true, url: 'https://wmdx.test/' });
  const win = dom.window;
  const editor = win.document.querySelector('.cm-scroller');
  const content = win.document.querySelector('.cm-content');
  const rows = Array.from(win.document.querySelectorAll('.cm-line'));
  const lineTexts = rows.map((row) => row.textContent);
  let head = 0;
  const offsets = [0];
  for (const text of lineTexts) offsets.push(offsets.at(-1) + text.length + 1);
  const doc = {
    length: offsets.at(-1) - 1,
    lines: lineTexts.length,
    line(number) {
      const from = offsets[number - 1];
      const text = lineTexts[number - 1];
      return { number, from, to: from + text.length, text };
    },
    lineAt(position) {
      let number = 1;
      while (number < lineTexts.length && offsets[number] <= position) number++;
      return this.line(number);
    }
  };
  const selection = {
    get main() {
      const line = doc.lineAt(head);
      return {
        anchor: head,
        head,
        from: head,
        to: head,
        empty: true,
        get headLine() { return line.number; }
      };
    },
    ranges: [{ from: head, to: head }]
  };
  Object.defineProperties(editor, {
    scrollHeight: { configurable: true, value: 800 },
    scrollWidth: { configurable: true, value: 400 },
    clientHeight: { configurable: true, value: 400 },
    clientWidth: { configurable: true, value: 400 }
  });
  editor.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, right: 400, bottom: 400, left: 0, width: 400, height: 400
  });
  content.getBoundingClientRect = editor.getBoundingClientRect;

  const view = {
    dom: editor,
    contentDOM: content,
    scrollDOM: editor,
    hasFocus: true,
    state: { doc, get selection() { return selection; } },
    coordsAtPos(position) {
      const line = doc.lineAt(position);
      const top = (line.number - 1) * 20;
      return { top, bottom: top + 20, left: 12, right: 13 };
    },
    domAtPos(position) {
      const line = doc.lineAt(position);
      return { node: rows[line.number - 1].firstChild, offset: 0 };
    }
  };
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') head = Math.min(doc.length, head + 18);
    if (event.key === 'ArrowUp') head = Math.max(0, head - 18);
  });
  win.AndroidNative = {
    batches: [],
    snapshots: [],
    reportNavigationTraceBatch(payload) {
      this.batches.push(JSON.parse(payload));
    },
    captureDiagnosticSnapshot(reason) {
      this.snapshots.push(reason);
    }
  };
  return { dom, win, editor, view };
}

test('full navigation capture records every key, pointer, scroll, and selection event in ordered batches', async () => {
  const { dom, win, editor, view } = makeView();
  const stop = setupFullNavigationCapture(view);

  editor.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
  editor.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
  editor.dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
  editor.dispatchEvent(new win.Event('pointermove', { bubbles: true }));
  editor.dispatchEvent(new win.Event('pointerup', { bubbles: true }));
  editor.dispatchEvent(new win.Event('scroll', { bubbles: true }));
  editor.dispatchEvent(new win.Event('wheel', { bubbles: true }));
  dom.window.document.dispatchEvent(new win.Event('selectionchange'));

  await new Promise((resolve) => win.setTimeout(resolve, 180));
  stop();

  const records = win.AndroidNative.batches.flat();
  const kinds = records.map((record) => record.kind);
  for (const kind of [
    'capture_started',
    'key_down',
    'key_up',
    'key_result',
    'pointerdown',
    'pointermove',
    'pointerup',
    'scroll',
    'wheel',
    'selectionchange'
  ]) {
    assert.ok(kinds.includes(kind), `expected captured ${kind}`);
  }
  assert.deepEqual(records.map((record) => record.seq), [...records.map((record) => record.seq)].sort((a, b) => a - b));
  assert.equal(records.find((record) => record.kind === 'key_down').state.docLines, 4);
  assert.equal(records.find((record) => record.kind === 'key_down').state.selection.headLineText, 'first paragraph');
  assert.ok(records.some((record) => record.state.selection.renderedRow));
  dom.window.close();
});

test('capture batches more than one native bridge payload without dropping pointer samples', async () => {
  const { dom, win, editor, view } = makeView();
  const stop = setupFullNavigationCapture(view);
  for (let index = 0; index < 95; index++) {
    editor.dispatchEvent(new win.Event('pointermove', { bubbles: true }));
  }
  stop();
  await new Promise((resolve) => win.setTimeout(resolve, 150));
  const batches = win.AndroidNative.batches;
  assert.ok(batches.length >= 3, `expected multiple batches, got ${batches.length}`);
  assert.equal(batches.flat().filter((record) => record.kind === 'pointermove').length, 95);
  dom.window.close();
});
