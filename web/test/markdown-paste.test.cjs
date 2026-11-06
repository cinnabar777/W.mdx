const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { JSDOM } = require('jsdom');

let markdownBlockquotePaste;
let quoteMultilinePaste;
let quotePasteInsertionRange;
let EditorState;
let markdown;
let EditorView;

before(async () => {
  const [pasteModule, stateModule, markdownModule, viewModule] = await Promise.all([
    import('../src/markdownPaste.mjs'),
    import('@codemirror/state'),
    import('@codemirror/lang-markdown'),
    import('@codemirror/view')
  ]);
  markdownBlockquotePaste = pasteModule.markdownBlockquotePaste;
  quoteMultilinePaste = pasteModule.quoteMultilinePaste;
  quotePasteInsertionRange = pasteModule.quotePasteInsertionRange;
  EditorState = stateModule.EditorState;
  markdown = markdownModule.markdown;
  EditorView = viewModule.EditorView;
});

test('multiline paste preserves explicit and nested blockquote context', () => {
  const doc = '> what is this\n> ';
  const state = EditorState.create({
    doc,
    extensions: [markdown()]
  });
  const pasted = '- First\n  - Second\n    - Third';

  assert.equal(
    quoteMultilinePaste(state, doc.length, doc.length, pasted),
    '- First\n>   - Second\n>     - Third'
  );

  const nestedDoc = '> outer\n> > ';
  const nestedState = EditorState.create({
    doc: nestedDoc,
    extensions: [markdown()]
  });
  assert.equal(
    quoteMultilinePaste(
      nestedState,
      nestedDoc.length,
      nestedDoc.length,
      'First\nSecond'
    ),
    'First\n> > Second'
  );
});

test('paste before a trailing quote marker inserts after the marker', () => {
  const doc = '> quote\n> ';
  const state = EditorState.create({ doc, extensions: [markdown()] });
  const blankQuoteLine = state.doc.line(2);
  const range = quotePasteInsertionRange(
    state,
    blankQuoteLine.from,
    blankQuoteLine.from
  );
  const pasted = quoteMultilinePaste(
    state,
    range.from,
    range.to,
    'First\nSecond'
  );

  assert.deepEqual(range, { from: doc.length, to: doc.length });
  assert.equal(
    doc.slice(0, range.from) + pasted + doc.slice(range.to),
    '> quote\n> First\n> Second'
  );
});

test('pasted list keeps a separator after a quote marker without trailing space', () => {
  const doc = '> quote\n>';
  const state = EditorState.create({ doc, extensions: [markdown()] });
  const blankQuoteLine = state.doc.line(2);
  const range = quotePasteInsertionRange(
    state,
    blankQuoteLine.from,
    blankQuoteLine.from
  );
  const pasted = quoteMultilinePaste(
    state,
    range.from,
    range.to,
    '- First\n  - Second'
  );

  assert.equal(
    doc.slice(0, range.from) + pasted + doc.slice(range.to),
    '> quote\n> - First\n>   - Second'
  );
});

