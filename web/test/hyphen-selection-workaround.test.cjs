const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('hyphen handle detection is limited to paragraph-start selections with auto hyphens', async () => {
  const {
    isHyphenHandleBugProneRange,
    isRangeStartAtParagraphStart
  } = await import('../src/hyphenSelectionWorkaround.js');
  const dom = new JSDOM(`
    <div class="cm-paragraph" style="hyphens: auto">first\u00adhyphen appears later</div>
    <div class="cm-paragraph" style="hyphens: auto">first generated hyphen appears later</div>
    <div class="cm-paragraph" style="hyphens: none">ordinary paragraph</div>
  `);
  const [hyphenated, generated, ordinary] =
    dom.window.document.querySelectorAll('.cm-paragraph');
  const hyphenatedText = hyphenated.firstChild;
  const generatedText = generated.firstChild;
  const ordinaryText = ordinary.firstChild;
  const hyphenatedRange = dom.window.document.createRange();
  hyphenatedRange.setStart(hyphenatedText, 0);
  hyphenatedRange.setEnd(hyphenatedText, 5);
  const generatedRange = dom.window.document.createRange();
  generatedRange.setStart(generatedText, 0);
  generatedRange.setEnd(generatedText, 5);
  const ordinaryRange = dom.window.document.createRange();
  ordinaryRange.setStart(ordinaryText, 0);
  ordinaryRange.setEnd(ordinaryText, 4);

  assert.equal(isRangeStartAtParagraphStart(hyphenatedRange), true);
  assert.equal(isHyphenHandleBugProneRange(hyphenatedRange), true);
  dom.window.Range.prototype.getClientRects = () => [
    { left: 0, width: 48, top: 10, height: 16 },
    { left: 48, width: 8, top: 10, height: 16 }
  ];
  assert.equal(isHyphenHandleBugProneRange(generatedRange), true);
  assert.equal(isHyphenHandleBugProneRange(ordinaryRange), false);

  const nonInitialRange = dom.window.document.createRange();
  nonInitialRange.setStart(hyphenatedText, 6);
  nonInitialRange.setEnd(hyphenatedText, 12);
  assert.equal(isHyphenHandleBugProneRange(nonInitialRange), false);
  dom.window.close();
});

test('generated-hyphen detection requires a narrow adjacent text fragment', async () => {
  const { hasTrailingHyphenRectPattern } = await import('../src/hyphenSelectionWorkaround.js');
  const rect = (left, width) => ({
    left,
    width,
    top: 10,
    height: 16
  });

  assert.equal(
    hasTrailingHyphenRectPattern([rect(0, 40), rect(40, 8)], 16),
    true
  );
  assert.equal(
    hasTrailingHyphenRectPattern([rect(0, 40), rect(40, 12)], 16),
    false
  );
  assert.equal(
    hasTrailingHyphenRectPattern([rect(0, 40), rect(44, 8)], 16),
    false
  );
});

test('selection repair restores the original anchor only when it jumped outside the range', async () => {
  const { repairJumpedSelectionRange } = await import('../src/hyphenSelectionWorkaround.js');
  const dom = new JSDOM('<div class="cm-paragraph">first rest</div>');
  const text = dom.window.document.querySelector('.cm-paragraph').firstChild;
  const selection = dom.window.getSelection();
  const jumpedRange = dom.window.document.createRange();
  jumpedRange.setStart(text, 6);
  jumpedRange.setEnd(text, 10);
  selection.addRange(jumpedRange);

  const repaired = repairJumpedSelectionRange(selection, text, 0);
  assert.ok(repaired);
  assert.equal(repaired.toString(), 'first rest');
  assert.equal(repaired.startOffset, 0);

  const alreadyCorrectRange = dom.window.document.createRange();
  alreadyCorrectRange.setStart(text, 0);
  alreadyCorrectRange.setEnd(text, 5);
  selection.removeAllRanges();
  selection.addRange(alreadyCorrectRange);
  assert.equal(repairJumpedSelectionRange(selection, text, 0), null);
  dom.window.close();
});

test('Android WebView gets draggable app handles only for the affected selection', async () => {
  const { installHyphenSelectionWorkaround } = await import('../src/hyphenSelectionWorkaround.js');
  const dom = new JSDOM('<div id="editor-container"><div class="cm-editor"><div class="cm-paragraph" style="hyphens: auto">first\u00adhyphen later</div></div></div>', {
    pretendToBeVisual: true
  });
  Object.defineProperty(dom.window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/147.0 Mobile'
  });
  const doc = dom.window.document;
  const root = doc.querySelector('#editor-container');
  const editor = doc.querySelector('.cm-editor');
  const text = doc.querySelector('.cm-paragraph').firstChild;
  root.getBoundingClientRect = () => ({ left: 0, top: 0 });

  const makeSelection = (anchor, head) => ({
    main: {
      anchor,
      head,
      from: Math.min(anchor, head),
      to: Math.max(anchor, head),
      empty: anchor === head
    }
  });
  const view = {
    dom: editor,
    scrollDOM: editor,
    state: { selection: makeSelection(0, 0) },
    posAtDOM: (_node, offset) => offset,
    posAtCoords: ({ x }) => Math.round(x),
    coordsAtPos: position => ({ left: position * 10, bottom: 20 }),
    dispatch({ selection }) {
      this.state.selection = selection;
      const range = doc.createRange();
      range.setStart(text, selection.main.from);
      range.setEnd(text, selection.main.to);
      const domSelection = dom.window.getSelection();
      domSelection.removeAllRanges();
      domSelection.addRange(range);
    }
  };
  const selectionApi = {
    range: (anchor, head) => makeSelection(anchor, head)
  };
  const cleanup = installHyphenSelectionWorkaround(view, selectionApi);
  assert.ok(cleanup);

  const pointerEvent = (type, values = {}) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(event, key, { value });
    }
    return event;
  };
  editor.dispatchEvent(pointerEvent('pointerdown', {
    pointerType: 'touch',
    pointerId: 1
  }));
  const initialRange = doc.createRange();
  initialRange.setStart(text, 0);
  initialRange.setEnd(text, 5);
  dom.window.getSelection().removeAllRanges();
  dom.window.getSelection().addRange(initialRange);
  doc.dispatchEvent(new dom.window.Event('selectionchange'));
  dom.window.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 }));
  await new Promise(resolve => dom.window.setTimeout(resolve, 100));

  const layer = root.querySelector('.wmdx-hyphen-selection-handle-layer');
  assert.ok(layer);
  assert.equal(layer.hidden, false);
  const anchorHandle = layer.querySelector('[data-selection-endpoint="anchor"]');
  anchorHandle.dispatchEvent(pointerEvent('pointerdown', {
    button: 0,
    pointerId: 2
  }));
  dom.window.dispatchEvent(pointerEvent('pointermove', {
    pointerId: 2,
    clientX: 2,
    clientY: 20
  }));
  assert.equal(view.state.selection.main.anchor, 2);
  assert.equal(view.state.selection.main.head, 5);
  dom.window.dispatchEvent(pointerEvent('pointerup', { pointerId: 2 }));

  cleanup.destroy();
  assert.equal(root.querySelector('.wmdx-hyphen-selection-handle-layer'), null);
  dom.window.close();
});