test('native paste event adds quote markers to continuation lines', () => {
  const dom = new JSDOM('<div id="editor"></div>', {
    pretendToBeVisual: true
  });
  const globals = [
    'window', 'document', 'MutationObserver', 'ResizeObserver',
    'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
    'HTMLElement', 'Node'
  ];
  const previous = new Map(
    globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  );
  const window = dom.window;
  Object.assign(globalThis, {
    window,
    document: window.document,
    MutationObserver: window.MutationObserver,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
    HTMLElement: window.HTMLElement,
    Node: window.Node
  });

  let view;
  try {
    const doc = '> quote\n> ';
    view = new EditorView({
      parent: window.document.querySelector('#editor'),
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length - 2 },
        extensions: [markdown(), markdownBlockquotePaste]
      })
    });
    const clipboardText = '- First\n  - Second\n    - Third';
    const event = new window.Event('paste', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: type => type === 'text/plain' ? clipboardText : '' }
    });

    view.contentDOM.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(
      view.state.doc.toString(),
      '> quote\n> - First\n>   - Second\n>     - Third'
    );

    const nestedNumbers = [
      '1. Parent',
      '   2. Child',
      '   3. Next child',
      '      4. Grandchild',
      '      5. Next grandchild',
      '   6. Third child',
      '7. Next parent'
    ].join('\n');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '' },
      selection: { anchor: 0 }
    });
    const numberedPasteEvent = new window.Event('paste', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(numberedPasteEvent, 'clipboardData', {
      value: {
        getData: type => type === 'text/plain' ? nestedNumbers : ''
      }
    });
    view.contentDOM.dispatchEvent(numberedPasteEvent);

    assert.equal(numberedPasteEvent.defaultPrevented, true);
    assert.equal(
      view.state.doc.toString(),
      [
        '1. Parent',
        '   1. Child',
        '   2. Next child',
        '      1. Grandchild',
        '      2. Next grandchild',
        '   3. Third child',
        '2. Next parent'
      ].join('\n')
    );

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
      selection: { anchor: doc.length }
    });
    window.AndroidNative = { readClipboard: () => 'Alpha\nBeta' };
    const androidPasteEvent = new window.Event('paste', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(androidPasteEvent, 'clipboardData', {
      value: { getData: () => '' }
    });

    view.contentDOM.dispatchEvent(androidPasteEvent);

    assert.equal(androidPasteEvent.defaultPrevented, true);
    assert.equal(view.state.doc.toString(), '> quote\n> Alpha\n> Beta');

    const blankQuoteDoc = '> quote\n>';
    const blankQuoteLine = EditorState.create({
      doc: blankQuoteDoc,
      extensions: [markdown()]
    }).doc.line(2);
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: blankQuoteDoc
      },
      selection: { anchor: blankQuoteLine.from }
    });
    window.AndroidNative.readClipboard = () => '- First\n  - Second';
    const keyboardPasteEvent = new window.KeyboardEvent('keydown', {
      key: 'v',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });

    view.contentDOM.dispatchEvent(keyboardPasteEvent);

    assert.equal(keyboardPasteEvent.defaultPrevented, true);
    assert.equal(
      view.state.doc.toString(),
      '> quote\n> - First\n>   - Second'
    );

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: blankQuoteDoc
      },
      selection: { anchor: blankQuoteLine.from }
    });
    const imePasteEvent = new window.InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'Alpha\nBeta',
      bubbles: true,
      cancelable: true
    });

    view.contentDOM.dispatchEvent(imePasteEvent);

    assert.equal(imePasteEvent.defaultPrevented, true);
    assert.equal(view.state.doc.toString(), '> quote\n> Alpha\n> Beta');

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: blankQuoteDoc
      },
      selection: { anchor: blankQuoteLine.from }
    });
    const inputHandlers = view.state.facet(EditorView.inputHandler);
    const simulateTextInput = text => {
      const { from, to } = view.state.selection.main;
      const defaultInsert = () => view.state.update({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        userEvent: 'input.type'
      });
      const handled = inputHandlers.some(handler => handler(
        view,
        from,
        to,
        text,
        defaultInsert
      ));
      if (!handled) view.dispatch(defaultInsert());
    };

    simulateTextInput('- First');
    simulateTextInput('\n');
    simulateTextInput('  - Second');
    simulateTextInput('\n');
    simulateTextInput('    - Third');

    assert.equal(
      view.state.doc.toString(),
      '> quote\n> - First\n>   - Second\n>     - Third'
    );
  } finally {
    view?.destroy();
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('multiline paste outside a blockquote keeps its original text', () => {
  const doc = 'ordinary paragraph';
  const state = EditorState.create({ doc, extensions: [markdown()] });
  assert.equal(
    quoteMultilinePaste(state, doc.length, doc.length, 'First\nSecond'),
    'First\nSecond'
  );
});

test('quote-like text in a fenced code block is not treated as a quote', () => {
  const doc = '```\n> code\n```';
  const position = doc.indexOf('code') + 2;
  const state = EditorState.create({ doc, extensions: [markdown()] });
  assert.equal(
    quoteMultilinePaste(state, position, position, 'First\nSecond'),
    'First\nSecond'
  );
});
